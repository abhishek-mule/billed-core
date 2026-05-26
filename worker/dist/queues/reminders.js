"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRemindersWorker = createRemindersWorker;
exports.createReminderQueue = createReminderQueue;
exports.enqueueOverdueReminders = enqueueOverdueReminders;
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
const supabase_admin_1 = require("../src/lib/billzo/supabase-admin");
const lock_1 = require("../lib/lock");
const logging_1 = require("../lib/logging");
const shared_1 = require("@billzo/shared");
const events_1 = require("../src/lib/billzo/events");
const idempotency_1 = require("../src/lib/billzo/idempotency");
const whatsapp_router_1 = require("../lib/whatsapp-router");
const baileys_socket_1 = require("../lib/baileys-socket");
const crypto_1 = require("../lib/crypto");
const shared_2 = require("@billzo/shared");
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
function buildMessage(stage, customerName, amount, businessName, upiId, tenantId, invoiceId) {
    const stageLabel = shared_2.STAGE_LABELS[stage];
    const amountText = `₹${amount.toLocaleString('en-IN')}`;
    const lines = [
        `Dear ${customerName},`,
        '',
        `This is a ${stageLabel} regarding your pending amount of ${amountText}.`,
        stage === 't5_warning'
            ? 'Please arrange payment immediately to avoid any further escalation.'
            : 'Please clear the dues at your earliest convenience.',
        '',
    ];
    if (upiId && tenantId && invoiceId) {
        const token = (0, crypto_1.signUpiToken)({
            invoiceId,
            tenantId,
            amount,
            upiId,
            exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
        lines.push(`Pay here: ${appUrl}/pay/r/${token}`);
        lines.push('');
    }
    else if (upiId) {
        lines.push(`Pay via UPI: upi://pay?pa=${encodeURIComponent(upiId)}&am=${amount}&pn=${encodeURIComponent(businessName)}`);
        lines.push('');
    }
    lines.push(`Regards,\n${businessName}`);
    return lines.join('\n');
}
const BAILEYS_HOURLY_LIMIT = 50;
const GUPSHUP_HOURLY_LIMIT = 100;
const BAILEYS_DAILY_WARMUP = 10;
const WARMUP_DAYS = 3;
async function checkRateLimit(tenantId, provider) {
    try {
        const redis = (0, redis_1.createRedisConnection)();
        const hourKey = `rate:${tenantId}:${new Date().toISOString().slice(0, 13).replace(/[^0-9]/g, '')}`;
        const count = await redis.incr(hourKey);
        if (count === 1)
            await redis.expire(hourKey, 3700);
        if (provider === 'baileys') {
            const warmupKey = `warmup:${tenantId}`;
            const warmupStart = await redis.get(warmupKey);
            if (warmupStart) {
                const daysSinceWarmup = (Date.now() - parseInt(warmupStart)) / (24 * 60 * 60 * 1000);
                if (daysSinceWarmup < WARMUP_DAYS) {
                    const dailyKey = `rate:daily:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
                    const dailyCount = await redis.incr(dailyKey);
                    if (dailyCount === 1)
                        await redis.expire(dailyKey, 90000);
                    if (dailyCount > BAILEYS_DAILY_WARMUP) {
                        redis.disconnect();
                        return false;
                    }
                }
            }
            else {
                await redis.set(warmupKey, Date.now().toString(), 'EX', 7 * 24 * 3600);
            }
            if (count > BAILEYS_HOURLY_LIMIT) {
                redis.disconnect();
                return false;
            }
        }
        else {
            if (count > GUPSHUP_HOURLY_LIMIT) {
                redis.disconnect();
                return false;
            }
        }
        redis.disconnect();
        return true;
    }
    catch {
        return true;
    }
}
function createRemindersWorker() {
    const connection = (0, redis_1.createRedisConnection)();
    const worker = new bullmq_1.Worker('reminders', async (job) => {
        const startTime = Date.now();
        const { invoiceId, tenantId, stage } = job.data;
        const lockKey = `reminder:${invoiceId}:${stage}`;
        const result = await (0, lock_1.withLock)(lockKey, 60000, async () => {
            console.log(`[RemindersWorker] Sending ${stage} reminder for invoice ${invoiceId}`);
            const [invoiceResult, tenantResult] = await Promise.all([
                supabase_admin_1.supabaseAdmin.from('invoices').select('*, customers!inner(*)').eq('id', invoiceId).single(),
                supabase_admin_1.supabaseAdmin.from('tenants').select('name, upi_id, whatsapp_config').eq('id', tenantId).single(),
            ]);
            if (invoiceResult.error || !invoiceResult.data) {
                throw new Error(`Invoice not found: ${invoiceResult.error?.message || invoiceId}`);
            }
            if (tenantResult.error || !tenantResult.data) {
                throw new Error(`Tenant not found: ${tenantResult.error?.message || tenantId}`);
            }
            const invoice = invoiceResult.data;
            const customer = invoice.customers;
            const tenant = tenantResult.data;
            const config = (tenant.whatsapp_config || {});
            const phoneNumber = customer?.whatsapp_number || customer?.phone;
            if (!phoneNumber) {
                console.log(`[RemindersWorker] No phone for customer ${customer?.id}, skipping`);
                return { skipped: true, reason: 'no_phone', invoiceId, stage };
            }
            const cleanPhone = phoneNumber.replace(/\D/g, '');
            const upiId = tenant.upi_id || config.upiId;
            const effectiveProvider = config.whatsappProvider === 'baileys' ? 'baileys' : 'gupshup';
            // Rate limit check
            const withinLimit = await checkRateLimit(tenantId, effectiveProvider);
            if (!withinLimit) {
                console.log(`[RemindersWorker] Rate limit hit for tenant ${tenantId}, requeueing ${stage} for ${invoiceId}`);
                const queue = new bullmq_1.Queue('reminders', { connection });
                await queue.add(`reminder:${invoiceId}:${stage}`, { invoiceId, tenantId, stage }, {
                    delay: 60000 + Math.floor(Math.random() * 120000),
                    attempts: 5,
                    backoff: { type: 'exponential', delay: 120000 },
                });
                await queue.close();
                return { skipped: true, reason: 'rate_limited', invoiceId, stage };
            }
            const message = buildMessage(stage, customer?.name || 'Customer', invoice.total || 0, tenant.name || 'BillZo', upiId, tenantId, invoiceId);
            if (effectiveProvider === 'baileys' && !(0, baileys_socket_1.isBaileysConnected)(tenantId)) {
                console.log(`[RemindersWorker] Starting Baileys socket for tenant ${tenantId}`);
                (0, baileys_socket_1.startBaileysSocket)(tenantId).catch((err) => console.error(`[RemindersWorker] Failed to start Baileys for ${tenantId}:`, err));
            }
            const sendResult = await (0, whatsapp_router_1.sendWhatsAppMessage)(tenantId, cleanPhone, message, {
                invoiceId,
                customerId: customer?.id || undefined,
                reminderStage: stage,
                attemptNumber: 1,
                amount: invoice.total || 0,
            });
            if (sendResult.error) {
                console.error(`[RemindersWorker] Send failed for invoice ${invoiceId}:`, sendResult.error);
            }
            const { identity } = sendResult;
            const eventStatus = sendResult.error ? 'failed' : 'queued';
            await supabase_admin_1.supabaseAdmin.from('whatsapp_events').insert({
                id: identity.billzoMessageId,
                billzo_message_id: identity.billzoMessageId,
                conversation_id: identity.conversationId,
                message_origin: identity.messageOrigin,
                event_sequence: Number(identity.eventSequence),
                transport_message_hash: identity.transportMessageHash,
                parent_billzo_message_id: identity.parentBillzoMessageId,
                attempt_number: identity.attemptNumber,
                reminder_stage: identity.reminderStage,
                tenant_id: tenantId,
                invoice_id: invoiceId,
                customer_id: customer?.id || null,
                phone: `+${cleanPhone}`,
                status: eventStatus,
                message_type: stage,
                direction: 'outbound',
                event_layer: 'transport',
                provider_message_id: sendResult.messageId,
                template: stage,
                recovery_stage: stage,
                occurred_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                sync_status: eventStatus === 'failed' ? 'failed' : 'pending',
                provider: sendResult.provider,
                error: sendResult.error || null,
            });
            const nextStage = (0, shared_2.getNextStage)(stage);
            await supabase_admin_1.supabaseAdmin.from('invoices').update({
                last_whatsapp_status: eventStatus,
                last_whatsapp_at: new Date().toISOString(),
                recovery_stage: nextStage,
                next_recovery_at: nextStage !== stage
                    ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
                    : null,
                sync_status: 'pending',
            }).eq('id', invoiceId);
            if (eventStatus !== 'failed') {
                await (0, events_1.emitRecoveryReminderSent)({
                    invoiceId,
                    tenantId,
                    customerId: customer?.id || '',
                    stage,
                    channel: 'whatsapp',
                    messageId: identity.billzoMessageId,
                });
            }
            // Escalation detection: after 3 ignored reminders with high amount
            if (eventStatus !== 'failed') {
                const { data: recentEvents } = await supabase_admin_1.supabaseAdmin
                    .from('whatsapp_events')
                    .select('status, created_at')
                    .eq('invoice_id', invoiceId)
                    .eq('tenant_id', tenantId)
                    .eq('direction', 'outbound')
                    .order('created_at', { ascending: false })
                    .limit(5);
                if (recentEvents && recentEvents.length >= 3) {
                    const allIgnored = recentEvents.slice(0, 3).every((e) => e.status === 'sent' || e.status === 'queued');
                    if (allIgnored) {
                        const { data: avgInvoice } = await supabase_admin_1.supabaseAdmin
                            .from('invoices')
                            .select('total')
                            .eq('tenant_id', tenantId)
                            .order('created_at', { ascending: false })
                            .limit(20);
                        const invoices = avgInvoice || [];
                        const avgAmount = invoices.length > 0
                            ? invoices.reduce((sum, i) => sum + (i.total || 0), 0) / invoices.length
                            : 1;
                        const amountRatio = (invoice.total || 0) / Math.max(avgAmount, 1);
                        const { data: customerRisk } = await supabase_admin_1.supabaseAdmin
                            .from('customers')
                            .select('risk_score')
                            .eq('id', customer?.id)
                            .single();
                        const riskScore = customerRisk?.risk_score || 0.5;
                        if (amountRatio > 2.5 && riskScore > 0.6) {
                            console.log(`[RemindersWorker] Escalation suggested for invoice ${invoiceId}`);
                            await (0, events_1.emitEvent)({
                                type: shared_1.EventType.RECOVERY_ESCALATION_SUGGESTED,
                                tenantId,
                                entityId: invoiceId,
                                payload: { amount: invoice.total, customerName: customer?.name },
                                causationId: null,
                                correlationId: (0, idempotency_1.generateCorrelationId)(invoiceId),
                                producer: 'worker',
                                idempotencyKey: `escalation:${invoiceId}:${new Date().toISOString().slice(0, 10)}`,
                                retentionDays: 90,
                            });
                        }
                    }
                }
            }
            if (sendResult.error) {
                throw new Error(sendResult.error);
            }
            console.log(`[RemindersWorker] ${stage} sent for invoice ${invoiceId} to ${cleanPhone} via ${sendResult.provider}`);
            return { sent: true, invoiceId, stage, status: eventStatus, messageId: identity.billzoMessageId, provider: sendResult.provider };
        });
        if (!result) {
            return { skipped: true, reason: 'lock_not_acquired' };
        }
        const duration = Date.now() - startTime;
        (0, logging_1.logWorkerEvent)({
            tenant_id: tenantId,
            entity_id: invoiceId,
            queue_name: 'reminders',
            attempt: job.attemptsMade,
            status: 'success',
            duration_ms: duration,
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Reminder sent: ${stage}`,
        });
        return result;
    }, {
        connection,
        concurrency: 10,
    });
    worker.on('completed', (job) => {
        console.log(`[RemindersWorker] Job ${job.id} completed:`, job.returnvalue);
    });
    worker.on('failed', (job, err) => {
        console.error(`[RemindersWorker] Job ${job?.id} failed:`, err.message);
    });
    return worker;
}
function createReminderQueue() {
    const connection = (0, redis_1.createRedisConnection)();
    return new bullmq_1.Queue('reminders', { connection });
}
async function enqueueOverdueReminders() {
    const now = new Date().toISOString();
    let enqueued = 0;
    const { data: invoices, error } = await supabase_admin_1.supabaseAdmin
        .from('invoices')
        .select('id, tenant_id, recovery_stage, next_recovery_at')
        .in('status', ['unpaid', 'overdue'])
        .lte('next_recovery_at', now)
        .limit(200);
    if (error || !invoices) {
        console.error('[RemindersWorker] Failed to fetch overdue invoices:', error?.message);
        return 0;
    }
    const queue = createReminderQueue();
    for (const inv of invoices) {
        const stage = (0, shared_2.normalizeStage)(inv.recovery_stage);
        if (!shared_2.REMINDER_STAGES.includes(stage))
            continue;
        await queue.add(`reminder:${inv.id}:${stage}`, {
            invoiceId: inv.id,
            tenantId: inv.tenant_id,
            stage,
        }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 60000 },
            delay: Math.floor(Math.random() * 30000) + 5000,
        });
        enqueued++;
    }
    await queue.close();
    console.log(`[RemindersWorker] Enqueued ${enqueued} overdue reminder jobs`);
    return enqueued;
}
//# sourceMappingURL=reminders.js.map