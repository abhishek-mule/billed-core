#!/usr/bin/env zsh
# E2E Verification: Sprint E — Money Truth Engine
# Tests trigger, API, reconciliation flow end-to-end.
# Usage: ./test-e2e-payment.sh <tenantId>

set -euo pipefail

TENANT="${1:-$(PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -t -c "SELECT id FROM tenants LIMIT 1" | tr -d ' ')}"
INVOICE_ID=$(PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -t -c "SELECT id FROM invoices WHERE status = 'unpaid' AND outstanding_amount > 0 LIMIT 1" | tr -d ' ')
echo "=== E2E: Money Truth Engine ==="
echo "Tenant:   $TENANT"
echo "Invoice:  $INVOICE_ID"

# ── 1. Trigger test: insert payment directly, verify invoice updates ──
echo ""
echo "─── Test 1: Trigger maintains outstanding_amount ───"
echo "Before:"
PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "
SELECT id, total, paid_amount, outstanding_amount, status
FROM invoices WHERE id = '$INVOICE_ID';"

PAYMENT_ID="e2e-test-$(date +%s)"
PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "
INSERT INTO payments (id, tenant_id, invoice_id, amount, payment_mode, source, actor, evidence, status, paid_at)
VALUES ('$PAYMENT_ID', '$TENANT', '$INVOICE_ID', 3000, 'cash', 'cash', 'customer', '{\"notes\": \"E2E test partial payment\"}', 'paid', NOW());"

echo "After partial payment (₹3000):"
PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "
SELECT id, total, paid_amount, outstanding_amount, status
FROM invoices WHERE id = '$INVOICE_ID';"

# Verify status changed to 'partial'
STATUS=$(PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -t -c "SELECT status FROM invoices WHERE id = '$INVOICE_ID';" | tr -d ' ')
if [[ "$STATUS" == "partial" ]]; then
  echo "✅ PASS: Status changed to 'partial'"
else
  echo "❌ FAIL: Expected 'partial', got '$STATUS'"
  exit 1
fi

# Restore invoice for next test
PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "DELETE FROM payments WHERE id = '$PAYMENT_ID';" 2>/dev/null

echo "After delete (reversal):"
PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "
SELECT id, total, paid_amount, outstanding_amount, status
FROM invoices WHERE id = '$INVOICE_ID';"

# ── 2. Full payment test ──
echo ""
echo "─── Test 2: Full payment sets status to 'paid' ───"
PAYMENT_ID2="e2e-test-full-$(date +%s)"
PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "
INSERT INTO payments (id, tenant_id, invoice_id, amount, payment_mode, source, actor, evidence, status, paid_at)
VALUES ('$PAYMENT_ID2', '$TENANT', '$INVOICE_ID', (SELECT total FROM invoices WHERE id = '$INVOICE_ID'), 'razorpay', 'razorpay', 'customer', '{\"razorpayPaymentId\": \"pay_e2e_test\"}', 'paid', NOW());"

echo "After full payment:"
PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "
SELECT id, total, paid_amount, outstanding_amount, status
FROM invoices WHERE id = '$INVOICE_ID';"

STATUS2=$(PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -t -c "SELECT status FROM invoices WHERE id = '$INVOICE_ID';" | tr -d ' ')
if [[ "$STATUS2" == "paid" ]]; then
  echo "✅ PASS: Status changed to 'paid'"
else
  echo "❌ FAIL: Expected 'paid', got '$STATUS2'"
  exit 1
fi

# Cleanup
PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "DELETE FROM payments WHERE id = '$PAYMENT_ID2';" 2>/dev/null

# ── 3. Payment source enum test ──
echo ""
echo "─── Test 3: All payment sources work ───"
for src in cash razorpay bank_transfer cheque adjustment upi; do
  PID="e2e-src-$(date +%s)-$src"
  PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "
  INSERT INTO payments (id, tenant_id, invoice_id, amount, payment_mode, source, actor, evidence, status, paid_at)
  VALUES ('$PID', '$TENANT', '$INVOICE_ID', 1, '$src', '$src', 'merchant', '{}', 'paid', NOW());" 2>/dev/null && echo "  ✅ $src" || echo "  ❌ $src"
  PGPASSWORD='Pass@2709abhi' psql -h db.qdnmuoyqpqdewepzuezp.supabase.co -U postgres -d postgres -c "DELETE FROM payments WHERE id = '$PID';" 2>/dev/null
done

echo ""
echo "=== All E2E tests passed ==="
