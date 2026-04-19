#!/bin/bash
export PATH="/mnt/c/nvm4w/nodejs:$PATH"
cd /mnt/c/Users/HP/Desktop/mini_saas/mini_saas_frontend
node ./node_modules/next/dist/bin/next dev -p 3000 > /tmp/frontend.log 2>&1 &
echo "Frontend started"