#!/usr/bin/env bash
# =============================================================================
# Billed-Core / Mini-SaaS — Full Stack Rebuild Script
# Run from WSL: bash /mnt/c/Users/HP/Desktop/mini_saas/rebuild_stack.sh
# =============================================================================
set -e

FRAPPE_DIR="/mnt/c/Users/HP/Desktop/mini_saas/frappe_docker"
PROJECT_NAME="frappe_docker"
ERPNEXT_IMAGE="frappe/erpnext:v16.13.3"

echo "============================================================"
echo "  Billed-Core Stack Rebuild"
echo "============================================================"

# ── Step 1: Pull ERPNext image ─────────────────────────────────
echo ""
echo "[1/5] Pulling ERPNext image: $ERPNEXT_IMAGE"
docker pull --platform linux/amd64 "$ERPNEXT_IMAGE"
echo "      ✓ Image ready"

# ── Step 2: Ensure data directories exist ─────────────────────
echo ""
echo "[2/5] Ensuring data directories exist..."
mkdir -p "$FRAPPE_DIR/data/sites"
mkdir -p "$FRAPPE_DIR/data/assets"
echo "      ✓ Directories OK"

# ── Step 3: Tear down any stale containers ────────────────────
echo ""
echo "[3/5] Removing any stale containers from previous run..."
cd "$FRAPPE_DIR"
docker compose \
  -p "$PROJECT_NAME" \
  -f compose.yaml \
  -f overrides/compose.mariadb.yaml \
  -f overrides/compose.redis.yaml \
  -f overrides/compose.noproxy.yaml \
  down --remove-orphans 2>/dev/null || true
echo "      ✓ Cleaned up"

# ── Step 4: Start the full stack ─────────────────────────────
echo ""
echo "[4/5] Starting ERPNext + MariaDB + Redis stack..."
cd "$FRAPPE_DIR"
docker compose \
  -p "$PROJECT_NAME" \
  -f compose.yaml \
  -f overrides/compose.mariadb.yaml \
  -f overrides/compose.redis.yaml \
  -f overrides/compose.noproxy.yaml \
  up -d

echo "      ✓ Stack launched"

# ── Step 5: Wait and verify ───────────────────────────────────
echo ""
echo "[5/5] Waiting 15s for services to stabilise..."
sleep 15

echo ""
echo "──── Container Status ────────────────────────────────────"
docker compose -p "$PROJECT_NAME" \
  -f "$FRAPPE_DIR/compose.yaml" \
  -f "$FRAPPE_DIR/overrides/compose.mariadb.yaml" \
  -f "$FRAPPE_DIR/overrides/compose.redis.yaml" \
  -f "$FRAPPE_DIR/overrides/compose.noproxy.yaml" \
  ps

echo ""
echo "──── ERPNext Backend Logs (last 20 lines) ───────────────"
docker logs "${PROJECT_NAME}-backend-1" --tail 20 2>/dev/null || \
docker logs "frappe_docker-backend-1" --tail 20 2>/dev/null || \
echo "(backend not yet named — check with: docker ps)"

echo ""
echo "============================================================"
echo "  Services should be available at:"
echo "    ERPNext  →  http://localhost:8080   (login: admin / admin)"
echo "    n8n      →  start separately if needed"
echo "============================================================"
