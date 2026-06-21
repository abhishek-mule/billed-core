"use strict";
// ============================================================
// Spine — Canonical Event Spine Types & Invariants
// ============================================================
// This is the "physics layer" of BillZo.
// Every event in the system MUST satisfy this contract.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.realClock = exports.VALID_SOURCE_SYSTEMS = exports.VALID_ENTITY_TYPES = void 0;
exports.uuidv7 = uuidv7;
exports.uuidv7Timestamp = uuidv7Timestamp;
exports.validateSpineEventInput = validateSpineEventInput;
exports.inferEntityType = inferEntityType;
exports.createDomainContext = createDomainContext;
// ----------------------------------------------------------
// UUID v7 generator — time-sortable unique identifiers
// https://www.rfc-editor.org/rfc/rfc9562#name-uuid-version-7
// ----------------------------------------------------------
function uuidv7() {
    const ms = Date.now();
    const tsHex = ms.toString(16).padStart(12, '0');
    const rand1 = Math.floor(Math.random() * 0x1000);
    const rand2 = Math.floor(Math.random() * 0x1000);
    const rand3hi = Math.floor(Math.random() * 0x100000000);
    const rand3lo = Math.floor(Math.random() * 0x10000);
    const rand3 = ((rand3hi >>> 0).toString(16).padStart(8, '0')
        + (rand3lo >>> 0).toString(16).padStart(4, '0'));
    return `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-7${rand1.toString(16).padStart(3, '0')}-8${rand2.toString(16).padStart(3, '0')}-${rand3}`;
}
function uuidv7Timestamp(uuid) {
    return parseInt(uuid.replace(/-/g, '').slice(0, 12), 16);
}
// ----------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------
exports.VALID_ENTITY_TYPES = [
    'invoice', 'customer', 'payment', 'recovery_case', 'tenant', 'product', 'whatsapp_message', 'unknown',
];
exports.VALID_SOURCE_SYSTEMS = [
    'worker', 'api', 'webhook', 'cron', 'client', 'system',
];
function validateSpineEventInput(input) {
    const errors = [];
    if (!input || typeof input !== 'object') {
        errors.push({ field: 'root', message: 'Input must be an object' });
        return errors;
    }
    const obj = input;
    if (!obj.entity_type || !exports.VALID_ENTITY_TYPES.includes(obj.entity_type)) {
        errors.push({ field: 'entity_type', message: `Must be one of: ${exports.VALID_ENTITY_TYPES.join(', ')}` });
    }
    if (!obj.entity_id || typeof obj.entity_id !== 'string') {
        errors.push({ field: 'entity_id', message: 'Must be a non-empty string' });
    }
    if (obj.causal_id !== undefined && obj.causal_id !== null && typeof obj.causal_id !== 'string') {
        errors.push({ field: 'causal_id', message: 'Must be a string or null' });
    }
    if (obj.correlation_id !== undefined && obj.correlation_id !== null && typeof obj.correlation_id !== 'string') {
        errors.push({ field: 'correlation_id', message: 'Must be a string' });
    }
    if (!obj.source_system || !exports.VALID_SOURCE_SYSTEMS.includes(obj.source_system)) {
        errors.push({ field: 'source_system', message: `Must be one of: ${exports.VALID_SOURCE_SYSTEMS.join(', ')}` });
    }
    if (!obj.idempotency_key || typeof obj.idempotency_key !== 'string') {
        errors.push({ field: 'idempotency_key', message: 'Must be a non-empty string' });
    }
    if (obj.payload !== undefined && obj.payload !== null && typeof obj.payload !== 'object') {
        errors.push({ field: 'payload', message: 'Must be an object or null' });
    }
    if (obj.external_refs !== undefined && obj.external_refs !== null && typeof obj.external_refs !== 'object') {
        errors.push({ field: 'external_refs', message: 'Must be an object or null/undefined' });
    }
    return errors;
}
// ----------------------------------------------------------
// Entity type inference from event type string
// ----------------------------------------------------------
function inferEntityType(eventType) {
    if (eventType.startsWith('invoice.'))
        return 'invoice';
    if (eventType.startsWith('payment.'))
        return 'payment';
    if (eventType.startsWith('recovery.'))
        return 'recovery_case';
    if (eventType.startsWith('customer.'))
        return 'customer';
    if (eventType.startsWith('tenant.'))
        return 'tenant';
    if (eventType.startsWith('product.') || eventType.startsWith('inventory.'))
        return 'product';
    if (eventType.startsWith('whatsapp.'))
        return 'whatsapp_message';
    return 'unknown';
}
exports.realClock = {
    now: () => new Date().toISOString(),
};
function createDomainContext() {
    return { clock: exports.realClock };
}
//# sourceMappingURL=spine.js.map