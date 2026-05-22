"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logWorkerEvent = logWorkerEvent;
exports.logWorkerError = logWorkerError;
function logWorkerEvent(entry) {
    console.log(JSON.stringify(entry));
}
function logWorkerError(error, context) {
    const entry = {
        tenant_id: context.tenant_id || 'unknown',
        queue_name: context.queue_name || 'unknown',
        attempt: context.attempt || 0,
        status: 'failed',
        duration_ms: context.duration_ms || 0,
        timestamp: new Date().toISOString(),
        level: 'error',
        message: error.message,
        metadata: {
            stack: error.stack,
            ...context.metadata,
        },
    };
    console.error(JSON.stringify(entry));
}
//# sourceMappingURL=logging.js.map