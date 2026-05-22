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
const lock_1 = require("../lib/lock");
const logging_1 = require("../lib/logging");
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
    switch (event.type) {
        case 'payment.completed':
        case 'payment.reconciled':
            await handlePaymentEvent(event);
            break;
        case 'recovery.reminder.sent':
            await handleReminderEvent(event);
            break;
        case 'invoice.overdue':
            await handleOverdueEvent(event);
            break;
        default:
            console.log(`[OutboxWorker] Unhandled event type: ${event.type}`);
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
}
async function handleReminderEvent(event) {
    console.log(`[OutboxWorker] Reminder sent: ${event.entityId}`);
}
async function handleOverdueEvent(event) {
    console.log(`[OutboxWorker] Invoice overdue: ${event.entityId}`);
}
//# sourceMappingURL=outbox.js.map