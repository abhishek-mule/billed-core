"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOutboxWorker = createOutboxWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
const outbox_1 = require("../src/lib/billzo/outbox");
const supabase_admin_1 = require("../src/lib/billzo/supabase-admin");
const lock_1 = require("../lib/lock");
const logging_1 = require("../lib/logging");
const baileys_socket_1 = require("../lib/baileys-socket");
const notifications_1 = require("../src/lib/billzo/notifications");
const engagement_1 = require("../src/lib/billzo/engagement");
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
function createOutboxWorker() {
    const connection = (0, redis_1.createRedisConnection)();
    const worker = new bullmq_1.Worker('outbox', async (job) => {
        const startTime = Date.now();
        try {
            const events = await (0, outbox_1.pollOutboxEvents)(50);
            if (events.length === 0) {
                return { processed: 0 };
            }
            let processed = 0;
            for (const event of events) {
                const eventStartTime = Date.now();
                const lockKey = `outbox:${event.id}`;
                const result = await (0, lock_1.withLock)(lockKey, 30000, async () => {
                    await (0, outbox_1.markEventProcessing)(event.id);
                    try {
                        await processOutboxEvent(event);
                        await (0, outbox_1.markEventCompleted)(event.id);
                        const duration = Date.now() - eventStartTime;
                        (0, logging_1.logWorkerEvent)({
                            event_id: event.id,
                            tenant_id: event.tenantId,
                            entity_id: event.entityId,
                            correlation_id: event.correlationId,
                            queue_name: 'outbox',
                            attempt: event.attempts,
                            status: 'success',
                            duration_ms: duration,
                            timestamp: new Date().toISOString(),
                            level: 'info',
                            message: `Processed event: ${event.type}`,
                        });
                        return true;
                    }
                    catch (err) {
                        const duration = Date.now() - eventStartTime;
                        (0, logging_1.logWorkerError)(err, {
                            event_id: event.id,
                            tenant_id: event.tenantId,
                            entity_id: event.entityId,
                            queue_name: 'outbox',
                            attempt: event.attempts,
                            duration_ms: duration,
                            message: `Failed to process event: ${event.type}`,
                        });
                        await (0, outbox_1.markEventFailed)(event.id, event.attempts + 1);
                        return false;
                    }
                });
                if (result !== null) {
                    processed++;
                }
            }
            return { processed };
        }
        catch (err) {
            (0, logging_1.logWorkerError)(err, {
                tenant_id: 'unknown',
                queue_name: 'outbox',
                attempt: 0,
                duration_ms: Date.now() - startTime,
                status: 'failed',
                message: 'Outbox worker error',
            });
            throw err;
        }
    }, {
        connection,
        concurrency: 5,
    });
    worker.on('completed', (job) => {
        console.log(`[OutboxWorker] Job ${job.id} completed:`, job.returnvalue);
    });
    worker.on('failed', (job, err) => {
        console.error(`[OutboxWorker] Job ${job?.id} failed:`, err.message);
    });
    return worker;
}
async function processOutboxEvent(event) {
    // Isolated projection handlers — each catches its own errors
    // so a failure in one concern does not block others.
    const projections = [
        tryHandleTransportProjection,
        tryHandleAttribution,
        tryHandleEscalation,
        tryHandleRecoveryCaseProjection,
        tryHandleNotifications,
        tryHandleBaileysLifecycle,
        tryHandleRedisPublish,
    ];
    for (const projection of projections) {
        try {
            await projection(event);
        }
        catch (err) {
            console.error(`[Outbox] Projection ${projection.name} failed for ${event.type}:`, err.message);
        }
    }
}
// ============================================================
// RECOVERY CASE PROJECTION — Invoice collection behavioral entity
// ============================================================
async function tryHandleRecoveryCaseProjection(event) {
    // Create recovery case on first reminder; update activity timestamp on subsequent events
    if (event.type === 'whatsapp.status.updated' || event.type === 'recovery.reminder.sent') {
        const invoiceId = event.entityId;
        const tenantId = event.tenantId;
        if (!invoiceId || !tenantId)
            return;
        const { data: invoice } = await supabase_admin_1.supabaseAdmin
            .from('invoices')
            .select('customer_id, total')
            .eq('id', invoiceId)
            .single();
        if (!invoice || !invoice.customer_id)
            return;
        const now = new Date().toISOString();
        // Find existing open recovery case for this tenant + customer
        const { data: existing } = await supabase_admin_1.supabaseAdmin
            .from('recovery_cases')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('customer_id', invoice.customer_id)
            .eq('status', 'open')
            .limit(1)
            .single();
        if (existing) {
            await supabase_admin_1.supabaseAdmin
                .from('recovery_cases')
                .update({ last_activity_at: now, updated_at: now })
                .eq('id', existing.id);
        }
        else {
            await supabase_admin_1.supabaseAdmin
                .from('recovery_cases')
                .insert({
                tenant_id: tenantId,
                customer_id: invoice.customer_id,
                status: 'open',
                total_outstanding: invoice.total || 0,
                invoice_count: 1,
                last_activity_at: now,
            });
        }
    }
}
// ============================================================
// 1. TRANSPORT PROJECTION — WhatsApp status → invoice state
// ============================================================
async function tryHandleTransportProjection(event) {
    if (event.type === 'whatsapp.status.updated') {
        const state = await handleWhatsAppStatusUpdated(event);
        if (state && state.billzoMessageId) {
            await updateMessageProjection(state);
        }
    }
    if (event.type === 'whatsapp.upi_clicked') {
        await handleUpiClicked(event);
    }
}
// ============================================================
// 2. ATTRIBUTION — Payment → recovery attribution
// ============================================================
async function tryHandleAttribution(event) {
    if (event.type === 'payment.completed' || event.type === 'payment.reconciled') {
        await handlePaymentEvent(event);
    }
}
// ============================================================
// 3. ESCALATION — Recovery escalation signals
// ============================================================
async function tryHandleEscalation(event) {
    if (event.type === 'recovery.escalation.suggested') {
        await handleEscalationSuggested(event);
    }
    if (event.type === 'recovery.reminder.sent') {
        await handleReminderEvent(event);
    }
}
// ============================================================
// 4. NOTIFICATIONS — Push notifications
// ============================================================
async function tryHandleNotifications(event) {
    if (event.type === 'whatsapp.circuit_open') {
        await handleWhatsAppCircuitOpen(event);
    }
    if (event.type === 'invoice.overdue') {
        await handleOverdueEvent(event);
    }
}
// ============================================================
// 5. BAILEYS LIFECYCLE — Socket management
// ============================================================
async function tryHandleBaileysLifecycle(event) {
    if (event.type === 'whatsapp.pair.requested') {
        await handleWhatsAppPairRequested(event);
    }
    if (event.type === 'whatsapp.unpaired') {
        await handleWhatsAppUnpaired(event);
    }
}
// ============================================================
// 6. REDIS PUBLISH — Real-time pub/sub (best-effort)
// ============================================================
async function tryHandleRedisPublish(event) {
    // Redis publish is non-critical; already handled inline in each handler.
    // This is a placeholder for future pub/sub fan-out.
}
async function publishToRedis(tenantId, type, data) {
    try {
        const pub = (0, redis_1.createRedisConnection)();
        await pub.publish(`events:${tenantId}`, JSON.stringify({ type, data, timestamp: Date.now() }));
        pub.disconnect();
    }
    catch {
        // non-critical
    }
}
async function handlePaymentEvent(event) {
    const { attributeRecovery } = await Promise.resolve().then(() => __importStar(require('../src/lib/billzo/attribution')));
    const invoiceId = event.entityId;
    const tenantId = event.tenantId;
    if (!invoiceId || !tenantId)
        return;
    await attributeRecovery({
        invoiceId,
        tenantId,
        paymentId: event.payload?.paymentId,
        paymentTimestamp: event.createdAt,
    });
    await publishToRedis(tenantId, 'payment.completed', {
        invoiceId,
        amount: event.payload?.amount,
        provider: event.payload?.provider,
    });
}
async function handleReminderEvent(event) {
    console.log(`[OutboxWorker] Reminder sent: ${event.entityId}`);
    if (event.tenantId) {
        await publishToRedis(event.tenantId, 'recovery.reminder.sent', {
            invoiceId: event.entityId,
            stage: event.payload?.stage,
        });
    }
}
async function handleWhatsAppPairRequested(event) {
    const tenantId = event.tenantId;
    if (!tenantId)
        return;
    console.log(`[OutboxWorker] Starting Baileys pairing for tenant ${tenantId}`);
    await (0, baileys_socket_1.startBaileysSocket)(tenantId);
}
async function handleWhatsAppUnpaired(event) {
    const tenantId = event.tenantId;
    if (!tenantId)
        return;
    console.log(`[OutboxWorker] Disconnecting Baileys for tenant ${tenantId}`);
    await (0, baileys_socket_1.disconnectBaileys)(tenantId);
}
function mapStatusToProjection(status) {
    switch (status) {
        case 'queued':
            return { transportState: 'queued', deliveryHealth: 'healthy' };
        case 'sent':
            return { transportState: 'sent', deliveryHealth: 'healthy' };
        case 'server_ack':
            return { transportState: 'server_ack', deliveryHealth: 'healthy' };
        case 'delivered':
            return { transportState: 'delivered', deliveryHealth: 'healthy' };
        case 'received':
            return { transportState: 'received', deliveryHealth: 'healthy' };
        case 'read':
            return { transportState: 'read', deliveryHealth: 'healthy' };
        case 'failed':
            return { transportState: 'failed_terminal', deliveryHealth: 'retrying' };
        case 'rate_limited':
            return { transportState: 'sent', deliveryHealth: 'degraded' };
        default:
            return null;
    }
}
async function handleWhatsAppStatusUpdated(event) {
    const invoiceId = event.entityId;
    const tenantId = event.tenantId;
    const billzoMessageId = event.payload?.billzoMessageId;
    const status = event.payload?.status;
    const provider = event.payload?.provider || null;
    const providerMessageId = event.payload?.providerMessageId || null;
    if (!tenantId || !status)
        return null;
    if (billzoMessageId) {
        // Read latest event state from the append-only stream
        const { data: latest } = await supabase_admin_1.supabaseAdmin
            .from('whatsapp_events')
            .select('id, status, event_sequence, occurred_at')
            .eq('billzo_message_id', billzoMessageId)
            .order('event_sequence', { ascending: false })
            .limit(1)
            .single();
        if (latest) {
            const state = {
                billzoMessageId,
                latestStatus: latest.status,
                latestEventSequence: latest.event_sequence,
                latestOccurredAt: latest.occurred_at,
                provider,
                providerMessageId,
                invoiceId: invoiceId || null,
                tenantId,
                eventId: latest.id,
            };
            if (invoiceId) {
                await supabase_admin_1.supabaseAdmin
                    .from('invoices')
                    .update({
                    last_whatsapp_status: state.latestStatus,
                    last_whatsapp_at: state.latestOccurredAt,
                })
                    .eq('id', invoiceId);
            }
            // Publish to Redis for real-time subscribers
            await publishToRedis(tenantId, 'whatsapp.status.updated', {
                invoiceId,
                status: state.latestStatus,
                billzoMessageId,
            });
            return state;
        }
    }
    else {
        // Fallback: update invoice using status from payload (legacy events without billzoMessageId)
        if (invoiceId) {
            await supabase_admin_1.supabaseAdmin
                .from('invoices')
                .update({ last_whatsapp_status: status, last_whatsapp_at: new Date().toISOString() })
                .eq('id', invoiceId);
        }
        await publishToRedis(tenantId, 'whatsapp.status.updated', {
            invoiceId,
            status,
            billzoMessageId,
        });
    }
    return null;
}
// ============================================================
// MESSAGE PROJECTION — Fast read model for transport state
// ============================================================
async function updateMessageProjection(state) {
    if (!state.billzoMessageId)
        return;
    const mapping = mapStatusToProjection(state.latestStatus);
    if (!mapping)
        return;
    const { transportState, deliveryHealth } = mapping;
    const precedence = engagement_1.TRANSPORT_PRECEDENCE[transportState];
    const delivered = transportState === 'delivered' || transportState === 'read';
    const read = transportState === 'read';
    const failed = transportState === 'failed_terminal';
    const { error } = await supabase_admin_1.supabaseAdmin.rpc('cas_upsert_projection', {
        p_billzo_message_id: state.billzoMessageId,
        p_transport_state: transportState,
        p_delivery_health: deliveryHealth,
        p_transport_precedence: precedence,
        p_latest_event_sequence: state.latestEventSequence,
        p_causal_occurred_at: state.latestOccurredAt,
        p_last_event_id: state.eventId,
        p_delivered: delivered,
        p_read: read,
        p_failed: failed,
        p_delivered_at: delivered ? state.latestOccurredAt : null,
        p_read_at: read ? state.latestOccurredAt : null,
        p_failed_at: failed ? state.latestOccurredAt : null,
        p_provider: state.provider,
        p_provider_message_id: state.providerMessageId,
    });
    if (error) {
        console.error('[Projection] CAS RPC failed', {
            billzoMessageId: state.billzoMessageId,
            error,
        });
    }
}
async function handleWhatsAppCircuitOpen(event) {
    const tenantId = event.tenantId;
    if (!tenantId)
        return;
    console.log(`[OutboxWorker] Circuit opened for tenant ${tenantId}`);
    await (0, notifications_1.sendPushNotification)({
        tenantId,
        title: 'WhatsApp Disconnected',
        body: 'Reminders switched to backup provider. Reconnect in Settings to restore full automation.',
        type: 'whatsapp_alert',
        url: '/settings/whatsapp',
    });
    await publishToRedis(tenantId, 'whatsapp.circuit_open', { tenantId });
}
async function handleUpiClicked(event) {
    const invoiceId = event.entityId;
    const tenantId = event.tenantId;
    if (!tenantId)
        return;
    if (invoiceId) {
        const now = new Date().toISOString();
        await supabase_admin_1.supabaseAdmin
            .from('invoices')
            .update({ last_whatsapp_status: 'clicked_upi', last_whatsapp_at: now })
            .eq('id', invoiceId);
    }
    await publishToRedis(tenantId, 'whatsapp.upi_clicked', {
        invoiceId,
        amount: event.payload?.amount,
    });
}
async function handleEscalationSuggested(event) {
    const invoiceId = event.entityId;
    const tenantId = event.tenantId;
    if (!invoiceId || !tenantId)
        return;
    await supabase_admin_1.supabaseAdmin
        .from('invoices')
        .update({ recovery_flag: 'call_customer' })
        .eq('id', invoiceId);
    const { data: invoice } = await supabase_admin_1.supabaseAdmin
        .from('invoices')
        .select('total, customers!inner(name)')
        .eq('id', invoiceId)
        .single();
    const amount = invoice?.total || 0;
    const customerName = invoice?.customers?.name || 'Customer';
    await (0, notifications_1.sendPushNotification)({
        tenantId,
        title: `Call ${customerName} Now`,
        body: `₹${amount.toLocaleString('en-IN')} at risk — 3 reminders ignored. Call this customer.`,
        type: 'escalation',
        url: `/invoices/${invoiceId}`,
    });
    await publishToRedis(tenantId, 'recovery.escalation.suggested', {
        invoiceId,
        amount,
        customerName,
    });
}
async function handleOverdueEvent(event) {
    const invoiceId = event.entityId;
    const tenantId = event.tenantId;
    if (!invoiceId || !tenantId)
        return;
    const { data: invoice } = await supabase_admin_1.supabaseAdmin
        .from('invoices')
        .select('recovery_stage')
        .eq('id', invoiceId)
        .single();
    const stage = invoice?.recovery_stage || 't1_soft';
    const connection = (0, redis_1.createRedisConnection)();
    const queue = new bullmq_1.Queue('reminders', { connection });
    try {
        await queue.add(`reminder:${invoiceId}:${stage}`, { invoiceId, tenantId, stage }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 60000 },
        });
        console.log(`[OutboxWorker] Enqueued ${stage} reminder for overdue invoice ${invoiceId}`);
    }
    finally {
        await queue.close();
    }
}
//# sourceMappingURL=outbox.js.map