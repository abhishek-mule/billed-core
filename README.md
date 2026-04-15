# Billed - Mini SaaS Platform

A multi-tenant GST billing SaaS for Indian retailers, powered by **Next.js + n8n + Frappe/ERPNext**.

## Architecture

```
┌─────────────────────────────────────────────────┐
│           NEXT.JS FRONTEND (Port 3000)          │
│  3-Step Onboarding Wizard → /api/onboard        │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│            N8N ORCHESTRATOR (Port 5678)         │
│  Webhook → GSTIN Validation → Payment → Frappe   │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│          FRAPPE DOCKER STACK                    │
│  backend:8000 | frontend:80 | websocket:9000    │
│  data/sites/ (per-customer sites)               │
└─────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start the Stack

```bash
cd infra
docker compose up -d
```

This starts:
- Frappe backend + frontend
- n8n orchestrator

### 2. Access Services

| Service | URL |
|---------|-----|
| Frappe Dashboard | http://client.localhost |
| n8n Workflows | http://n8n.localhost:5678 |
| Next.js Frontend | http://localhost:3000 |

### 3. Import n8n Workflow

1. Open n8n at http://n8n.localhost:5678
2. Import workflow from: `n8n_workflows/workflows/setup-shop.json`

## Project Structure

```
mini_saas/
├── frappe_docker/           # Frappe/ERPNext backend
├── mini_saas_frontend/      # Next.js landing page
├── n8n_workflows/           # n8n automation workflows
│   └── workflows/
│       └── setup-shop.json  # Main onboarding workflow
└── infra/                   # Docker compose + configs
    ├── docker-compose.yml
    └── .env
```

## Onboarding Flow

```
User Browser
     │
     ▼
┌─────────────────────────────────────────────┐
│  STEP 1: Shop Details (Name + Category)    │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  STEP 2: Identity (GSTIN/Aadhar + Contact) │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  STEP 3: Plan Selection + Payment          │
│                                             │
│  ┌─────┐  ┌─────────┐  ┌─────────┐        │
│  │Free │  │Starter  │  │  Pro   │         │
│  │ ₹0  │  │ ₹499/mo │  │₹999/mo │         │
│  └─────┘  └────┬────┘  └────┬────┘        │
│                │            │               │
│                ▼            ▼               │
│         ┌─────────────────────────┐         │
│         │   Razorpay Checkout    │         │
│         │   (Popup + Payment)    │         │
│         └───────────┬─────────────┘         │
└─────────────────────┼───────────────────────┘
                      │
                      ▼ POST /api/onboard
