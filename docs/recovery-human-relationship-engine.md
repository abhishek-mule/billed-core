# BillZo Human Relationship Engine

> *The best reminder is not the one that gets sent. The best reminder is the one that gets the money without damaging the relationship.*

**Optimize for:** Lifetime customer relationship value recovered, not messages sent.

---

## Layer 1: Absolute WhatsApp Safety Rules (Anti-Ban Engine)

### Rule A — Never send in machine-like intervals
Randomize send times per customer: `nextSendAt = dueDate + random(6h, 48h)`

### Rule B — Respect business hours
Never send outside 10AM–6PM, weekends, or festivals. Per-customer timezone profile.

### Rule C — Warm-up limits
- 1 message every 20–60s (per phone)
- Small biz: 20–50/day
- Gradually scale as account ages

### Rule D — Human typing simulation
Wait 5s → show typing → wait 3s → send

---

## Layer 2: Customer Frustration Prevention Engine

### Rule 1 — Never repeat the same message
Message library with escalating tones: soft → professional → firm

### Rule 2 — Detect engagement
Track: delivered? read? link clicked? replied?
- **Ignores all**: wait longer, recommend call
- **Clicks link**: reduce frequency (high intent)
- **Says "pay Friday"**: zero reminders until Friday (payment_promise)

### Rule 3 — Apology after too many reminders
Pause 15 days with a respectful message acknowledging the customer's time.

---

## Layer 3: Customer Relationship Score (0–100)

| Score | Profile | Strategy |
|-------|---------|----------|
| 80–100 | VIP (₹15L/yr, 95% on-time) | Max 2 reminders/month, never legal tone, suggest merchant call |
| 40–79 | Normal | Standard automation |
| 0–39 | Risky | More aggressive cadence |

---

## Layer 4: Merchant Intervention Engine
After 3 ignored reminders → flag merchant instead of sending #4:
> ⚠️ Ravi Traders ignored 3 reminders. Recommended: ☎ Call personally (confidence 86%)

---

## Layer 5: Payment Intelligence
Acknowledge partial payments: "Thank you for ₹2000. Remaining: ₹3000."
Never say "Your ₹5000 is overdue" after a partial payment.

---

## Layer 6: Recovery Personality (per customer)

| Type | Pattern | Strategy |
|------|---------|----------|
| Reliable | Pays after 1st reminder | Only 1 gentle reminder |
| Busy | Opens but pays late | Send at 7 PM |
| Avoider | Never opens | Stop WhatsApp → recommend call |
| Negotiator | Always asks for time | Use payment promises |

---

## Layer 7: Trust Audit
Every sent message stores:
```json
{ "sent": true, "why": ["outstanding > 0", "no promise active", ...], "confidence": 92 }
```

---

## New Decision Engine Rules to Add

| # | Rule | Purpose |
|---|------|---------|
| 10 | Customer annoyance score | Prevent harassment |
| 11 | Best send time prediction | Per-customer timing optimization |
| 12 | Message variation engine | Rotate tone/template per attempt |
| 13 | Max reminders per month | Absolute cap per customer |
| 14 | Channel switching | WhatsApp → call after N ignores |
| 15 | Relationship value protection | VIP special handling |
| 16 | Recent payment intent detection | Reduce frequency after link click |
| 17 | Silence period after repeated ignores | Mandatory cooling-off |
| 18 | Merchant approval required | Escalate sensitive cases to human |
