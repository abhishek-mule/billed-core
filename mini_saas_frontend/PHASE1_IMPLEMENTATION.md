# Phase 1 Implementation Guide: Compliance & Critical APIs

**Status**: ✅ Complete  
**Date**: April 29, 2026  
**Goal**: Implement GSTR export, E-way bill generation, enhanced Razorpay webhook, and ERPNext scaffolding

---

## 📋 What Was Implemented

### 1. ✅ Enhanced Razorpay Webhook Verification
**File**: `src/app/api/webhooks/razorpay/route.ts`

**Changes**:
- ✅ Signature verification already in place (kept intact)
- ✅ **NEW**: Database update logic on payment success
- ✅ **NEW**: Updates `payments` table with `razorpay_payment_id`, `status`, `is_reconciled`
- ✅ **NEW**: Updates `invoices` table to mark payment as `COMPLETED`
- ✅ **NEW**: Handles both `payment.captured` and `payment.failed` events

**How it works**:
1. Razorpay sends webhook to `POST /api/webhooks/razorpay`
2. Signature verified using `RAZORPAY_WEBHOOK_SECRET`
3. Payment record updated in database
4. Invoice marked as ready for ERPNext sync

**Database columns added**:
- `payments.status` (PENDING / COMPLETED / FAILED)
- `payments.razorpay_order_id`

---

### 2. ✅ GSTR Export API
**File**: `src/app/api/merchant/reports/gstr-export.ts` (NEW)

**Endpoint**: `POST /api/merchant/reports/gstr-export`

**Request**:
```json
{
  "from_date": "2026-04-01",
  "to_date": "2026-04-30"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "meta": {
      "company": "ABC Retail",
      "phone": "9876543210",
      "email": "info@abc.com",
      "period": "2026-04-01 to 2026-04-30"
    },
    "invoices": [
      {
        "invoice_no": "INV-001",
        "invoice_date": "2026-04-15",
        "invoice_value": 1180,
        "place_of_supply": "DL",
        "gst_rate": "18",
        "taxable_value": 1000,
        "cgst_amount": 90,
        "sgst_amount": 90,
        "igst_amount": 0,
        "customer_gstin": "07AAXFU5055K1Z0",
        "reverse_charge": "N",
        "invoice_type": "REG"
      }
    ],
    "summary": {
      "18": {
        "count": 5,
        "taxable": 5000,
        "gst": 900
      }
    }
  },
  "message": "GSTR data exported for 5 invoices"
}
```

**Features**:
- ✅ Queries all invoices in date range
- ✅ Groups by GST rate with aggregate summary
- ✅ Exports in GSTN-compatible JSON format
- ✅ Auto-saves export record to `gstr_exports` table for audit
- ✅ Respects tenant isolation (RLS ready)

**Database table**:
```sql
gstr_exports {
  id, tenant_id, month, year, export_data, status, created_at, updated_at
}
```

---

### 3. ✅ E-way Bill Generation API
**File**: `src/app/api/merchant/eway/generate.ts` (NEW)

**Endpoint**: `POST /api/merchant/eway/generate`

**Request**:
```json
{
  "invoice_id": "inv_abc123"
}
```

**Response**:
```json
{
  "success": true,
  "eway_bill": {
    "bill_no": "INV-001",
    "bill_date": "2026-04-15",
    "bill_value": 1180,
    "supplier_gstin": "",
    "supplier_state_code": "07",
    "customer_gstin": "07AAXFU5055K1Z0",
    "customer_state_code": "07",
    "transaction_type": "B2B",
    "invoice_value": 1180,
    "line_items": [
      {
        "hsn": "1905",
        "description": "Bread",
        "quantity": 10,
        "unit": "PCS",
        "amount": 500
      }
    ]
  },
  "eway_id": "EWAY-1714398000000",
  "message": "E-way bill generated. Submit to GST portal at: https://ewaybill.nic.in"
}
```

**Features**:
- ✅ Generates E-way bill JSON for GST portal submission
- ✅ Auto-detects transaction type (B2B if GSTIN present, B2C otherwise)
- ✅ Extracts HSN codes from invoice line items
- ✅ Includes all line items with quantity & amount
- ✅ State code mapping (returns correct GSTN state codes)
- ✅ Saves to `eway_bills` table for tracking

**Database table**:
```sql
eway_bills {
  id, tenant_id, invoice_id, eway_json, eway_no, validity_date, status, created_at, updated_at
}
```

---

### 4. ✅ ERPNext Sync Scaffolding
**File**: `src/app/api/merchant/erp/sync-invoice.ts` (NEW)

**Endpoint**: `POST /api/merchant/erp/sync-invoice`

