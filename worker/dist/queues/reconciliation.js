"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReconciliationWorker = createReconciliationWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
const lock_1 = require("../lib/lock");
const logging_1 = require("../lib/logging");
function createReconciliationWorker() {
    const connection = (0, redis_1.createRedisConnection)();
    const worker = new bullmq_1.Worker('reconciliation', async (job) => {
        const startTime = Date.now();
        const { invoiceId, tenantId, paymentData } = job.data;
        try {
            const lockKey = `reconciliation:${invoiceId}:${paymentData?.providerPaymentId}`;
            const result = await (0, lock_1.withLock)(lockKey, 60000, async () => {
                console.log(`[ReconciliationWorker] Processing payment for invoice ${invoiceId}`);
                return { reconciled: true, invoiceId };
            });
            if (!result) {
                return { skipped: true, reason: 'lock_not_acquired' };
            }
            const duration = Date.now() - startTime;
            (0, logging_1.logWorkerEvent)({
                tenant_id: tenantId,
                entity_id: invoiceId,
                queue_name: 'reconciliation',
                attempt: job.attemptsMade,
                status: 'success',
                duration_ms: duration,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Payment reconciled for invoice ${invoiceId}`,
            });
            return result;
        }
        catch (err) {
            (0, logging_1.logWorkerError)(err, {
                tenant_id: tenantId,
                entity_id: invoiceId,
                queue_name: 'reconciliation',
                attempt: job.attemptsMade,
                duration_ms: Date.now() - startTime,
                status: 'failed',
                message: `Failed to reconcile payment for invoice ${invoiceId}`,
            });
            throw err;
        }
    }, {
        connection,
        concurrency: 5,
    });
    worker.on('completed', (job) => {
        console.log(`[ReconciliationWorker] Job ${job.id} completed:`, job.returnvalue);
    });
    worker.on('failed', (job, err) => {
        console.error(`[ReconciliationWorker] Job ${job?.id} failed:`, err.message);
    });
    return worker;
}
//# sourceMappingURL=reconciliation.js.map