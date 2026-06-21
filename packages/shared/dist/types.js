"use strict";
// ============================================================
// REMINDER STAGE — Operational cadence
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERPRETER_VERSION = exports.DECAY_HALF_LIVES = exports.DEFAULT_OPERATING_HOURS = exports.RECOVERY_ENGAGEMENT_STATES = exports.RECOVERY_STATES = exports.MESSAGE_ORIGINS = exports.STAGE_LABELS = exports.REMINDER_STAGES = void 0;
exports.normalizeStage = normalizeStage;
exports.getNextStage = getNextStage;
exports.generateBillzoMessageId = generateBillzoMessageId;
exports.generateEventSequence = generateEventSequence;
exports.computeTransportHash = computeTransportHash;
exports.isOverdue = isOverdue;
exports.REMINDER_STAGES = ['t0_soft', 't24_nudge', 't72_strong', 't5_warning'];
exports.STAGE_LABELS = {
    t0_soft: 'friendly reminder',
    t24_nudge: 'payment follow-up',
    t72_strong: 'urgent reminder',
    t5_warning: 'final notice',
};
// Legacy stage name mapping for backward compatibility with existing DB records.
// Old DB values → canonical ReminderStage
const LEGACY_STAGE_MAP = {
    t1_soft: 't0_soft',
    t2_firm: 't24_nudge',
    t3_urgent: 't72_strong',
    t4_final: 't5_warning',
};
function normalizeStage(stage) {
    const s = stage || '';
    if (exports.REMINDER_STAGES.includes(s))
        return s;
    if (LEGACY_STAGE_MAP[s])
        return LEGACY_STAGE_MAP[s];
    return 't0_soft';
}
function getNextStage(current) {
    const idx = exports.REMINDER_STAGES.indexOf(current);
    if (idx < 0 || idx >= exports.REMINDER_STAGES.length - 1)
        return current;
    return exports.REMINDER_STAGES[idx + 1];
}
// ============================================================
// MESSAGE ORIGIN — Who triggered the send
// ============================================================
exports.MESSAGE_ORIGINS = ['automation', 'manual', 'webhook', 'system'];
// ============================================================
// IDENTITY GENERATION — Snowflake-style monotonic IDs
// ============================================================
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generate a canonical billzo_message_id using Snowflake-style encoding.
 * Combines Date.now() (shifted left 12 bits) with hrtime low 12 bits
 * for intra-millisecond uniqueness without shared mutable state.
 *
 * Format: bmsg_{base36(snowflake)}
 */
let _seqCounter = 0n;
function generateBillzoMessageId() {
    const ts = BigInt(Date.now()) << 12n;
    const counter = (_seqCounter++ & 0xfffn);
    return `bmsg_${(ts | counter).toString(36)}`;
}
function generateEventSequence() {
    const ts = BigInt(Date.now()) << 12n;
    const counter = (_seqCounter++ & 0xfffn);
    return ts | counter;
}
/**
 * Compute a transport-level message hash for dedup and reconciliation.
 * Uses MD5 (fast, not cryptographic) over canonical fields.
 *
 * Retry safety: includes reminderStage + attemptNumber so retries
 * within the same minute-bucket produce distinct hashes.
 */
function computeTransportHash(params) {
    const raw = [
        params.phone,
        params.message,
        params.invoiceId || '',
        params.amount?.toString() || '',
        params.reminderStage || '',
        (params.attemptNumber || 1).toString(),
    ].join('|');
    return crypto_1.default.createHash('md5').update(raw).digest('hex');
}
function isOverdue(status, dueDate, now = new Date()) {
    if (status === 'paid')
        return false;
    if (!dueDate)
        return false;
    const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    return due < now;
}
// ============================================================
// RECOVERY STATE — Business semantic state
// Derived from events + telemetry; drives collection decisions.
// ============================================================
exports.RECOVERY_STATES = [
    'created',
    'due_soon',
    'overdue_soft',
    'overdue_engaged',
    'overdue_ignored',
    'high_risk',
    'escalated',
    'recovered',
    'failed',
];
// ============================================================
// RECOVERY ENGAGEMENT STATE — Customer behavioral interpretation
// ============================================================
exports.RECOVERY_ENGAGEMENT_STATES = [
    'unseen',
    'attention',
    'engaged',
    'intent',
    'likely_to_pay',
    'ghosting',
    'failed',
];
exports.DEFAULT_OPERATING_HOURS = {
    enabled: true,
    windows: [
        { start: '09:30', end: '11:30' },
        { start: '18:00', end: '20:30' },
    ],
    quietDays: [0],
    quietAfter: '21:00',
};
// ============================================================
// DECAY CONFIGURATION
// ============================================================
exports.DECAY_HALF_LIVES = {
    readRate: 30,
    paymentConversion: 45,
    readToPayLatency: 45,
    reminderResponseLatency: 30,
    settlementLatency: 60,
    liquidityWindowAffinity: 60,
    channelViability: 21,
    escalationSensitivity: 120,
};
exports.INTERPRETER_VERSION = '1.0.0';
//# sourceMappingURL=types.js.map