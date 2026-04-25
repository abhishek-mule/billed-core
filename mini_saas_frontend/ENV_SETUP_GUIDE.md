# BillZo Environment Setup Guide

## Quick Start (Minimum Required)

### 1. Database (PostgreSQL - Required)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/billzo
# Or use Neon: Get from https://console.neon.tech
DATABASE_URL=postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/billzo?sslmode=require
```

### 2. Redis (Upstash - Required for sessions)
```env
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
# Get from https://console.upstash.io
```

### 3. Session Security
```env
SESSION_SECRET=any-random-32-character-string-change-in-production
SESSION_COOKIE_NAME=billzo_session
```

### 4. Encryption Key
```env
CREDENTIAL_ENCRYPTION_KEY=billzo-encryption-key-32bytes!!
```

---

## Optional Services

### 5. n8n (Workflow Automation)
```env
# Get from n8n at http://localhost:5678
N8N_WEBHOOK_URL=http://localhost:5678/webhook/setup-shop
N8N_WEBHOOK_SECRET=change-this-secret
```

### 6. ERPNext (Accounting Backend)
```env
# Local or cloud ERPNext instance
ERP_URL=http://localhost:8000
ERP_API_KEY=administrator
ERP_API_SECRET=admin
```

### 7. Razorpay (Payments)
```env
# Get from https://dashboard.razorpay.com/app/keys
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_XXXXX
RAZORPAY_KEY_ID=rzp_test_XXXXX
RAZORPAY_KEY_SECRET=XXXX
```

### 8. WhatsApp (Gupshup)
```env
WHATSAPP_PROVIDER=gupshup
GUPSHUP_API_KEY=your-gupshup-api-key
```

### 9. Sentry (Error Tracking - Optional)
```env
SENTRY_DSN=
```

---

## Testing Locally (No External Services Needed)

1. **Create test tenant:**
```bash
curl -X POST http://localhost:3000/api/test-setup \
  -H "Content-Type: application/json" \
  -d '{"testMode": "enable-test-mode"}'
```

2. **Login with test credentials:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919999999999", "password": "test123"}'
```

3. **Test invoice creation** (requires login cookie):
```bash
curl -b cookies.txt http://localhost:3000/api/merchant/invoices
```

---

## Deployment Costs

### Free Tier Options:
- **Database**: Neon (Free tier - 0.5GB)
- **Redis**: Upstash (Free tier - 10K commands/day)
- **n8n**: Self-host or free cloud tier
- **Hosting**: Vercel (Free), Railway (Free $5 credit)

### Estimated Monthly Cost (Production):
- Database: ₹0-500 (Neon)
- Redis: ₹0-200 (Upstash)  
- n8n: ₹0 (self-host) or ₹500
- Hosting: ₹0 (Vercel) or ₹300 (Railway)

**Total: ₹0-1,500/month**