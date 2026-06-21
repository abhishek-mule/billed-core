#!/bin/bash
# Quick health check script for Billed-Core

BASE_URL="${BASE_URL:-http://localhost:8080}"
SITE_NAME="${SITE_NAME:-erp.example.com}"

echo "🔍 Billed-Core Health Check"
echo "=============================="

# 1. Test Backend
echo -n "Backend API: "
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/method/ping" 2>/dev/null || echo "000")
if [ "$RESP" = "200" ]; then
    echo "✅ OK"
else
    echo "❌ Failed ($RESP)"
fi

# 2. Test Login
echo -n "Login: "
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/method/login" \
    -H "Content-Type: application/json" \
    -d '{"usr":"Administrator","pwd":"admin"}' 2>/dev/null || echo "000")
if [ "$RESP" = "200" ]; then
    echo "✅ OK"
else
    echo "❌ Failed ($RESP)"
fi

# 3. Test Site Status
echo -n "Site Status: "
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/method/frappe.boot.get_bootinfo" 2>/dev/null || echo "000")
if [ "$RESP" = "200" ]; then
    echo "✅ OK"
else
    echo "❌ Failed ($RESP)"
fi

# 4. Test Assets
echo -n "Assets: "
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/assets/frappe/dist/js/frappe-web.bundle.js" 2>/dev/null || echo "000")
if [ "$RESP" = "200" ]; then
    echo "✅ OK"
else
    echo "❌ Failed ($RESP)"
fi

# 5. Test Database
echo -n "Database: "
RESP=$(docker exec production-db-1 mariadb -uroot -padmin -e "SELECT 1" 2>/dev/null && echo "200" || echo "000")
if [ "$RESP" = "200" ]; then
    echo "✅ OK"
else
    echo "❌ Failed"
fi

# 6. Docker Services
echo ""
echo "Docker Services:"
docker ps --format "  {{.Names}}: {{.Status}}" | grep production-

echo ""
echo "=============================="
echo "✅ Health check complete"