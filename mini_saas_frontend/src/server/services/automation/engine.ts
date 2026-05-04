import { db } from "@/lib/db";
import { invoices, tenants, automationState } from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { trackEvent } from "@/lib/analytics";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/meta";

export async function processAutoRecovery(invoiceId: string, tone: string, stage: number) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: { tenant: true, customer: true }
  });

  if (!invoice || !invoice.tenant?.isActive) return;

  // Circuit Breaker: Check automation state
  const state = await db.query.automationState.findFirst({
    where: eq(automationState.tenantId, invoice.tenantId)
  });

  if (state && !state.isEnabled) return;

  // Safety Gate: Last reminder check (24h cooldown)
  const lastReminder = invoice.lastReminderAt ? new Date(invoice.lastReminderAt) : null;
  if (lastReminder && (new Date().getTime() - lastReminder.getTime()) < (24 * 60 * 60 * 1000)) {
    return;
  }

  // Execute Action
  try {
    // 1. Send via WhatsApp
    await sendWhatsAppTemplate({
      phone: invoice.customer?.phone || '',
      template: 'invoice_reminder',
      params: { tone, invoice_no: invoice.invoiceNumber }
    });

    // 2. Mark and track
    await db.update(invoices).set({ lastReminderAt: new Date(), reminderCount: (invoice.reminderCount || 0) + 1 }).where(eq(invoices.id, invoiceId));
    
    // 3. Track successful auto-trigger
    await trackEvent(db, {
      tenantId: invoice.tenantId,
      eventName: "reminder.sent",
      entityType: "invoice",
      entityId: invoiceId,
      source: "auto",
      channel: "whatsapp",
      followUpStage: stage,
      tone: tone,
      metadata: { status: 'success' }
    });

    return { success: true };
  } catch (err) {
    console.error("Auto recovery failed:", err);
    // Track failure for circuit breaker logic
    await trackEvent(db, {
      tenantId: invoice.tenantId,
      eventName: "reminder.sent",
      entityType: "invoice",
      entityId: invoiceId,
      source: "auto",
      channel: "whatsapp",
      metadata: { tone, status: 'failed', error: String(err) }
    });
    return { success: false };
  }
}

