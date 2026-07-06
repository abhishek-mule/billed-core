// ============================================================
// COLLECTION PROVIDER INTERFACE — Channel abstraction
// ============================================================
//
// Each provider implements one channel (whatsapp, upi, razorpay, email, sms).
// The ActionPlanner picks the right provider based on the RecoveryPlan
// and merchant's enabled channels.
// ============================================================

export interface CollectionProvider<TInput = unknown, TOutput = unknown> {
  readonly name: string

  create(input: TInput): Promise<TOutput> | TOutput
}
