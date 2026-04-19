#!/bin/bash
# Site Provisioning Script
# Usage: ./scripts/provision.sh <tenant_id> <domain> [plan]

set -e

TENANT_ID="$1"
DOMAIN="$2"
PLAN="${3:-starter}"
DB_PASSWORD="${DB_PASSWORD:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"
TEMPLATE_SITE="${TEMPLATE_SITE:-template.site}"
SITES_DIR="/home/frappe/frappe-bench/sites"

if [ -z "$TENANT_ID" ] || [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <tenant_id> <domain> [plan]"
    exit 1
fi

echo "[$(date)] Starting provisioning for $TENANT_ID..."

# Check if site exists
if [ -d "$SITES_DIR/$TENANT_ID" ]; then
    echo "Error: Tenant $TENANT_ID already exists"
    exit 1
fi

# Clone from template (fast!)
START_TIME=$(date +%s)
bench clone-site "$TEMPLATE_SITE" "$TENANT_ID" \
    --mariadb-root-password "$DB_PASSWORD" \
    --new-site-name "$DOMAIN" \
    --admin-password "$ADMIN_PASSWORD" \
    --source-site "$TEMPLATE_SITE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "[$(date)] Provisioned $TENANT_ID in ${DURATION}s"

# Log provisioning
echo "$TENANT_ID,$DOMAIN,$PLAN,$(date),${DURATION}s" >> /var/log/provisioning.log

echo "Success: $TENANT_ID provisioned in ${DURATION}s"
exit 0