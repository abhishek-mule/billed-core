#!/bin/bash
# FAST Site Provisioning 
# Uses local files + config update (defer DB clone)
# Target: <10s provisioning time

TENANT_ID="$1"
DOMAIN="$2"
PLAN="${3:-starter}"

DB_PASSWORD="admin"
SITES_DIR="/home/frappe/frappe-bench/sites"

log() { echo "[$(date +%H:%M:%S)] $1"; }

if [ -z "$TENANT_ID" ] || [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <tenant_id> <domain> [plan]"
    exit 1
fi

log "🚀 Starting FAST provisioning..."
START_TIME=$(date +%s%3N)

TEMPLATE_SITE="template.site"

# Step 1: Copy site files (instant - <1s)
log "📋 Copying site files..."
cp -r "$SITES_DIR/$TEMPLATE_SITE" "$SITES_DIR/$TENANT_ID"

# Step 2: Clone database (via mariadb service)
log "🗄️ Cloning database..."
TEMPLATE_DB=$(grep -o '"db_name": "[^"]*' "$SITES_DIR/$TEMPLATE_SITE/site_config.json" | cut -d'"' -f4)
NEW_DB="tenant_$(echo $TENANT_ID | sed 's/-/_/g')"

# Clone database using db container
docker exec production-db-1 bash -c "mariadb -uroot -p$DB_PASSWORD -e 'CREATE DATABASE IF NOT EXISTS $NEW_DB;'"
docker exec production-db-1 bash -c "mysqldump -uroot -p$DB_PASSWORD $TEMPLATE_DB | mariadb -uroot -p$DB_PASSWORD $NEW_DB"

# Step 3: Update site config
log "⚙️ Updating configuration..."
python3 << PYEOF
import json
config = {
    "db_name": "$NEW_DB",
    "db_type": "mariadb",
    "db_user": "root",
    "db_password": "$DB_PASSWORD",
    "plan": "$PLAN",
    "domain": "$DOMAIN"
}
with open("$SITES_DIR/$TENANT_ID/site_config.json", "w") as f:
    json.dump(config, f, indent=2)
PYEOF

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

log "✅ Provisioned $TENANT_ID in ${DURATION}ms"

if [ $DURATION -lt 10000 ]; then
    log "🎯 TARGET MET: <10s provisioning!"
fi

exit 0