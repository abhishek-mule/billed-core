"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRemindersWorker = createRemindersWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
const lock_1 = require("../lib/lock");
const logging_1 = require("../lib/logging");
function createRemindersWorker() {
    const connection = (0, redis_1.createRedisConnection)();
    const worker = new bullmq_1.Worker('reminders', async (job) => {
        const startTime = Date.now();
        const { invoiceId, tenantId, stage } = job.data;
        try {
            const lockKey = `reminder:${invoiceId}:${stage}`;
            const result = await (0, lock_1.withLock)(lockKey, 60000, async () => {
                console.log(`[RemindersWorker] Sending ${stage} reminder for invoice ${invoiceId}`);
                return { sent: true, invoiceId, stage };
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
        }
        catch (err) {
            (0, logging_1.logWorkerError)(err, {
                tenant_id: tenantId,
                entity_id: invoiceId,
                queue_name: 'reminders',
                attempt: job.attemptsMade,
                duration_ms: Date.now() - startTime,
                status: 'failed',
                message: `Failed to send reminder: ${stage}`,
            });
            throw err;
        }
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
//# sourceMappingURL=reminders.js.map