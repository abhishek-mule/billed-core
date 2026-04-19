#!/bin/bash

set -e

if [[ -z "$BACKEND" ]]; then
    export BACKEND=backend:8000
fi
if [[ -z "$SOCKETIO" ]]; then
    export SOCKETIO=websocket:9000
fi
if [[ -z "$FRAPPE_SITE_NAME_HEADER" ]]; then
    export FRAPPE_SITE_NAME_HEADER='$host'
fi
if [[ -z "$CLIENT_MAX_BODY_SIZE" ]]; then
    export CLIENT_MAX_BODY_SIZE=50m
fi
if [[ -z "$PROXY_READ_TIMEOUT" ]]; then
    export PROXY_READ_TIMEOUT=120
fi

# Create symlinks for assets from apps to sites/assets
echo "Setting up asset symlinks..."
mkdir -p /home/frappe/frappe-bench/sites/assets

# Link frappe, erpnext, india_compliance apps to sites assets
for app_dir in /home/frappe/frappe-bench/apps/*/; do
    app_name=$(basename "$app_dir")
    public_dir="$app_dir$app_name/public"
    if [[ -d "$public_dir" ]] && [[ ! -L "/home/frappe/frappe-bench/sites/assets/$app_name" ]]; then
        ln -s "$public_dir" "/home/frappe/frappe-bench/sites/assets/$app_name"
        echo "Linked $app_name"
    fi
done

# Run the original entrypoint
exec /usr/local/bin/nginx-entrypoint.sh "$@"