**Request - Sync Action**:
```json
{
  "invoice_id": "inv_abc123",
  "action": "sync"
}
```

**Request - Status Check**:
```json
{
  "invoice_id": "inv_abc123",
  "action": "status"
}
```

**Response** (when ERPNext not configured):
```json
{
  "success": false,
  "error": "ERPNext credentials not configured. Add ERP_URL, ERP_API_KEY, ERP_API_SECRET to environment variables",
  "hint": "Please configure ERPNext credentials in environment variables"
}
```

**Features** (Ready for when credentials available):
- ✅ Converts BillZo invoice to ERPNext `Sales Invoice` format
- ✅ Includes line items, taxes (CGST/SGST/IGST breakdown)
- ✅ Builds ERPNext POST request with Basic Auth
- ✅ Updates invoice sync status (PENDING → SYNCED / RETRY / FAILED)
- ✅ Stores ERPNext invoice ID for reconciliation
- ✅ Custom fields for tenant tracking: `custom_billzo_invoice_id`, `custom_tenant_id`

---

### 5. ✅ Database Migrations
**Files**:
- `migrations/001_add_compliance_tables.sql` (NEW)
- Updated `schema.sql` with new tables

**Tables added**:
```sql
gstr_exports (
  id, tenant_id, month, year, export_data, status, 
  created_at, updated_at
  UNIQUE(tenant_id, month, year)
)

eway_bills (
  id, tenant_id, invoice_id, eway_json, eway_no, 
  validity_date, status, created_at, updated_at
  UNIQUE(tenant_id, invoice_id)
)
```

**Indexes added**:
- `idx_gstr_exports_tenant_month` - Fast period lookup
- `idx_eway_bills_tenant_id` - Fast tenant queries
- `idx_payments_razorpay_id` - Webhook lookups
- `idx_payments_status` - Payment status reporting

**New columns added to existing tables**:
- `payments.status` (default: 'PENDING')
- `payments.razorpay_order_id`

---

### 6. ✅ Migration Runner
**File**: `src/lib/db/migrate.ts` (NEW)

**Usage**:
```bash
npx ts-node src/lib/db/migrate.ts
```

**What it does**:
1. Creates `_migrations` table if needed
2. Reads all `.sql` files from `migrations/` folder
3. Skips already-executed migrations
4. Executes each statement in order
5. Logs progress and errors

**Features**:
- ✅ Idempotent (safe to run multiple times)
- ✅ Tracks executed migrations in database
- ✅ Handles multi-statement files (split by `;`)
- ✅ Detailed logging for debugging

---

## 🧪 Testing Phase 1

### Setup Steps

**1. Apply migrations**:
```bash
# Option A: Use migration runner (recommended)
npx ts-node src/lib/db/migrate.ts

# Option B: Run SQL manually in Neon console
# Copy content of migrations/001_add_compliance_tables.sql
# Paste in Neon → SQL Editor → Execute
```

**2. Update environment variables**:
```bash
# Copy .env.local.example to .env.local
cp .env.local.example .env.local

# Edit .env.local and add:
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_from_razorpay_dashboard
```

**Get Razorpay webhook secret**:
- Login to https://dashboard.razorpay.com
- Settings → Webhooks → Copy "Webhook Secret" for your webhook

---

### Test 1: GSTR Export

**Command**:
```bash
curl -X POST http://localhost:3000/api/merchant/reports/gstr-export \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your_session_cookie" \
  -d '{
    "from_date": "2026-04-01",
    "to_date": "2026-04-30"
  }'
```

**Expected**: 
- ✅ Returns JSON with invoices from date range
- ✅ Includes CGST/SGST/IGST breakdown
- ✅ Records export in `gstr_exports` table

**Query to verify**:
```sql
SELECT * FROM gstr_exports WHERE tenant_id = 'your_tenant_id';
```

---

### Test 2: E-way Bill Generation

**Command**:
```bash
curl -X POST http://localhost:3000/api/merchant/eway/generate \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your_session_cookie" \
  -d '{
    "invoice_id": "inv_existing_invoice_id"
  }'
```

**Expected**:
- ✅ Returns E-way bill JSON
- ✅ Includes bill_no, bill_date, line_items
- ✅ Records in `eway_bills` table

**Query to verify**:
```sql
SELECT id, status, eway_json FROM eway_bills WHERE tenant_id = 'your_tenant_id';
```

---

### Test 3: Razorpay Webhook

**How to test**:
1. Create test order via Razorpay dashboard
2. Complete payment (test mode)
3. Razorpay sends webhook to `/api/webhooks/razorpay`
4. Check payment status in database

