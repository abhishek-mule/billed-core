# Merchant Trust: 11 Scenarios That Will Break BillZo

> BillZo will not fail because WhatsApp doesn't send.
> BillZo will fail when merchant trust breaks.

## 1. Customer Paid Cash Yesterday
- Merchant receives cash, forgets to record → BillZo sends overdue reminder → customer gets angry
- Fix: `payment_sources` table (cash, bank_transfer, upi, razorpay, adjustment). Recovery engine operates on `outstanding_amount`, not `invoice_total`. "Mark Paid" / "Record Cash Payment" buttons everywhere.

## 2. Customer Paid Partial Amount
- Invoice ₹5000, customer sent ₹2000 → BillZo demands ₹5000 → merchant looks stupid
- Fix: Outstanding = `invoice.total - confirmed_payments`. Templates show "Outstanding: ₹3000, Received: ₹2000".

## 3. VIP Customer
- ₹15L/year customer pays late → BillZo escalates to "Final warning" → merchant loses biggest client
- Fix: Customer Tier Engine (VIP, Regular, Risky, Blacklisted). VIP max escalation = Friendly. Legal messages never automatic.

## 4. Customer Promised To Pay
- Customer says "Friday pakka" → BillZo sends reminder Thursday → relationship damage
- Fix: `payment_promises` table. `PROMISED_TO_PAY` state pauses automation until promise date.

## 5. Disputed Invoice
- Customer claims 10 items damaged → BillZo keeps sending reminders → dispute becomes conflict
- Fix: `DISPUTED` state. Recovery engine frozen. Only merchant can resume.

## 6. Wrong WhatsApp Number
- Typo in phone → reminder goes to stranger → privacy issue
- Fix: Phone verification score (verified/unverified/unknown). Send test invoice first. Confirm delivery before enabling automation.

## 7. Customer Changed Number
- Old number inactive → reminders disappear forever
- Fix: Track delivery_rate, reply_rate, read_rate. After X failures → "Contact Lost" → task to update phone.

## 8. Merchant Sends Reminder Manually
- Merchant personally messages customer → BillZo doesn't know → duplicate reminder
- Fix: `interaction_events` table. Cadence considers ALL interactions (manual_call, manual_whatsapp, visit, email, billzo_reminder), not only BillZo messages.

## 9. Customer Pays Through Bank Transfer
- NEFT received → no webhook, no Razorpay → BillZo thinks unpaid
- Fix: Bank reconciliation workflow. Merchant sees "Potential Payment Match" (amount + customer + day) and approves.

## 10. Merchant Himself Is Wrong
- Merchant says "customer never pays on time" → Reality: 90% paid on time → over-escalation
- Fix: Customer Reputation Score (payment history, average delay, lifetime value, invoice volume, promise fulfillment). Recommendation engine overrides merchant bias.

## 11. Merchant Wants Relationship, Not Recovery
- Customer owes ₹50K but generates ₹10L/year → Merchant says "Don't send anything"
- Fix: Real metric = Relationship Preserved + Money Collected, not just Money Collected.

## North Star

BillZo should become:

> **Merchant Relationship Operating System**

Every recovery decision answers:
1. Has customer paid?
2. How much remains?
3. Is customer valuable?
4. Has customer promised?
5. Is invoice disputed?
6. Did merchant already contact?
7. Is relationship at risk?
8. Should automation pause?

**Only then**: Send Reminder.

The moat is making better recovery decisions than the merchant himself while still keeping the merchant in control.
