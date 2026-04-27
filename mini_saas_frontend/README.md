# BillZo - Multi-Tenant GST Billing SaaS

## Project Overview

**BillZo** is a multi-tenant GST billing software for Indian merchants, positioned as a "Zoho & Tally Killer" with:
- Mobile-first PWA design
- Offline-first capability
- WhatsApp-integrated invoicing
- ERPNext backend sync
- 10-second billing workflow

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND                         │
│  Next.js 14 (App Router) + React 18 + Tailwind    │
│  TanStack Query + Framer Motion + PWA             │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                      API LAYER                       │
│  REST Routes under /api/*                           │
│  Auth, Idempotency, Rate Limiting, Circuit Breaker │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   DATA LAYER                         │
│  PostgreSQL (Neon) + Redis (Upstash)              │
│  Multi-tenant isolation with tenant_id             │
└─────────────────────────────────────────────────────────┘
```

---

## Public Routes

### `/` - Landing Page
- Marketing landing page
- Feature highlights
- Pricing plans (Free/Starter/Pro)
- Call-to-action to start onboarding

### `/start` - Onboarding Flow
- Multi-step wizard:
  1. Shop Details (name, category)
  2. Identity (phone, email, owner name)
  3. Plan Selection (Free/Starter/Pro)
  4. Payment (Razorpay for paid plans)
- Zod validation on all inputs
- Idempotency key generation
- Creates tenant + user + session

### `/demo` - Demo Mode
- Read-only demo without authentication
- Shows sample dashboard

---

## Merchant Routes (Authenticated)

### `/merchant` - Dashboard Home
- Today's stats: revenue, invoice count, pending payments
- Recent invoices list
- Quick actions (New Invoice, Scan, Add Customer)
- Sync status indicator

### `/merchant/pos` - Point of Sale ⭐
**Primary billing workflow - 10-second invoicing**

Features:
- Product grid with search
- Tap to add cart
- Stock reservation (10-min hold)
- Customer selection
- Payment modes (Cash/UPI/Card)
- Auto GST calculation
- Offline-first with IndexedDB queue
- Idempotency for duplicate prevention
- WhatsApp share on success

Frontend Hooks:
- `useOfflinePOS` - Manages offline queue, sync, retry

### `/merchant/invoice` - Sales Invoices
- List all sales invoices
- Filter by date, status, customer
- View invoice details
- Send via WhatsApp
- Sync status to ERPNext

### `/merchant/invoice/new` - Create Invoice
- Manual invoice creation form
- Customer selection
- Line items with GST
- Payment recording

### `/merchant/customers` - Customer Management
- List customers with search
- Add new customer
- View customer details
- Transaction history per customer

### `/merchant/products` - Inventory
- Product list with stock levels
- Low stock alerts
- Add/edit products
- HSN code, GST rate per product
- Category management

### `/merchant/purchases` - Purchase Bills
- List purchase invoices
- Create purchase bill
- Scan purchase invoice (OCR)
- Update stock on receive

### `/merchant/parties` - All Parties
- Combined view: Customers + Suppliers
- Filter by type
- Quick add party

### `/merchant/reports` - GST & Analytics
- Sales reports (daily/monthly)
- GST summary for filing
- Stock reports
- Export to PDF

### `/merchant/settings` - Configuration
- Shop profile
- GST settings (business type, state)
- WhatsApp integration
- ERPNext connection
- User management

---

## API Routes

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/session` | GET | Get current session |
| `/api/auth/login` | POST | Phone + OTP login |
| `/api/auth/logout` | POST | Clear session |

### Onboarding

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/onboard` | POST | Create new tenant + user |

### Invoices

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/merchant/invoices` | GET | List invoices |
| `/api/merchant/invoices` | POST | Create invoice |
| `/api/merchant/invoices/create` | POST | Create with idempotency |
| `/api/merchant/invoice/sync` | POST | Trigger ERP sync |
| `/api/merchant/invoice/sync-status` | GET | Check sync status |
| `/api/merchant/invoice/retry` | POST | Retry failed sync |

### Products

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/merchant/products` | GET | List products |
| `/api/merchant/products` | POST | Create product |
| `/api/merchant/products` | PUT | Reserve/release/confirm stock |

### Customers

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/merchant/customer/search` | GET | Search customers |

### Dashboard

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard/today-summary` | GET | Today's stats |
| `/api/merchant/stats` | GET | Dashboard metrics |

### Payments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/createorder` | POST | Create Razorpay order |
| `/api/webhooks/razorpay` | POST | Payment webhook |

### WhatsApp

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/whatsapp/send` | POST | Send message template |
| `/api/whatsapp/events` | POST | Delivery status webhook |

### Integrations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/magic-scan` | POST | OCR for purchase bills |
| `/api/verify-aadhaar` | POST | Aadhaar verification |
| `/api/webhooks/n8n` | POST | n8n automation |

### Health & Cron

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/health/circuit` | GET | Circuit breaker status |
| `/api/cron/erp-sync` | POST | Daily ERP sync job |

---

## Database Schema

### Core Tables

```sql
-- Tenants (multi-tenant)
tenants: id, company_name, phone, email, plan, is_active

-- Users per tenant
users: id, tenant_id, name, role, email, phone

-- Products/Inventory  
products: id, tenant_id, item_code, item_name, hsn_code, 
          gst_rate, rate, mrp, stock_quantity, category, unit

-- Customers
customers: id, tenant_id, customer_name, phone, email, gstin, address

-- Invoices
invoices: id, tenant_id, invoice_number, customer_name, 
          subtotal, cgst, sgst, igst, total, payment_mode,
          erp_sync_status, erp_invoice_id

-- Invoice Items
invoice_items: id, invoice_id, product_id, qty, rate, amount

-- Payments
payments: id, tenant_id, invoice_id, amount, payment_mode, 
            razorpay_payment_id
```

### Feature Tables

```sql
-- Stock reservations (cart concurrency)
stock_reservations: id, tenant_id, product_id, session_id, 
                    quantity, expires_at

-- WhatsApp delivery tracking
whatsapp_messages: id, tenant_id, invoice_id, phone, status,
                  attempts, sent_at, delivered_at
```

---

## Key Features

### 1. Offline-First POS
- IndexedDB stores pending invoices
- Auto-sync when online
- Exponential backoff retry (1s→2s→4s→8s)
- Visual status indicator

### 2. Idempotency
- Every invoice needs `x-idempotency-key` header
- Prevents duplicate charges on retry
- Redis-backed (Upstash)

### 3. Stock Locking
- 10-minute reservation when adding to cart
- Available stock = total - reserved
- Auto-release on timeout
- Prevents overselling

### 4. WhatsApp Integration
- Auto-send invoice after creation
- Template-based messages
- Delivery tracking (Sent/Delivered/Read)
- Retry failed messages

### 5. ERPNext Sync
- Background sync via cron job
- Status: PENDING → SYNCED / FAILED
- Manual retry available
- Mock mode for testing

### 6. Multi-Tenant Security
- tenant_id on every query
- Row-level isolation
- Session-based auth
- Rate limiting per tenant

---

## Environment Variables

```env
# Database
DATABASE_URL=postgres://...

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# ERPNext
ERP_URL=http://localhost
ERP_API_KEY=administrator
ERP_API_SECRET=admin
ERP_MODE=mock

# Razorpay
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...

# Session
SESSION_SECRET=...

# Encryption
CREDENTIAL_ENCRYPTION_KEY=...
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| UI | React 18, Tailwind CSS |
| Animation | Framer Motion |
| State | TanStack Query |
| Database | PostgreSQL (Neon) |
| Cache | Redis (Upstash) |
| Auth | Session-based + cookies |
| Payments | Razorpay |
| WhatsApp | Gupshup/Twilio |
| Hosting | Vercel |

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env.local
# Fill in your credentials

# Run locally
pnpm dev

# Build for production
pnpm build
```

---

## Deployment

The app deploys automatically on Vercel:
1. Connect GitHub repo
2. Add environment variables
3. Deploy triggers on push to master

Cron job runs daily at midnight UTC for ERP sync.

---

## Roadmap

- [ ] Products page fully connected to API
- [ ] Purchase flow with OCR
- [ ] GST reports generation
- [ ] Push notifications for PWA
- [ ] Staff roles (cashier, manager)
- [ ] Multi-store support
- [ ] Loyalty program