**Query to verify payment updated**:
```sql
SELECT id, razorpay_payment_id, status, is_reconciled 
FROM payments 
WHERE tenant_id = 'your_tenant_id' 
ORDER BY created_at DESC LIMIT 1;

-- Also check invoice payment_status updated:
SELECT id, payment_status, erp_sync_status 
FROM invoices 
WHERE id = 'invoice_id' LIMIT 1;
```

---

### Test 4: ERPNext Sync Scaffolding

**Command** (will fail gracefully without credentials):
```bash
curl -X POST http://localhost:3000/api/merchant/erp/sync-invoice \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your_session_cookie" \
  -d '{
    "invoice_id": "inv_abc123",
    "action": "sync"
  }'
```

**Expected**:
- ✅ Returns error message (credentials not configured)
- ✅ Shows helpful error message
- ✅ Doesn't crash or fail ungracefully

---

## 🗺️ Architecture Summary

```
POST /api/merchant/reports/gstr-export
  → Queries invoices (tenant_id, date_range)
  → Groups by GST rate
  → Returns GSTN-compatible JSON
  → Saves export record (audit trail)

POST /api/merchant/eway/generate
  → Fetches invoice + line items
  → Builds E-way JSON (GST portal format)
  → Saves record for tracking
  → Returns ready-to-submit JSON

POST /api/webhooks/razorpay
  → Verifies signature (HMAC-SHA256)
  → Updates payments table (status, razorpay_id)
  → Updates invoices table (payment_status)
  → Ready for ERPNext sync

POST /api/merchant/erp/sync-invoice
  → Converts BillZo invoice → ERPNext format
  → Sends POST to ERPNext API (when configured)
  → Handles failures gracefully
  → Tracks sync status (PENDING/SYNCED/RETRY/FAILED)
```

---

## 📊 Database Changes Summary

**New Tables**: 2
- `gstr_exports` - GSTR export history & audit
- `eway_bills` - E-way bill generation tracking

**New Columns**: 2
- `payments.status`
- `payments.razorpay_order_id`

**New Indexes**: 7
- All optimized for common queries (tenant, invoice, date filters)

**Migration Impact**: Zero (all IF NOT EXISTS, safe to run multiple times)

---

## ⚠️ Known Limitations (Phase 1)

### Not Yet Implemented (Phase 2+):
- ❌ OTP SMS integration (no SMS provider credentials)
- ❌ WhatsApp invoice delivery (no WhatsApp API credentials)
- ❌ Real ERPNext sync (credentials not available yet)
- ❌ Audit logging trigger (Phase 2)
- ❌ Multi-warehouse support (Phase 3)

### Graceful Degradation:
- ✅ GSTR export works without any external service
- ✅ E-way bill generation works without any external service
- ✅ Razorpay webhook works with test mode
- ✅ ERPNext sync fails gracefully with helpful error message

---

## ✅ Verification Checklist

- [ ] Migrations executed successfully (`npx ts-node src/lib/db/migrate.ts`)
- [ ] Tables created in Neon (`gstr_exports`, `eway_bills` tables visible)
- [ ] Test GSTR export endpoint (returns invoice list)
- [ ] Test E-way bill endpoint (generates JSON)
- [ ] Verify payment records updated via Razorpay webhook
- [ ] Check ERPNext endpoint returns graceful error (not configured)
- [ ] All new indexes created in database

---

## 📝 Environment Variables Needed

```bash
# Already configured:
DATABASE_URL
UPSTASH_REDIS_REST_URL
SESSION_SECRET
CREDENTIAL_ENCRYPTION_KEY

# Newly needed:
RAZORPAY_WEBHOOK_SECRET=from_razorpay_dashboard  # Required for webhook verification

# Optional (will fail gracefully):
ERP_URL=http://localhost:8000
ERP_API_KEY=administrator
ERP_API_SECRET=admin
```

---

## 🚀 Next Steps (Phase 2)

After Phase 1 verification:
1. **Database Optimizations** (Week 2-4)
   - Add audit logging trigger
   - Optimize indexes further
   - Stock reservation cleanup job

2. **Feature Completion** (Week 4-6)
   - Finish Billing route (drafts)
   - Complete Parties route (unified customers+suppliers)
   - Batch barcode scanning
   - WhatsApp integration

3. **UI/UX Polish** (Week 6-8)
   - Empty states & loading skeletons
   - Mobile optimization
   - Accessibility audit

---

## 💡 Questions?

For implementation questions or issues:
1. Check migration logs: `npx ts-node src/lib/db/migrate.ts`
2. Verify Razorpay credentials in `.env.local`
3. Test endpoints with sample invoice data
4. Check database with queries above
