#!/usr/bin/env bash
# ============================================================
# End-to-End WhatsApp Reminder Flow Test
# ============================================================
# Tests all 4 recovery stages (t0_soft → t24_nudge → t72_strong
# → t5_warning) with payment links, state machine transitions,
# and behavioral orchestration.
#
# Automatically starts the worker if not already running.
# Requires: redis-server, Supabase credentials in worker/.env
#
# Usage: bash scripts/test-reminder-flow.sh
# ============================================================
set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

export $(grep -v '^\s*#' .env | grep -v '^\s*$' | xargs)
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
API_BASE="${SUPABASE_URL}/rest/v1"

TENANT_ID="test-e2e-$(date +%s)"
CUSTOMER_ID="test-cust-${TENANT_ID}"
INVOICE_ID="test-inv-${TENANT_ID}"
WORKER_PID=""

cleanup() {
  [[ -n "$WORKER_PID" ]] && kill "$WORKER_PID" 2>/dev/null && echo -e "${YELLOW}[Worker stopped]${NC}"
}
trap cleanup EXIT

log()  { echo -e "${GREEN}[$(date +%T)]${NC} $*"; }
step() { echo -e "\n${BLUE}═══ $* ═══${NC}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

supa() {
  local method="$1" path="$2" data="$3"
  curl -sf --max-time 15 -X "$method" "${API_BASE}/${path}" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    ${data:+-d "$data"} 2>&1
}

supa_get() {
  curl -sf --max-time 10 -X GET "${API_BASE}/${1}" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" 2>/dev/null || echo "[]"
}

tsrun() {
  npx ts-node --transpile-only -r dotenv/config "$@" 2>&1
}

echo -e "${BLUE}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║     WhatsApp Reminder Flow — E2E Test Suite      ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ────────────────────────────────────────────
# STEP 0: Pre-flight checks
# ────────────────────────────────────────────
step "0 — Pre-flight checks"

if ! redis-cli ping &>/dev/null; then
  err "Redis is not running. Start: redis-server"
  exit 1
fi
log "✓ Redis is running"

if curl -sf http://localhost:10000/health &>/dev/null; then
  log "✓ Worker already running on :10000"
else
  log "Starting worker in background (port 10000)..."
  npx ts-node-dev --transpile-only -r dotenv/config --respawn index.ts &>"$SCRIPT_DIR/.worker-e2e.log" &
  WORKER_PID=$!
  log "Waiting for worker health check (up to 30s)..."
  for i in $(seq 1 30); do
    sleep 1
    if curl -sf http://localhost:10000/health &>/dev/null; then
      log "✓ Worker is healthy"
      break
    fi
    if [[ "$i" -eq 30 ]]; then
      err "Worker failed to start. Logs:"
      tail -20 "$SCRIPT_DIR/.worker-e2e.log"
      exit 1
    fi
  done
fi

# ────────────────────────────────────────────
# STEP 1: Seed test data
# ────────────────────────────────────────────
step "1 — Seeding test data (tenant: ${TENANT_ID})"

log "Creating tenant..."
supa POST tenants "{
  \"id\": \"${TENANT_ID}\",
  \"company_name\": \"Test Corp E2E\",
  \"upi_id\": \"testupi@paytm\",
  \"whatsapp_config\": { \"provider\": \"simulation\" }
}" || warn "Tenant may already exist"

log "Creating customer..."
supa POST customers "{
  \"id\": \"${CUSTOMER_ID}\",
  \"tenant_id\": \"${TENANT_ID}\",
  \"customer_name\": \"John E2E\",
  \"phone\": \"919999999988\"
}" || { err "Customer creation failed — check tenant exists and API key is valid"; exit 1; }
log "✓ Customer created: ${CUSTOMER_ID}"

STAGES=("t0_soft" "t24_nudge" "t72_strong" "t5_warning")
LABELS=("friendly reminder" "payment follow-up" "urgent reminder" "final notice")

