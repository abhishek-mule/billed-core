#!/bin/bash
# Phase 1 Verification Script
# Tests all Phase 1 implementations
# Usage: bash verify-phase1.sh

echo "🔍 Phase 1 Verification Script"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function
check_file() {
  local file=$1
  local name=$2
  if [ -f "$file" ]; then
    echo -e "${GREEN}✅${NC} $name exists"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌${NC} $name missing: $file"
    ((TESTS_FAILED++))
  fi
}

check_dir() {
  local dir=$1
  local name=$2
  if [ -d "$dir" ]; then
    echo -e "${GREEN}✅${NC} $name directory exists"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌${NC} $name directory missing: $dir"
    ((TESTS_FAILED++))
  fi
}

check_content() {
  local file=$1
  local pattern=$2
  local name=$3
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo -e "${GREEN}✅${NC} $name found in $file"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌${NC} $name NOT found in $file"
    ((TESTS_FAILED++))
  fi
}

echo "📁 Checking file structure..."
check_file "src/app/api/webhooks/razorpay/route.ts" "Razorpay webhook (enhanced)"
check_file "src/app/api/merchant/reports/gstr-export.ts" "GSTR export API"
check_file "src/app/api/merchant/eway/generate.ts" "E-way bill API"
check_file "src/app/api/merchant/erp/sync-invoice.ts" "ERPNext sync API"
check_file "src/lib/db/migrate.ts" "Migration runner"
check_file "migrations/001_add_compliance_tables.sql" "Database migration file"
check_file ".env.local.example" ".env.local.example"

echo ""
echo "📋 Checking directory structure..."
check_dir "src/app/api/merchant/reports" "Reports API folder"
check_dir "src/app/api/merchant/eway" "E-way API folder"
check_dir "src/app/api/merchant/erp" "ERP API folder"
check_dir "migrations" "Migrations folder"

echo ""
echo "🔎 Checking implementation details..."
check_content "src/app/api/webhooks/razorpay/route.ts" "updatePaymentStatus" "Payment database update"
check_content "src/app/api/merchant/reports/gstr-export.ts" "buildGSTRExport" "GSTR builder function"
check_content "src/app/api/merchant/eway/generate.ts" "STATE_CODES" "State code mapping"
check_content "src/app/api/merchant/erp/sync-invoice.ts" "buildERPInvoice" "ERP invoice builder"
check_content "migrations/001_add_compliance_tables.sql" "gstr_exports" "GSTR exports table migration"
check_content "migrations/001_add_compliance_tables.sql" "eway_bills" "E-way bills table migration"

echo ""
echo "📝 Checking schema updates..."
check_content "schema.sql" "gstr_exports" "GSTR exports in schema"
check_content "schema.sql" "eway_bills" "E-way bills in schema"
check_content "schema.sql" "ALTER TABLE payments" "Payment schema update"

echo ""
echo "🔐 Checking environment config..."
check_content ".env.local.example" "RAZORPAY_WEBHOOK_SECRET" "Webhook secret in env"
check_content ".env.local.example" "ERP_URL" "ERP config in env"

echo ""
echo "=============================="
echo "Test Results:"
echo -e "${GREEN}✅ Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
  echo -e "${RED}❌ Failed: $TESTS_FAILED${NC}"
else
  echo -e "${GREEN}❌ Failed: 0${NC}"
fi
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 All Phase 1 files verified!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Copy .env.local.example to .env.local"
  echo "2. Add RAZORPAY_WEBHOOK_SECRET to .env.local"
  echo "3. Run migrations: npx ts-node src/lib/db/migrate.ts"
  echo "4. Test endpoints (see PHASE1_IMPLEMENTATION.md)"
  exit 0
else
  echo -e "${RED}⚠️ Some files missing or incorrect${NC}"
  exit 1
fi