┌─────────────────────────────────────────────┐
│           N8N WEBHOOK RECEIVER             │
│                                             │
│  1. Verify Razorpay signature              │
│  2. Check payment.captured event          │
│  3. Extract order notes (plan, shopName)   │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│        FRAPPE SITE CREATION                │
│                                             │
│  bench new-site {slug}.localhost \          │
│    --install-app erpnext \                 │
│    --install-app india_compliance \        │
│    --install-app electrical_trader_pack    │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│         SEND CREDENTIALS                   │
│                                             │
│  📧 Email: Login URL + Credentials         │
│  💬 WhatsApp: Welcome message              │
└─────────────────────────────────────────────┘
```

## Payment Flow

| Step | Description |
|------|-------------|
| 1 | User selects paid plan (Starter/Pro) |
| 2 | Frontend calls `/api/create-order` |
| 3 | Backend creates Razorpay order |
| 4 | Razorpay popup appears |
| 5 | User completes payment |
| 6 | Frontend receives `razorpay_payment_id` |
| 7 | Frontend calls `/api/onboard` with payment ID |
| 8 | n8n creates Frappe site |

## Environment Variables

### mini_saas_frontend/.env.local
```bash
# n8n
N8N_WEBHOOK_URL=http://localhost:5678/webhook/setup-shop
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Razorpay (Get from https://dashboard.razorpay.com/app/keys)
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXX
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXX
```

## Razorpay Setup

1. Create account at https://dashboard.razorpay.com
2. Go to Settings → API Keys
3. Copy Test Key ID and Secret
4. Add to `.env.local`
5. Set webhook URL: `https://your-domain.com/webhook/razorpay-webhook`

## Phase 4: Frappe Site Provisioning

### Docker Socket Access (Already Configured)
n8n has access to Docker socket for running `docker exec` commands:
```yaml
# infra/docker-compose.yml
n8n:
  user: "0:0"  # Root access
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

### Provisioning Flow

```
┌────────────────────────────────────────────────────────────┐
│                   SITE PROVISIONING                         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  1. Generate Slug + Password                               │
│     "Sharma Electronics" → "sharma-electronics"            │
│                                                            │
│  2. Check Duplicate                                        │
│     Verify site doesn't exist                              │
│                                                            │
│  3. Create Site                                           │
│     docker exec bench new-site {slug}.localhost            │
│                                                            │
│  4. Wait for Database (60s)                               │
│     Frappe needs time to cook                            │
│                                                            │
│  5. Install Apps                                           │
│     - india_compliance                                    │
│     - electrical_trader_pack                              │
│                                                            │
│  6. Create User                                            │
│     - Create user with email                              │
│     - Add System Manager role                             │
│                                                            │
│  7. Configure Company                                      │
│     - Execute setup_company API                           │
│     - Create default warehouses                           │
│     - Create chart of accounts                            │
│                                                            │
│  8. Send Credentials                                       │
│     - Email with login details                           │
│     - WhatsApp notification                              │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Manual Site Creation (Shell Script)

```bash
cd frappe_docker

# Run provisioning script
./scripts/provision-site.sh \
    "Sharma Electronics" \
    "sharma@email.com" \
    "9876543210" \
    "Ramesh Sharma" \
    "starter" \
    "SecurePass123"
```

### n8n Workflows

| Workflow | Purpose |
|----------|---------|
| `setup-shop.json` | Basic onboarding (no payment) |
| `razorpay-webhook.json` | Payment verification |
| `frappe-site-provisioning.json` | Complete site provisioning |

### API Functions (electrical_trader_pack)

```python
# Create company + defaults
frappe.get_doc({
    "doctype": "Company",
    "company_name": "Sharma Electronics"
}).insert()

# Execute via bench
bench --site {slug}.localhost execute electrical_trader_pack.api.setup_company \
    --kwargs '{"company_name": "Sharma Electronics", "plan": "starter"}'
```

## Phase 6: Aadhaar Verification (KYC)

### Trust Factor
KYC verification builds trust and enables:
- Fraud prevention
- KYC compliance for future payment features
- BNPL (Buy Now Pay Later) eligibility

### Mock Verification Flow

```
┌─────────────────────────────────────────────────────┐
│              AADHAAR VERIFICATION                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  1. User enters 12-digit Aadhaar                   │
│  2. API generates reference_id                       │
│  3. OTP sent to registered mobile                   │
│  4. User enters 6-digit OTP                        │
│  5. On success: Name + Address returned           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Test Credentials

| OTP | Result |
|-----|--------|
| `123456` | Success - Returns mock user data |
| `000000` | Failure - Shows error |
| Any other | Invalid OTP error |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/verify-aadhaar` | POST | Initiate verification, send OTP |
| `/api/verify-aadhaar-otp` | POST | Verify OTP, get user details |

### Files

- `src/lib/aadhaar.ts` - Client-side helpers
- `src/components/AadhaarVerification.tsx` - UI component
- `n8n_workflows/workflows/aadhaar-verification.json` - n8n workflow

### Real Provider Integration

When ready, integrate with:
- **SurePass** - https://www.surepass.io
- **Cashfree** - https://www.cashfree.com
- **DigiO** - https://www.digio.in

## Phase 7: WhatsApp Integration

### Why WhatsApp?
Indian retailers check WhatsApp more than email. Sending credentials via WhatsApp:
- Faster delivery (instant)
- Higher open rate (90%+)
- Better user experience
- Competitive advantage over Tally/Zoho

### WhatsApp Templates

| Template | Purpose | Params |
|----------|---------|--------|
| `welcome` | New shop activation | ownerName, shopName, siteUrl, email |
| `credentials` | Login details | siteUrl, email, password |
| `dailySummary` | Sales report | shopName, totalSales, invoiceCount, topItem |
| `lowStock` | Stock alert | shopName, itemName, currentStock, reorderLevel |
| `planExpiry` | Renewal reminder | shopName, planName, expiryDate |

### Sample Messages

**Welcome Message:**
```
Namaste Rajesh! 🎉

Aapki shop "Sharma Electronics" 
Billed par live hai!

🌐 URL: https://sharma-electronics.billed.in
📧 Email: rajesh@email.com

Start billing now!
```

**Low Stock Alert:**
```
⚠️ Low Stock Alert - Sharma Electronics

📦 Item: Bajaj 48" Fan
📊 Current Stock: 3
🔔 Reorder Level: 10

Reorder now to avoid stockouts!
```

### API Usage

```typescript
import { useWhatsApp } from '@/lib/useWhatsApp'

const { sendWelcome } = useWhatsApp()
await sendWelcome('9876543210', 'Rajesh', 'Sharma Electronics', 'https://...', 'rajesh@email.com')
```

### Gupshup Setup

1. Create account at https://www.gupshup.io
2. Create WhatsApp Business account
3. Get API key from Settings
4. Add templates for approval (takes 24-48 hours)
5. Add to `.env.local`:
   ```
   WHATSAPP_PROVIDER=gupshup
   GUPSHUP_API_KEY=your_api_key
   ```

### Files

- `src/lib/whatsapp.ts` - WhatsApp client library
- `src/lib/useWhatsApp.ts` - React hook
- `src/app/api/whatsapp/send/route.ts` - Send API
- `n8n_workflows/whatsapp-notifications.json` - n8n workflow

## n8n Workflows

| Workflow | Purpose |
|----------|---------|
| `setup-shop.json` | Basic onboarding (no payment) |
| `razorpay-webhook.json` | Payment verification |
| `frappe-site-provisioning.json` | Complete site provisioning |
| `aadhaar-verification.json` | KYC verification |
| `whatsapp-notifications.json` | WhatsApp alerts |

## TODO

- [x] Add Razorpay integration for paid plans
- [x] Create Frappe site provisioning function
- [x] Create n8n provisioning workflow
- [x] Aadhaar verification (mock)
- [x] WhatsApp notification (mock)
- [x] Frontend polish (Quiet Ledger design)
- [ ] Real Aadhaar API integration (SurePass/Cashfree)
- [ ] Set up wildcard SSL + subdomain routing (Traefik)
- [ ] WhatsApp templates approval (Gupshup)
- [ ] Add monitoring (Grafana/Prometheus)

## Frontend Design - "Quiet Ledger" Style

Premium dark mode design with:

- **Zinc-based palette** - Subtle backgrounds, refined borders
- **Typography** - Clean sans-serif, proper tracking
- **Card system** - Subtle shadows, hover states
- **Table design** - Clean, uncluttered layouts
- **Sidebar navigation** - Fixed position, icon + text

### Preview

Dashboard available at: `http://localhost:3000/dashboard`

Features:
- Stats cards with trend indicators
- Recent invoices table
- Top selling items
- Quick action cards
- User profile in sidebar
