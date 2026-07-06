"use strict";
// ============================================================
// RECOVERY TIMELINE BUILDER — Pure domain logic
// ============================================================
// Transforms raw DB records into RecoveryTimelineEvent[], grouped by date,
// with a RecoveryJourney progress stepper and IntelligenceInsights.
//
// Never let React know where data came from. This is the sole
// transformation layer between storage and presentation.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRecoveryTimeline = buildRecoveryTimeline;
exports.buildJourney = buildJourney;
exports.buildInsights = buildInsights;
// ============================================================
// DATE GROUPING
// ============================================================
function groupLabel(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0)
        return 'Today';
    if (diffDays === 1)
        return 'Yesterday';
    if (diffDays < 7)
        return `${diffDays} days ago`;
    return target.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
function groupEvents(events) {
    const groups = new Map();
    for (const event of events) {
        const label = groupLabel(new Date(event.timestamp));
        const existing = groups.get(label) || [];
        existing.push(event);
        groups.set(label, existing);
    }
    const entries = Array.from(groups.entries());
    entries.sort((a, b) => {
        const dateA = new Date(a[1][0].timestamp);
        const dateB = new Date(b[1][0].timestamp);
        return dateB.getTime() - dateA.getTime();
    });
    return entries.map(([label, evts]) => ({
        label,
        events: evts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    }));
}
// ============================================================
// EVENT BUILDERS
// ============================================================
function fromInvoiceCreated(invoice) {
    return {
        id: `inv_${invoice.id}`,
        type: 'invoice_created',
        title: 'Invoice created',
        description: `Invoice for ₹${(invoice.total || 0).toLocaleString('en-IN')}`,
        reason: `Invoice ${invoice.id} was created${invoice.due_date ? `. Due: ${new Date(invoice.due_date).toLocaleDateString('en-IN')}` : ''}.`,
        timestamp: invoice.created_at,
        severity: 'info',
        source: 'system',
    };
}
function fromCollectionAction(action) {
    const ts = action.completed_at || action.executed_at || action.scheduled_at || action.created_at;
    const base = {
        id: `ca_${action.id}`,
        timestamp: ts,
        source: mapSource(action.source),
        metadata: action.metadata,
    };
    if (action.action_type === 'reminder') {
        if (action.status === 'scheduled') {
            return {
                ...base,
                type: 'reminder_scheduled',
                title: 'Reminder scheduled',
                description: action.provider ? `Channel: ${action.provider}` : 'Awaiting send',
                reason: action.reason || 'Scheduled by recovery automation.',
                severity: 'future',
            };
        }
        if (action.status === 'completed') {
            const stage = action.metadata?.stage || '';
            return {
                ...base,
                type: 'reminder_sent',
                title: 'Reminder sent',
                description: stage ? `Stage: ${stage}` : 'WhatsApp reminder delivered',
                reason: action.reason || `Reminder sent${stage ? ` (${stage})` : ''}.`,
                severity: 'success',
            };
        }
    }
    if (action.action_type === 'payment_request' && action.status === 'completed') {
        return {
            ...base,
            type: 'payment_link_clicked',
            title: 'Payment link clicked',
            description: action.amount ? `Amount: ₹${action.amount.toLocaleString('en-IN')}` : 'Customer clicked UPI link',
            reason: action.reason || 'Customer initiated payment via UPI link.',
            severity: 'success',
            source: 'customer',
        };
    }
    if (action.action_type === 'escalate') {
        return {
            ...base,
            type: 'escalated',
            title: 'Escalated to merchant',
            description: 'Manual review required',
            reason: action.reason || 'All reminder stages exhausted.',
            severity: 'warning',
        };
    }
    return null;
}
function fromWhatsAppEvent(event) {
    if (event.direction !== 'outbound')
        return null;
    const ts = event.occurred_at || event.created_at;
    const base = {
        id: `we_${event.id}`,
        timestamp: ts,
        source: 'system',
        metadata: event.metadata,
    };
    const stage = event.message_type || '';
    switch (event.status) {
        case 'sent':
        case 'queued':
            return {
                ...base,
                type: 'reminder_sent',
                title: 'Reminder sent',
                description: stage ? `Stage: ${stage}` : 'WhatsApp message sent',
                reason: `Message dispatched via ${event.provider || 'WhatsApp'}.`,
                severity: 'info',
            };
        case 'delivered':
        case 'server_ack':
            return {
                ...base,
                type: 'reminder_delivered',
                title: 'Reminder delivered',
                description: 'Message reached customer device',
                reason: 'WhatsApp confirmed delivery to recipient.',
                severity: 'success',
            };
        case 'read':
            return {
                ...base,
                type: 'reminder_read',
                title: 'Customer read message',
                description: 'Message was opened by customer',
                reason: 'Customer opened the reminder message.',
                severity: 'success',
                source: 'customer',
            };
        case 'clicked_upi':
            return {
                ...base,
                type: 'payment_link_clicked',
                title: 'Payment link clicked',
                description: 'Customer initiated UPI payment',
                reason: 'Customer clicked the payment link in the message.',
                severity: 'success',
                source: 'customer',
            };
        case 'failed':
            return {
                ...base,
                type: 'reminder_failed',
                title: 'Reminder delivery failed',
                description: event.metadata?.error ? String(event.metadata.error) : 'Message could not be delivered',
                reason: 'WhatsApp delivery failed. Check provider status.',
                severity: 'error',
            };
        default:
            return null;
    }
}
function mapSource(raw) {
    if (raw === 'customer')
        return 'customer';
    if (raw === 'merchant')
        return 'merchant';
    if (raw === 'worker')
        return 'worker';
    if (raw === 'ai')
        return 'ai';
    return 'system';
}
// ============================================================
// JOURNEY BUILDER
// ============================================================
const JOURNEY_STAGE_DEFS = [
    { key: 'invoice_created', label: 'Invoice Created' },
    { key: 'reminder_sent', label: 'Reminder Sent' },
    { key: 'customer_read', label: 'Customer Read' },
    { key: 'payment_link_clicked', label: 'Payment Link Clicked' },
    { key: 'awaiting_payment', label: 'Awaiting Payment' },
    { key: 'payment_received', label: 'Payment Received' },
    { key: 'case_closed', label: 'Case Closed' },
];
function buildJourney(events, invoiceStatus) {
    const hasEvent = (type) => events.some(e => e.type === type);
    const isPaid = invoiceStatus === 'paid' || invoiceStatus === 'reconciled';
    const stages = [];
    let foundCurrent = false;
    for (const def of JOURNEY_STAGE_DEFS) {
        const type = def.key;
        const completed = hasEvent(type);
        const event = events.find(e => e.type === type);
        if (def.key === 'payment_received' && isPaid) {
            stages.push({ key: def.key, label: def.label, status: 'completed', timestamp: event?.timestamp });
            continue;
        }
        if (def.key === 'case_closed' && isPaid) {
            stages.push({ key: def.key, label: def.label, status: 'completed' });
            continue;
        }
        if (completed) {
            stages.push({ key: def.key, label: def.label, status: 'completed', timestamp: event?.timestamp });
        }
        else if (!foundCurrent) {
            stages.push({ key: def.key, label: def.label, status: 'current' });
            foundCurrent = true;
        }
        else {
            stages.push({ key: def.key, label: def.label, status: 'pending' });
        }
    }
    return { stages };
}
// ============================================================
// INSIGHT BUILDER
// ============================================================
function buildInsights(events) {
    const insights = [];
    const readEvents = events.filter(e => e.type === 'reminder_read');
    if (readEvents.length > 0) {
        insights.push({
            id: 'insight_read_rate',
            type: 'insight',
            title: 'Customer reads reminders',
            description: `Customer has read ${readEvents.length} reminder(s). Engagement is positive.`,
            severity: 'positive',
        });
    }
    const clickedEvents = events.filter(e => e.type === 'payment_link_clicked');
    if (clickedEvents.length > 0) {
        insights.push({
            id: 'insight_clicked',
            type: 'prediction',
            title: 'Payment intent detected',
            description: 'Customer clicked a payment link. High likelihood of payment completion.',
            confidence: 0.78,
            severity: 'positive',
        });
    }
    const failedEvents = events.filter(e => e.type === 'reminder_failed');
    if (failedEvents.length > 0) {
        insights.push({
            id: 'insight_delivery_issues',
            type: 'recommendation',
            title: 'Delivery issues detected',
            description: `${failedEvents.length} reminder(s) failed to deliver. Check WhatsApp provider status.`,
            severity: 'negative',
        });
    }
    const escalatedEvents = events.filter(e => e.type === 'escalated');
    if (escalatedEvents.length > 0) {
        insights.push({
            id: 'insight_escalated',
            type: 'recommendation',
            title: 'Manual review needed',
            description: 'Case has been escalated. Merchant intervention required.',
            severity: 'negative',
        });
    }
    return insights;
}
// ============================================================
// MAIN BUILDER
// ============================================================
function buildRecoveryTimeline(input) {
    const events = [];
    const invoiceStatus = input.invoice.status?.toLowerCase() || '';
    const isPaid = invoiceStatus === 'paid' || invoiceStatus === 'reconciled';
    const isOverdue = invoiceStatus === 'overdue';
    // 1. Invoice created
    events.push(fromInvoiceCreated(input.invoice));
    // 2. Collection actions
    for (const action of input.collectionActions) {
        const event = fromCollectionAction(action);
        if (event)
            events.push(event);
    }
    // 3. WhatsApp events (reminder delivery telemetry)
    for (const we of input.whatsappEvents) {
        const event = fromWhatsAppEvent(we);
        if (event)
            events.push(event);
    }
    // 4. Payment received (from invoice status)
    if (isPaid) {
        const payTs = input.invoice.updated_at || input.invoice.created_at;
        events.push({
            id: `pay_${input.invoice.id}`,
            type: 'payment_received',
            title: 'Payment received',
            description: `₹${(input.invoice.total || 0).toLocaleString('en-IN')} settled`,
            reason: 'Invoice marked as paid.',
            timestamp: payTs,
            severity: 'success',
            source: 'system',
        });
        events.push({
            id: `close_${input.invoice.id}`,
            type: 'case_closed',
            title: 'Recovery complete',
            description: 'All amounts settled',
            reason: 'Payment received in full. Recovery case closed.',
            timestamp: payTs,
            severity: 'success',
            source: 'system',
        });
    }
    // 5. Overdue flag
    if (isOverdue && !isPaid) {
        events.push({
            id: `overdue_${input.invoice.id}`,
            type: 'action_pending',
            title: 'Overdue',
            description: `₹${(input.invoice.outstanding_amount || input.invoice.total || 0).toLocaleString('en-IN')} outstanding`,
            reason: 'Payment due date has passed. Recovery automation is active.',
            timestamp: input.invoice.updated_at || input.invoice.created_at,
            severity: 'warning',
            source: 'system',
        });
    }
    // Sort by timestamp ascending
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const groups = groupEvents(events);
    const journey = buildJourney(events, invoiceStatus);
    const insights = buildInsights(events);
    return {
        invoiceId: input.invoice.id,
        customerId: input.invoice.customer_id,
        customerName: input.invoice.customer_name,
        events,
        groups,
        journey,
        insights: insights.length > 0 ? insights : undefined,
    };
}
//# sourceMappingURL=timeline-builder.js.map