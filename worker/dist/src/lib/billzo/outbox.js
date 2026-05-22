"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeOutboxEvent = writeOutboxEvent;
exports.pollOutboxEvents = pollOutboxEvents;
exports.markEventProcessing = markEventProcessing;
exports.markEventCompleted = markEventCompleted;
exports.markEventFailed = markEventFailed;
exports.getOutboxEvent = getOutboxEvent;
exports.getOutboxEventsByCorrelation = getOutboxEventsByCorrelation;
exports.cleanupCompletedEvents = cleanupCompletedEvents;
const supabase_admin_1 = require("./supabase-admin");
const crypto_1 = require("crypto");
/**
 * Write an event to the outbox table.
 * Should be called within the same transaction as the business state write.
 * Returns the outbox event ID.
 */
async function writeOutboxEvent(options) {
    const { type, tenantId, entityId = null, payload = null, causationId = null, correlationId = (0, crypto_1.randomUUID)(), idempotencyKey = null, version = 1, } = options;
    const { data, error } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .insert({
        type,
        tenant_id: tenantId,
        entity_id: entityId,
        payload,
        causation_id: causationId,
        correlation_id: correlationId,
        idempotency_key: idempotencyKey,
        version,
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
        attempts: 0,
    })
        .select('id')
        .single();
    if (error) {
        console.error('[Outbox] Failed to write event:', error);
        throw new Error(`Outbox write failed: ${error.message}`);
    }
    return data.id;
}
/**
 * Poll pending outbox events for processing.
 * Returns events that are ready for processing (status = 'pending' AND next_attempt_at <= now).
 */
async function pollOutboxEvents(limit = 50) {
    const { data, error } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .select('*')
        .eq('status', 'pending')
        .lte('next_attempt_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(limit);
    if (error) {
        console.error('[Outbox] Failed to poll events:', error);
        return [];
    }
    return (data || []).map(mapOutboxRow);
}
/**
 * Mark an outbox event as processing.
 */
async function markEventProcessing(eventId) {
    const { error } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .update({
        status: 'processing',
        next_attempt_at: new Date().toISOString(),
    })
        .eq('id', eventId);
    if (error) {
        console.error('[Outbox] Failed to mark event processing:', error);
        return false;
    }
    return true;
}
/**
 * Mark an outbox event as completed.
 */
async function markEventCompleted(eventId) {
    const { data, error } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .select('attempts')
        .eq('id', eventId)
        .single();
    if (error) {
        console.error('[Outbox] Failed to fetch event for completion:', error);
        return false;
    }
    const { error: updateError } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .update({
        status: 'completed',
        attempts: (data?.attempts || 0) + 1,
    })
        .eq('id', eventId);
    if (updateError) {
        console.error('[Outbox] Failed to mark event completed:', updateError);
        return false;
    }
    return true;
}
/**
 * Mark an outbox event as failed with retry scheduling.
 */
async function markEventFailed(eventId, attempt, maxAttempts = 5) {
    if (attempt >= maxAttempts) {
        // Move to dead letter
        const { error } = await supabase_admin_1.supabaseAdmin
            .from('outbox')
            .update({
            status: 'dead_letter',
            attempts: attempt,
        })
            .eq('id', eventId);
        if (error) {
            console.error('[Outbox] Failed to mark event dead_letter:', error);
        }
        return { status: 'dead_letter', nextAttemptAt: '' };
    }
    // Schedule retry with exponential backoff
    const delayMs = Math.min(5000 * Math.pow(2, attempt), 600000); // Max 10 minutes
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    const { error } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .update({
        status: 'pending',
        attempts: attempt,
        next_attempt_at: nextAttemptAt,
    })
        .eq('id', eventId);
    if (error) {
        console.error('[Outbox] Failed to schedule retry:', error);
        return { status: 'dead_letter', nextAttemptAt: '' };
    }
    return { status: 'retry', nextAttemptAt };
}
/**
 * Get outbox event by ID.
 */
async function getOutboxEvent(eventId) {
    const { data, error } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .select('*')
        .eq('id', eventId)
        .single();
    if (error || !data)
        return null;
    return mapOutboxRow(data);
}
/**
 * Get outbox events by correlation ID (for tracing a recovery lifecycle).
 */
async function getOutboxEventsByCorrelation(correlationId) {
    const { data, error } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .select('*')
        .eq('correlation_id', correlationId)
        .order('created_at', { ascending: true });
    if (error || !data)
        return [];
    return data.map(mapOutboxRow);
}
/**
 * Clean up completed events older than specified hours.
 */
async function cleanupCompletedEvents(olderThanHours = 24) {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase_admin_1.supabaseAdmin
        .from('outbox')
        .delete()
        .eq('status', 'completed')
        .lt('created_at', cutoff)
        .select();
    if (error) {
        console.error('[Outbox] Failed to cleanup events:', error);
        return 0;
    }
    return data?.length || 0;
}
function mapOutboxRow(row) {
    return {
        id: row.id,
        causationId: row.causation_id,
        correlationId: row.correlation_id,
        type: row.type,
        version: row.version,
        tenantId: row.tenant_id,
        entityId: row.entity_id,
        payload: row.payload,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        createdAt: row.created_at,
        nextAttemptAt: row.next_attempt_at,
        attempts: row.attempts,
    };
}
//# sourceMappingURL=outbox.js.map