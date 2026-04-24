# BillZo Positioning Document

**Version:** 1.0  
**Status:** Active  
**Created:** April 2026

---

## 1. Target Customer

### Primary Persona: Ravi Sharma

```
Name: Ravi Sharma
Age: 35
Business: Electronics retail counter
Location: Local market, tier-2 city
Staff: 3 employees
Daily Invoices: 25-40
Primary Communication: WhatsApp
Accountant: Visits monthly for GST filing
Current Tool: TallyPrime (finds overwhelming)
Pain Point: "Billing should be fast, not a desktop exercise"
```

### Customer Profile

- **Single-location GST-registered retail shop**
- 2–5 employees
- Owner creates invoices personally during business hours
- Uses WhatsApp for 90% of customer communication
- Calls accountant once monthly for GST compliance
- Wants speed, not complexity
- Fears GST errors more than missing features

### Why This Customer

| Reason | Explanation |
|--------|-------------|
| Large market | 50M+ GST-registered businesses in India |
| Underserved | Want simplicity, not Tally-level complexity |
| WhatsApp-native | Already live on WhatsApp 24/7 |
| Trust-deficient | Don't trust lightweight apps with GST data |

---

## 2. Core Problem

### Ravi's Daily Struggles

| Problem | Current Reality |
|---------|-----------------|
| Slow billing | Desktop software = slow startup, counter to phone workflow |
| Delivery friction | Email invoices = customers never receive |
| GST anxiety | "Will accountant shout at me for mistakes?" |
| Accountant dependency | Must wait for monthly review |
| No visibility | "Did yesterday's invoices sync?" |
| Complex UI | Tally has 50 menus, Ravi uses 3 |

### The Real Pain

> Ravi doesn't want accounting software. He wants to bill fast, send to customers instantly, and sleep peacefully knowing GST is correct.

---

## 3. Existing Alternatives (and Why They Fail)

### Desktop Accounting Tools (TallyPrime, Marg ERP)

| Weakness | Impact for Ravi |
|----------|-----------------|
| Desktop lock-in | Can't bill from phone |
| Feature overload | Uses 3 of 50 features |
| Learning curve | Staff training time |
| Slow updates | Modern expectations unmet |

### Mobile Billing Apps (mKRISH, Billing)

| Weakness | Impact for Ravi |
|----------|-----------------|
| Lightweight GST | "Will this mess up my GST returns?" |
| No ERP sync | Double-entry pain |
| Unreliable | Can't trust critical billing |
| No visibility | "Where are my invoices?" |

### Email-Based Workflows

| Weakness | Impact for Ravi |
|----------|-----------------|
| Slow delivery | Customer calls asking "invoice?" |
| No tracking | Did they receive it? |
| Not WhatsApp | Not how customers expect |

### Why They All Fail Ravi

> He wants **accountant-grade correctness** with **phone-level speed** and **WhatsApp-level delivery** — none of the current options give him all three.

---

## 4. BillZo Solution

### What We Deliver

| Feature | What Ravi Gets |
|---------|----------------|
| Phone-first billing | Create invoice in 30 seconds |
| WhatsApp delivery | Customer receives invoice instantly |
| ERP-grade correctness | Syncs to ERPNext, accountant trusts it |
| Visible sync status | "Is it synced? Yes/No" |
| GST-ready exports | One-tap GST reports |
| No desktop needed | Works entirely on phone |

### Technical Foundation (Invisible to Ravi)

- FY-scoped invoice numbering
- Ledger validation (round-per-line)
- Retry-safe ERP sync
- Circuit breaker protection
- Audit trail for compliance

### What Ravi Feels

```
✓ I can bill in 30 seconds
✓ My GST is correct (ERPNext says so)
✓ Customers get invoices instantly
✓ My accountant won't shout at me
✓ I know what's synced and what's not
```

---

## 5. Emotional Win (The Real Product)

### What Ravi Feels Every Morning

| Emotion | Trigger |
|---------|----------|
| Confidence | "GST is correct, ERPNext synced" |
| Speed | "30 seconds to create invoice" |
| Peace | "No accountant surprises" |
| Control | "I know exactly what's synced" |

### The Promise

> **"BillZo is the counter billing app that works the way shop owners already work — phone + WhatsApp — but produces accountant-ready GST data automatically."**

### Not the Pitch

- Not "multi-tenant architecture"
- Not "Redis-backed sessions"
- Not "circuit breaker protection"
- Not "idempotency guarantees"

Ravi doesn't care about infrastructure.

**He cares about: Can I bill fast? Will my GST be right? Will my accountant approve?**

---

## 6. Unfair Advantage

### Why Competitors Can't Copy Fast

| Our Advantage | Competitor Weakness |
|---------------|---------------------|
| WhatsApp-native delivery | myBillBook: email-first |
| Transparent sync status | Most: opaque |
| Phone-first UX | Tally: desktop-only |
| GST correctness without CA | Zoho: accountant-oriented |
| ERPNext sync | Lightweight apps: no backend |

### The Moat

> WhatsApp workflow + visible ERP sync + GST correctness = Very hard to replicate in 6 months

---

## 7. Target Customer Definition

### Primary Target

```
Industry: Retail (electronics, hardware, accessories, spare parts)
Business type: Single-location counter shop
Staff size: 2-5 employees
GST status: Registered, files monthly
Current tool: TallyPrime (overwhelmed) or lightweight app (distrusts)
Communication: WhatsApp-native
Invoices/day: 20-50
```

### Wrong Targets (Defer)

- ❌ Startup founders (need SaaS billing, not counter billing)
- ❌ Multi-branch retailers (need advanced inventory)
- ❌ Service businesses (different workflow)
- ❌ Enterprise (not our segment)

---

## 8. Pricing Strategy

### Suggested Tiers

| Plan | Price | Target |
|------|-------|--------|
| Starter | ₹0/month | Trial, 50 invoices |
| Pro | ₹499/month | Growing shop, 500 invoices |
| Business | ₹999/month | High volume, unlimited |

### Why Free Tier

- Reduces friction for Ravi to try
- Competes with myBillBook's free
- First 50 invoices = enough to prove value

---

## 9. Success Metrics

### What Matters for Merchant #1

| Metric | Target |
|--------|--------|
| Invoice creation time | < 30 seconds |
| WhatsApp delivery | Instant (< 5 seconds) |
| Sync success rate | > 99% |
| Time to first invoice | < 5 minutes |
| GST export | One-tap, error-free |

### What Matters for Business

| Metric | Target |
|--------|--------|
| Day 1 retention | Invoice created |
| Day 7 retention | 3+ invoices |
| Day 30 retention | Active monthly user |
| NPS | > 40 |

---

## 10. Positioning Statement (Final)

> **BillZo is WhatsApp-first GST billing for retail counters that want Tally-level correctness without Tally-level complexity.**

Alternative stronger:

> **The billing app that works the way Ravi already works — phone + WhatsApp — but produces accountant-ready GST data automatically.**

---

*This document defines who we serve, what we solve, and why we win. Update as we learn from merchants.*
