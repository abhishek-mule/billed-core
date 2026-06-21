#!/bin/bash
set -e

# Load env vars
export $(grep -v '^#' .env.local | xargs)

echo "=== Test 1: Check outbox table columns ==="
curl -s -X GET "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/outbox?select=*&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  | head -c 500
echo

echo ""
echo "=== Test 2: Insert whatsapp.pair.requested event ==="
CORRELATION_ID="pair:test:$(date +%s%N)"
curl -s -X POST "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/outbox" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "type": "whatsapp.pair.requested",
    "tenant_id": "test-tenant-001",
    "entity_id": null,
    "payload": {},
    "causation_id": null,
    "correlation_id": "'"${CORRELATION_ID}"'",
    "idempotency_key": "whatsapp:pair:test-tenant-001:'"$(date +%s%N)"'",
    "version": 1,
    "status": "pending",
    "next_attempt_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "attempts": 0
  }' \
  2>&1
echo
