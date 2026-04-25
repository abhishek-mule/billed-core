# BillZo Deployment Guide

## Quick Deploy Options

### Option 1: Vercel (Recommended - Free)

```bash
# 1. Push to GitHub
git add .
git commit -m "Ready for deployment"
git push origin main

# 2. Import to Vercel
# Go to https://vercel.com/new
# Import your GitHub repo
# Add environment variables:
DATABASE_URL=postgresql://... (Neon)
UPSTASH_REDIS_REST_URL=https://... 
UPSTASH_REDIS_REST_TOKEN=...
SESSION_SECRET=...
CREDENTIAL_ENCRYPTION_KEY=...

# 3. Deploy - Done!
```

### Option 2: Railway ($5/month)

```bash
# 1. Push to GitHub
git add .
git commit -m "Ready for deployment"  
git push origin main

# 2. Import at https://railway.app
# 3. Add PostgreSQL plugin (free tier)
# 4. Add Redis plugin (optional)
# 5. Deploy
```

### Option 3: Local Production

```bash
# Build for production
npm run build

# Start production server
npm start

# Requires:
# - PostgreSQL database
# - Redis (Upstash or local)
```

---

## Environment Variables Required

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | ✅ | PostgreSQL connection |
| UPSTASH_REDIS_REST_URL | ✅ | Redis connection |
| UPSTASH_REDIS_REST_TOKEN | ✅ | Redis auth token |
| SESSION_SECRET | ✅ | For session security |
| CREDENTIAL_ENCRYPTION_KEY | ✅ | Encrypt credentials |
| N8N_WEBHOOK_URL | ❌ | n8n automation |
| N8N_WEBHOOK_SECRET | ❌ | n8n webhook auth |
| ERP_URL | ❌ | ERPNext backend |
| RAZORPAY_KEY_ID | ❌ | Payments |

---

## Free Service Sign-ups

1. **Database**: https://neon.tech (Free 0.5GB)
2. **Redis**: https://upstash.io (Free 10K cmd/day)
3. **Hosting**: https://vercel.com (Free)
4. **n8n**: Self-host or https://n8n.io/cloud

---

## Cost Estimate

| Service | Free Tier | Paid Tier |
|---------|-----------|----------|
| Vercel Hosting | ✅ (personal) | $20/mo |
| Neon DB | ✅ | $10/mo |
| Upstash Redis | ✅ | $5/mo |
| **Total** | **₹0** | **~₹1,500** |