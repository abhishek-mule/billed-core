# Phase 1 Quick Start Guide

## ✅ What's Implemented

**4 Working APIs + Database + Migrations**

### 1. Enhanced Razorpay Webhook
- ✅ Signature verification (already existed)
- ✅ NEW: Database updates on payment events
- ✅ Tracks payment ID, status, reconciliation

### 2. GSTR Export API
- ✅ Exports invoices in GSTN format
- ✅ Supports date range filtering
- ✅ Aggregate summary by GST rate
- ✅ Audit trail (stores all exports)

### 3. E-way Bill Generation
- ✅ Generates E-way JSON for GST portal
- ✅ Auto-detects transaction type (B2B/B2C)
- ✅ State code mapping for GSTIN
- ✅ Ready for GST portal submission

### 4. ERPNext Sync (Scaffolded)
- ✅ Converts invoices to ERPNext format
- ✅ Graceful error when not configured
- ✅ Ready to use when credentials available

### 5. Database Migrations
- ✅ New tables: `gstr_exports`, `eway_bills`
- ✅ New columns: `payments.status`, `payments.razorpay_order_id`
- ✅ Performance indexes on all key columns
- ✅ Safe to run (idempotent)

---

## 🚀 Getting Started (5 minutes)

### Step 1: Setup Environment
```bash
# Copy env template
cp .env.local.example .env.local

# Edit .env.local and set:
# RAZORPAY_WEBHOOK_SECRET=your_secret_from_dashboard
# (Optional: ERP_URL, ERP_API_KEY, ERP_API_SECRET)
```

### Step 2: Apply Database Migrations
```bash
# Run this once to create new tables and indexes
npx ts-node src/lib/db/migrate.ts

# Output will show:
# [Migrations] Executing: 001_add_compliance_tables.sql...
# [Migrations] ✅ Executed: 001_add_compliance_tables.sql
# [Migrations] ✅ Migration complete! (1 new migrations executed)
```

### Step 3: Verify Installation
```bash
# Run verification script
bash verify-phase1.sh

# Should output:
# ✅ All Phase 1 files verified!
```

### Step 4: Start Application
```bash
npm run dev
# or
npm start
```

---

## 📡 Testing the APIs

### Test GSTR Export
```bash
curl -X POST http://localhost:3000/api/merchant/reports/gstr-export \
  -H "Content-Type: application/json" \
  -d '{
    "from_date": "2026-04-01",
    "to_date": "2026-04-30"
  }'
```

**Check results**:
```sql
-- Verify export was saved
SELECT * FROM gstr_exports;
```

---

### Test E-way Bill
```bash
curl -X POST http://localhost:3000/api/merchant/eway/generate \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_id": "inv_your_invoice_id"
  }'
```

**Check results**:
```sql
SELECT * FROM eway_bills;
```

---

### Test Razorpay Webhook
1. Create test payment in Razorpay dashboard
2. Complete payment (test mode)
3. Razorpay calls webhook automatically

**Check results**:
```sql
SELECT razorpay_payment_id, status, is_reconciled FROM payments ORDER BY created_at DESC;
SELECT payment_status, erp_sync_status FROM invoices WHERE id = 'test_invoice';
```

---

### Test ERPNext Sync
```bash
curl -X POST http://localhost:3000/api/merchant/erp/sync-invoice \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_id": "inv_your_invoice_id",
    "action": "sync"
  }'
```

**Expected** (without credentials):
```json
{
  "success": false,
  "error": "ERPNext credentials not configured. Add ERP_URL, ERP_API_KEY, ERP_API_SECRET to environment variables",
  "hint": "Please configure ERPNext credentials in environment variables"
}
```

---

## 📂 Files Modified/Created

### New Files (9 total)
1. `src/app/api/merchant/reports/gstr-export.ts` - GSTR API
2. `src/app/api/merchant/eway/generate.ts` - E-way API
3. `src/app/api/merchant/erp/sync-invoice.ts` - ERPNext API
4. `src/lib/db/migrate.ts` - Migration runner
5. `migrations/001_add_compliance_tables.sql` - Database migration
6. `PHASE1_IMPLEMENTATION.md` - Detailed docs
7. `verify-phase1.sh` - Verification script
8. `.env.local` - Local config (create from example)

### Files Modified (2 total)
1. `src/app/api/webhooks/razorpay/route.ts` - Enhanced with DB updates
2. `schema.sql` - Added compliance tables
3. `.env.local.example` - Added new env variables

---

## ✔️ Verification Checklist

- [ ] `.env.local` created from `.env.local.example`
- [ ] `RAZORPAY_WEBHOOK_SECRET` added to `.env.local`
- [ ] Migrations ran successfully: `npx ts-node src/lib/db/migrate.ts`
- [ ] Verification script passes: `bash verify-phase1.sh`
- [ ] Tables visible in Neon: `gstr_exports`, `eway_bills`
- [ ] GSTR endpoint returns data
- [ ] E-way endpoint generates JSON
- [ ] Razorpay webhook tracks payments
- [ ] ERPNext endpoint returns graceful error

---

## 🐛 Troubleshooting

### Migration fails: "Table already exists"
✅ Normal - migrations are idempotent, this means they ran before

### GSTR export returns empty
- Verify invoices exist in database: `SELECT COUNT(*) FROM invoices`
- Check date range: `SELECT created_at FROM invoices LIMIT 1`

### Webhook signature verification fails
- Verify `RAZORPAY_WEBHOOK_SECRET` in `.env.local` matches dashboard
- Check webhook URL in Razorpay dashboard points to correct endpoint

### ERPNext sync fails with "not configured"
✅ Expected - credentials not provided yet (Phase 2)

---

## 📚 Full Documentation

For complete implementation details, see:
- **`PHASE1_IMPLEMENTATION.md`** - Full API documentation
- **`migrations/001_add_compliance_tables.sql`** - Database schema
- **`.env.local.example`** - All configuration options

---

## 🎯 Next Phase

After verification:
- **Phase 2** (Weeks 2-4): Database optimizations, audit logging
- **Phase 3** (Weeks 4-6): Complete features (billing, parties, reports)
- **Phase 4** (Weeks 6-8): UI/UX redesign & polish

---

## 💬 Need Help?

Check:
1. `PHASE1_IMPLEMENTATION.md` - Detailed endpoint docs
2. `verify-phase1.sh` - Verify files are in place
3. Migration logs - `npx ts-node src/lib/db/migrate.ts`
4. Database queries - Connect to Neon and check tables exist