for i in "${!STAGES[@]}"; do
  stage="${STAGES[$i]}"
  label="${LABELS[$i]}"
  step "Stage $((i+1))/4 — ${stage} (${label})"

  if [[ "$i" -eq 0 ]]; then
    log "Creating invoice..."
    supa POST invoices "{
      \"id\": \"${INVOICE_ID}\",
      \"tenant_id\": \"${TENANT_ID}\",
      \"customer_id\": \"${CUSTOMER_ID}\",
      \"invoice_number\": \"INV-E2E-${i}\",
      \"total\": 5000,
      \"status\": \"overdue\",
      \"due_date\": \"$(date -I -d '-5 days')\",
      \"recovery_stage\": \"${stage}\",
      \"next_recovery_at\": \"$(date -Iseconds -d '-1 minute')\"
    }" || warn "Invoice may already exist"
  else
    log "Advancing invoice to ${stage}..."
    supa PATCH "invoices?id=eq.${INVOICE_ID}" "{
      \"recovery_stage\": \"${stage}\",
      \"next_recovery_at\": \"$(date -Iseconds -d '-1 minute')\"
    }"
  fi

  # ── Trigger reminder processing ──
  log "Triggering enqueueOverdueReminders..."
  tsrun scripts/trigger-reminders.ts || warn "enqueue failed"

  # ── Wait for worker to process ──
  log "Waiting for worker to process (up to 20s)..."
  LAST_STATUS=""
  for wait in $(seq 1 20); do
    sleep 1
    result=$(supa_get "invoices?id=eq.${INVOICE_ID}&select=last_whatsapp_status,recovery_stage")
    current_status=$(echo "$result" | grep -oP '"last_whatsapp_status":"\K[^"]+' || true)
    if [[ -n "$current_status" && "$current_status" != "$LAST_STATUS" ]]; then
      LAST_STATUS="$current_status"
      log "Send status: ${current_status}"
      break
    fi
  done

  if [[ -z "$LAST_STATUS" ]]; then
    warn "No send detected — checking logs..."
    tail -5 "$SCRIPT_DIR/.worker-e2e.log" 2>/dev/null || true
  fi

  # ── Verify spine + outbox events ──
  spine_count="$(supa_get "events?entity_id=eq.${INVOICE_ID}&select=event_id" | grep -c event_id || true)"
  outbox_count="$(supa_get "outbox?entity_id=eq.${INVOICE_ID}&select=id" | grep -c '"id"' || true)"
  log "Spine events: ${spine_count} | Outbox events: ${outbox_count}"

  # ── Simulate delivery + read ──
  log "Simulating delivery + read receipts..."
  tsrun scripts/emit-status.ts "${TENANT_ID}" "${INVOICE_ID}" "${i}" || warn "emit-status failed"
  sleep 2

  # ── Check recovery case ──
  rc=$(supa_get "recovery_cases?customer_id=eq.${CUSTOMER_ID}&select=recovery_state,engagement_state,next_action,attention_score")
  if [[ "$rc" != "[]" ]]; then
    rec=$(echo "$rc" | grep -oP '"recovery_state":"\K[^"]+' || echo "null")
    eng=$(echo "$rc" | grep -oP '"engagement_state":"\K[^"]+' || echo "null")
    act=$(echo "$rc" | grep -oP '"next_action":"\K[^"]+' || echo "null")
    att=$(echo "$rc" | grep -oP '"attention_score":\K[0-9.]+' || echo "null")
    log "Case: ${rec} | Engagement: ${eng} | Action: ${act} | Attention: ${att}"
  else
    warn "No recovery_case yet"
  fi

done

# ────────────────────────────────────────────
# STEP 8: Payment link click + payment
# ────────────────────────────────────────────
step "Simulating payment link click + payment completed"

tsrun scripts/emit-payment-flow.ts "${TENANT_ID}" "${INVOICE_ID}" || warn "emit-payment-flow failed"
sleep 3

# ────────────────────────────────────────────
# STEP 9: Final state verification
# ────────────────────────────────────────────
step "Final state verification"

echo ""
echo -e "${BLUE}── Invoice ──${NC}"
supa_get "invoices?id=eq.${INVOICE_ID}&select=id,recovery_stage,status,last_whatsapp_status" | python3 -m json.tool 2>/dev/null || echo "(raw)"

echo -e "${BLUE}── Spine Events (last 10) ──${NC}"
supa_get "events?entity_id=eq.${INVOICE_ID}&select=event_id,entity_type,sequence_no,source_system&order=sequence_no.asc&limit=10" | python3 -m json.tool 2>/dev/null || echo "(raw)"

echo -e "${BLUE}── Outbox Events (last 10) ──${NC}"
supa_get "outbox?entity_id=eq.${INVOICE_ID}&select=id,type,status&order=created_at.asc&limit=10" | python3 -m json.tool 2>/dev/null || echo "(raw)"

echo -e "${BLUE}── Recovery Case ──${NC}"
supa_get "recovery_cases?customer_id=eq.${CUSTOMER_ID}&select=*" | python3 -m json.tool 2>/dev/null || echo "(none)"

echo -e "${BLUE}── Behavioral Metrics ──${NC}"
supa_get "customer_behavioral_metrics?customer_id=eq.${CUSTOMER_ID}&select=observation_count,read_rate,payment_conversion_rate,updated_at" | python3 -m json.tool 2>/dev/null || echo "(none)"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Test complete — tenant: ${TENANT_ID}${NC}"
echo -e "${GREEN}  Worker logs: .worker-e2e.log${NC}"
echo -e "${GREEN}  To clean up:${NC}"
echo -e "${GREEN}    curl -X DELETE \"\${API_BASE}/invoices?id=eq.${INVOICE_ID}\" -H \"apikey: \${SUPABASE_KEY}\" -H \"Authorization: Bearer \${SUPABASE_KEY}\"${NC}"
echo -e "${GREEN}    curl -X DELETE \"\${API_BASE}/customers?id=eq.${CUSTOMER_ID}\" ...${NC}"
echo -e "${GREEN}    curl -X DELETE \"\${API_BASE}/tenants?id=eq.${TENANT_ID}\" ...${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
