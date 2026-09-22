// ============================================================
// Webhook inbox consumer — per-event processor
// ============================================================
// Executes the frozen webhook domain pipeline for one claimed
// webhook_inbox row. This is the exact processEvent() logic that
// previously lived inline in the frontend route module (git HEAD
// mini_saas_frontend/src/app/api/whatsapp/webhook/route.ts) and was
// re-homed to @billzo/shared/whatsapp in Step 3.
//
// Boundaries (Step 3):
// - Consumes a claimed webhook_inbox payload (already de-duplicated,
//   normalized, sanitized) and applies the domain pipeline.
// - Resolves the tenant strictly via
//   phone_number_id -> whatsapp_connections -> tenant_id — never from
//   request/session/customer phone. An unresolved tenant records an
//   unattributed pilot_event and stops.
// - Every acknowledged branch records its pilot_event; a thrown error
//   propagates to the drain so the row is marked failed (Step 4 DLQ).
// ============================================================

import {
  createWhatsAppDomain,
  createWhatsAppServer,
  sanitizeRaw,
  textBody,
  tsToIso,
} from '@billzo/shared/whatsapp'
import type { NormalizedEvent } from '@billzo/shared/whatsapp'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface WebhookEventProcessor {
  (ev: NormalizedEvent, rawPayload?: unknown): Promise<void>
}

/**
 * Builds a single webhook event processor bound to the given supabase
 * client (worker's supabaseAdmin injected at store time). Frozen to HEAD's
 * route processEvent — do not "improve" the branch shape without a B-series
 * decision record.
 */
export function createWebhookEventProcessor(client: SupabaseClient): WebhookEventProcessor {
  const server = createWhatsAppServer(client)
  const domain = createWhatsAppDomain(client)

  return async function processWebhookEvent(ev: NormalizedEvent, rawPayload?: unknown): Promise<void> {
    // ── SECURITY BOUNDARY: resolve tenant strictly by phone_number_id ──
    const connection = await server.resolveTenantByPhoneNumberId(ev.phoneNumberId)

    if (!connection) {
      // Do NOT guess the tenant. Record the unattributed event and stop.
      console.warn('[WhatsAppWebhook] Unattributed event — unknown phone_number_id:', ev.phoneNumberId)
      await server.recordPilotEvent({
        phoneNumberId: ev.phoneNumberId,
        eventKind: 'unattributed_webhook',
        providerEventType: ev.eventType,
        providerMessageId: ev.messages?.[0]?.id ?? ev.statuses?.[0]?.id ?? null,
        attributionResult: 'unattributed',
        rawPayload: (rawPayload as Record<string, unknown>) ?? sanitizeRaw(ev),
      })
      return
    }

    const tenantId = connection.tenant_id

    if (ev.eventType === 'customer_message') {
      for (const msg of ev.messages ?? []) {
        const customerId = await domain.matchCustomer(tenantId, msg.from)
        // Normalize provider parent identity (Meta: message.context.id; Gupshup: contextId).
        const normalized = { ...msg, contextId: (msg as any).context?.id ?? msg.contextId ?? null }
        await domain.persistInboundWhatsAppEvent(tenantId, connection, normalized, customerId)
        await server.recordPilotEvent({
          tenantId,
          customerId,
          phoneNumberId: ev.phoneNumberId,
          eventKind: 'customer_replied',
          direction: 'inbound',
          providerMessageId: msg.id ?? null,
          providerEventType: 'message',
          providerStatus: 'received',
          attributionResult: customerId ? 'resolved' : 'customer_unmatched',
          stateAfter: {
            from: msg.from,
            type: msg.type,
            text: textBody(msg.text)?.slice(0, 300),
            repliedTo: normalized.contextId ?? null,
          },
          rawPayload: sanitizeRaw(msg),
          occurredAt: tsToIso(msg.timestamp),
        })
      }
      return
    }

    if (ev.eventType === 'merchant_echo') {
      for (const msg of ev.messages ?? []) {
        const customerId = await domain.matchCustomer(tenantId, msg.to)
        await domain.persistEchoWhatsAppEvent(tenantId, connection, msg, customerId)
        await server.recordPilotEvent({
          tenantId,
          customerId,
          phoneNumberId: ev.phoneNumberId,
          eventKind: 'merchant_app_reply',
          direction: 'outbound',
          providerMessageId: msg.id ?? null,
          providerEventType: 'smb_message_echoes',
          providerStatus: 'sent',
          attributionResult: customerId ? 'resolved' : 'customer_unmatched',
          stateAfter: {
            to: msg.to,
            type: msg.type,
            text: textBody(msg.text)?.slice(0, 300),
          },
          rawPayload: sanitizeRaw(msg),
          occurredAt: tsToIso(msg.timestamp),
        })
      }
      return
    }

    // status events: update the domain row, then trace
    for (const st of ev.statuses ?? []) {
      await domain.updateDeliveryStatus(tenantId, st)
      await server.recordPilotEvent({
        tenantId,
        phoneNumberId: ev.phoneNumberId,
        eventKind: 'message_status',
        direction: 'outbound',
        providerMessageId: st.id ?? null,
        providerEventType: 'message_status',
        providerStatus: st.status ?? null,
        stateAfter: { status: st.status, recipient: st.recipient_id },
        rawPayload: sanitizeRaw(st),
        occurredAt: tsToIso(st.timestamp),
      })
    }
  }
}