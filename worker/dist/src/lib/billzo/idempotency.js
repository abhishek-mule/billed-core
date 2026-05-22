"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyPatterns = void 0;
exports.checkIdempotency = checkIdempotency;
exports.recordProcessedJob = recordProcessedJob;
exports.executeIdempotent = executeIdempotent;
exports.generateCorrelationId = generateCorrelationId;
exports.generateSyncCorrelationId = generateSyncCorrelationId;
const supabase_admin_1 = require("./supabase-admin");
/**
 * Idempotency key patterns per domain.
 * Format: {domain}:{entityId}:{context}
 */
exports.IdempotencyPatterns = {
    // Payment reconciliation
    paymentReconcile: (invoiceId, provider, providerPaymentId) => `payment:reconcile:${invoiceId}:${provider}:${providerPaymentId}`,
    // Reminder sending
    reminderSent: (invoiceId, stage, dayBucket) => `reminder:sent:${invoiceId}:${stage}:${dayBucket}`,
    // WhatsApp message
    whatsappSent: (invoiceId, template, phone) => `whatsapp:sent:${invoiceId}:${template}:${phone}`,
    // Invoice creation
    invoiceCreated: (tenantId, customerId, timestamp) => `invoice:created:${tenantId}:${customerId}:${timestamp}`,
    // Payment link generation
    paymentLinkGenerated: (invoiceId) => `payment:link:${invoiceId}`,
    // Recovery attribution
    recoveryAttribution: (invoiceId, paymentId) => `recovery:attribution:${invoiceId}:${paymentId}`,
    // Experiment assignment
    experimentAssigned: (invoiceId, experimentType) => `experiment:assigned:${invoiceId}:${experimentType}`,
};
/**
 * Check if a job has already been processed (idempotency check).
 * Returns { isDuplicate: true, previousResult } if already processed.
 */
async function checkIdempotency(idempotencyKey) {
    const { data, error } = await supabase_admin_1.supabaseAdmin
        .from('processed_jobs')
        .select('status, result')
        .eq('idempotency_key', idempotencyKey)
        .single();
    if (error || !data) {
        return { isDuplicate: false };
    }
    return {
        isDuplicate: true,
        previousResult: data.result,
    };
}
/**
 * Record a job as processed.
 * Should be called AFTER successful job execution.
 */
async function recordProcessedJob(idempotencyKey, jobType, tenantId, status, result) {
    const { error } = await supabase_admin_1.supabaseAdmin
        .from('processed_jobs')
        .upsert({
        idempotency_key: idempotencyKey,
        job_type: jobType,
        tenant_id: tenantId,
        status,
        result: result || null,
        created_at: new Date().toISOString(),
    }, { onConflict: 'idempotency_key' });
    if (error) {
        console.error('[Idempotency] Failed to record processed job:', error);
        return false;
    }
    return true;
}
/**
 * Execute a job with idempotency guard.
 * If the job was already processed, returns the previous result.
 * Otherwise, executes the job and records the result.
 */
async function executeIdempotent(idempotencyKey, jobType, tenantId, executor) {
    // Check if already processed
    const { isDuplicate, previousResult } = await checkIdempotency(idempotencyKey);
    if (isDuplicate) {
        console.log('[Idempotency] Duplicate job detected, returning previous result:', idempotencyKey);
        return previousResult;
    }
    // Execute the job
    const result = await executor();
    // Record as processed
    await recordProcessedJob(idempotencyKey, jobType, tenantId, 'completed', result);
    return result;
}
/**
 * Generate a correlation ID for a recovery lifecycle.
 * All events in the same recovery journey share this ID.
 */
function generateCorrelationId(invoiceId) {
    return `recovery:${invoiceId}`;
}
/**
 * Generate a correlation ID for a sync operation.
 */
function generateSyncCorrelationId(tenantId, entityType, entityId) {
    return `sync:${tenantId}:${entityType}:${entityId}`;
}
//# sourceMappingURL=idempotency.js.map