// Client-side helper to trigger the Recovery Planner when a new invoice is
// created. Called from the invoice-creation flow (actions.ts) so planning is
// automatic — no backfill dependency, exactly like billing's verify flow.
export async function planInvoiceOnCreated(params: {
  invoiceId: string
  customerId: string
  dueAt?: string
}): Promise<void> {
  try {
    await fetch('/api/recovery/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        invoiceId: params.invoiceId,
        customerId: params.customerId,
        anchorAt: params.dueAt,
      }),
    })
  } catch (err) {
    // Planning is best-effort; the scheduler backfill (admin tool) covers misses.
    console.warn('[Recovery] planner trigger failed (non-fatal):', err)
  }
}
