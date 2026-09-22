import { AuthorityRuntime } from './lib/authority/authority-runtime'
import { recoveryCapabilities } from './lib/authority/recovery-capabilities'
import { invoiceCapabilities } from './lib/authority/invoice-capabilities'
import { reconciliationCapabilities } from './lib/authority/reconciliation-capabilities'
import { tenantCapabilities } from './lib/authority/tenant-capabilities'
import { gstrCapabilities } from './lib/authority/gstr-capabilities'
import { supabaseAdmin } from './lib/billzo/supabase-admin'
import {
  DEFAULT_WEBHOOK_BATCH_SIZE,
  DEFAULT_WEBHOOK_INTERVAL_MS,
  startWebhookInboxDrain,
} from './lib/webhook/inbox-drain'
import type { WebhookInboxDrainHandle } from './lib/webhook/inbox-drain'
import {
  DEFAULT_WEBHOOK_ALERT_INTERVAL_MS,
  startWebhookInboxHealthWatch,
} from './lib/webhook/inbox-alerts'
import type { WebhookAlertWatchHandle } from './lib/webhook/inbox-alerts'
import type { AuthorityRuntimeConfig } from './lib/authority/authority-runtime'

const CAPABILITY_PROVIDERS = [
  ...recoveryCapabilities,
  ...invoiceCapabilities,
  ...reconciliationCapabilities,
  ...tenantCapabilities,
  ...gstrCapabilities,
]

const GATEWAY_PORT = Number(process.env.AUTHORITY_GATEWAY_PORT ?? process.env.PORT ?? '10000')

let webhookDrain: WebhookInboxDrainHandle | null = null
let webhookAlerts: WebhookAlertWatchHandle | null = null

async function tenantPlanLookup(tenantId: string): Promise<string | undefined> {
  try {
    const { data } = await supabaseAdmin.from('tenants').select('plan').eq('id', tenantId).maybeSingle()
    return data?.plan ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Hardened env parsing: an absent, non-numeric, or out-of-bounds value falls
 * back to `fallback` — the drain never runs with NaN/negative/absurd tuning.
 * Fails closed to a sane bounded default rather than producing an invalid
 * runtime value.
 */
function boundedInt(raw: string | undefined, fallback: number, bounds: { min: number; max: number }): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  const floored = Math.floor(n)
  if (floored < bounds.min || floored > bounds.max) return fallback
  return floored
}

async function boot(): Promise<void> {
  const runtime = new AuthorityRuntime()

  const config: AuthorityRuntimeConfig = {
    supabaseAdmin: supabaseAdmin as unknown as AuthorityRuntimeConfig['supabaseAdmin'],
    redisRateLimitStore: null,
    tenantPlanLookup,
    capabilityProviders: CAPABILITY_PROVIDERS,
    requiredCapabilities: CAPABILITY_PROVIDERS.map((c) => c.capabilityId),
    bootstrapCreatedBy: 'billzo-worker:index',
    gatewayPort: GATEWAY_PORT,
    databaseUrl: process.env.AUTHORITY_DATABASE_URL ?? process.env.DATABASE_URL,
  }

  await runtime.initialize(config)
  await runtime.activate(config)

  // Durable webhook ingest consumer (Step 3 + G2): claims webhook_inbox rows
  // that the frontend route durably upserts. Periodic no-overlap poll;
  // interval defaults to 10s, batch to 25. Tuning env vars fail closed.
  // Activation kill switch: the drain is OFF unless explicitly enabled, so a
  // routine deploy can never start consuming inbox rows by accident.
  const drainEnabled = process.env.WEBHOOK_DRAIN_ENABLED === 'true'
  if (drainEnabled) {
    webhookDrain = startWebhookInboxDrain({
      intervalMs: boundedInt(
        process.env.WEBHOOK_DRAIN_INTERVAL_MS,
        DEFAULT_WEBHOOK_INTERVAL_MS,
        { min: 1_000, max: 3_600_000 },
      ),
      batchSize: boundedInt(process.env.WEBHOOK_DRAIN_BATCH_SIZE, DEFAULT_WEBHOOK_BATCH_SIZE, {
        min: 1,
        max: 500,
      }),
    })
    console.log('[worker] webhook inbox drain RUNNING (periodic poll)')
  } else {
    console.log('[worker] webhook inbox drain DISABLED (set WEBHOOK_DRAIN_ENABLED=true to enable)')
  }

  // Webhook inbox health watch: operator alerting (migration 101). Deliberately
  // INDEPENDENT of the drain above - it must keep running while the drain is
  // switched off (rollback) so queue health stays observable. Defaults ON;
  // retires itself if the webhook_inbox relation is missing (100/101 pending).
  if (process.env.WEBHOOK_ALERTS_ENABLED !== 'false') {
    webhookAlerts = startWebhookInboxHealthWatch({
      intervalMs: boundedInt(
        process.env.WEBHOOK_ALERT_INTERVAL_MS,
        DEFAULT_WEBHOOK_ALERT_INTERVAL_MS,
        { min: 5_000, max: 3_600_000 },
      ),
    })
    console.log('[worker] webhook inbox health watch RUNNING (periodic alerts)')
  } else {
    console.log('[worker] webhook inbox health watch DISABLED (set WEBHOOK_ALERTS_ENABLED=true to enable)')
  }

  console.log(`[worker] authority runtime RUNNING (phase=${runtime.orchestrator.currentPhase}, gateway=:${GATEWAY_PORT})`)
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] received ${signal}, shutting down`)
  webhookDrain?.stop()
  webhookDrain = null
  webhookAlerts?.stop()
  webhookAlerts = null
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

boot().catch((err) => {
  console.error('[worker] boot failed:', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})