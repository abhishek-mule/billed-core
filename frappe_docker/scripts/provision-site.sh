#!/bin/bash
# Frappe Site Provisioning Script
# Usage: ./provision-site.sh <shop_name> <email> <phone> <owner_name> <plan> <admin_password>
# Example: ./provision-site.sh "Sharma Electronics" "test@email.com" "9876543210" "Rajesh Sharma" "starter" "SecurePass123"

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default values
BACKEND_CONTAINER="frappe_docker-backend-1"
SITES_PATH="./data/sites"

# Parse arguments
if [ $# -lt 5 ]; then
    echo -e "${RED}Usage: $0 <shop_name> <email> <phone> <owner_name> <plan> [admin_password]${NC}"
    exit 1
fi

SHOP_NAME="$1"
EMAIL="$2"
PHONE="$3"
OWNER_NAME="$4"
PLAN="$5"
ADMIN_PASSWORD="${6:-}"

# Generate slug from shop name
generate_slug() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]+/-/g' | sed 's/^-/-/g' | sed 's/-$//' | cut -c1-50
}

# Generate random password if not provided
generate_password() {
    if [ -z "$1" ]; then
        echo "Billed@$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 12)"
    else
        echo "$1"
    fi
}

# Main provisioning
SLUG=$(generate_slug "$SHOP_NAME")
FULL_SITE_NAME="${SLUG}.localhost"
PASSWORD=$(generate_password "$ADMIN_PASSWORD")

echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}         BILLED - FRAPPE SITE PROVISIONING${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Shop Name:     ${GREEN}$SHOP_NAME${NC}"
echo -e "Slug:         ${GREEN}$SLUG${NC}"
echo -e "Full Site:    ${GREEN}$FULL_SITE_NAME${NC}"
echo -e "Email:        ${GREEN}$EMAIL${NC}"
echo -e "Plan:         ${GREEN}$PLAN${NC}"
echo ""

# Check if site already exists
if [ -d "$SITES_PATH/$FULL_SITE_NAME" ]; then
    echo -e "${RED}✗ Error: Site $FULL_SITE_NAME already exists!${NC}"
    exit 1
fi

echo -e "${YELLOW}→ Step 1: Creating new site...${NC}"

# Create new site with Frappe
docker exec $BACKEND_CONTAINER bench new-site $FULL_SITE_NAME \
    --admin-password "$PASSWORD" \
    --install-app erpnext \
    2>&1 | while read line; do echo "  $line"; done

echo -e "${GREEN}✓ Site created successfully${NC}"
echo ""

echo -e "${YELLOW}→ Step 2: Installing India Compliance...${NC}"
docker exec $BACKEND_CONTAINER bench --site $FULL_SITE_NAME \
    install-app india_compliance \
    2>&1 | while read line; do echo "  $line"; done

echo -e "${GREEN}✓ India Compliance installed${NC}"
echo ""

echo -e "${YELLOW}→ Step 3: Installing Electrical Trader Pack...${NC}"
docker exec $BACKEND_CONTAINER bench --site $FULL_SITE_NAME \
    install-app electrical_trader_pack \
    2>&1 | while read line; do echo "  $line"; done

echo -e "${GREEN}✓ Electrical Trader Pack installed${NC}"
echo ""

echo -e "${YELLOW}→ Step 4: Creating user account...${NC}"
FIRST_NAME=$(echo "$OWNER_NAME" | cut -d' ' -f1)
LAST_NAME=$(echo "$OWNER_NAME" | cut -d' ' -f2-)

# Create user (if not exists)
docker exec $BACKEND_CONTAINER bench --site $FULL_SITE_NAME \
    create-user "$EMAIL" \
    --first-name "$FIRST_NAME" \
    --last-name "$LAST_NAME" \
    --password "$PASSWORD" \
    2>&1 | while read line; do echo "  $line"; done || true

# Add System Manager role
docker exec $BACKEND_CONTAINER bench --site $FULL_SITE_NAME \
    add-user-role "$EMAIL" "System Manager" \
    2>&1 | while read line; do echo "  $line"; done || true

echo -e "${GREEN}✓ User account created${NC}"
echo ""

echo -e "${YELLOW}→ Step 5: Configuring company...${NC}"
docker exec $BACKEND_CONTAINER bench --site $FULL_SITE_NAME \
    execute electrical_trader_pack.api.setup_company \
    --kwargs "{\"company_name\": \"$SHOP_NAME\", \"email\": \"$EMAIL\", \"phone\": \"$PHONE\", \"plan\": \"$PLAN\"}" \
    2>&1 | while read line; do echo "  $line"; done || true

echo -e "${GREEN}✓ Company configured${NC}"
echo ""

# Enable scheduler
docker exec $BACKEND_CONTAINER bench --site $FULL_SITE_NAME \
    set-config enable_scheduler 1 \
    2>&1 | while read line; do echo "  $line"; done || true

echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}         PROVISIONING COMPLETE! 🎉${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Site URL:      ${GREEN}http://$FULL_SITE_NAME${NC}"
echo -e "Login Email:   ${GREEN}$EMAIL${NC}"
echo -e "Password:      ${GREEN}$PASSWORD${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Visit http://$FULL_SITE_NAME"
echo "2. Login with your credentials"
echo "3. Complete your business profile"
echo ""
