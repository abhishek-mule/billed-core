# 🔧 BillZo Bug Fixes - Implementation Checklist

**Started:** June 11, 2026  
**Progress:** 40% Complete  
**Team:** Full Stack Engineering

---

## ✅ COMPLETED TASKS

### Core Infrastructure
- [x] Create ErrorBoundary component
- [x] Create API middleware with validators
- [x] Create custom async hooks (useAsync, useApiFetch)
- [x] Add error handling pattern standardization
- [x] Create comprehensive bug fix documentation

### Pages with Error Handling
- [x] Dashboard page - Full error handling + action errors
- [x] Invoice detail page - Invoice + timeline error states
- [x] Invoice list page - Error banner with retry
- [x] Parties list page - Error banner with retry
- [x] WhatsApp settings page - Race condition + memory leak fixed

### API Routes with Validation
- [x] /api/customers - Full validation + error handling
- [x] Customers GET - Pagination + search
- [x] Customers POST - Type checks, phone, email, GSTIN validation
- [x] Customers PATCH - Update validation

---

## 🔄 IN PROGRESS / TODO

### Phase 1: Page Error Handling (Remaining)
- [ ] /src/app/(app)/cashflow/page.tsx
  - [ ] Add error state
  - [ ] Wrap data fetch in try/catch
  - [ ] Display error banner with retry

- [ ] /src/app/(app)/pulse/page.tsx
  - [ ] Add error state
  - [ ] Error handling for payment data
  - [ ] Retry capability

- [ ] /src/app/(app)/pos/page.tsx
  - [ ] Error handling for product load
  - [ ] Error handling for customer search
  - [ ] Form error display

- [ ] /src/app/(app)/products/page.tsx
  - [ ] Error handling for product list
  - [ ] Error banner with retry

- [ ] /src/app/(app)/purchases/page.tsx
  - [ ] Error handling for purchase list
  - [ ] Error banner

- [ ] /src/app/(app)/reports/page.tsx
  - [ ] Error handling for report generation
  - [ ] Error display

- [ ] /src/app/(app)/settings/page.tsx
  - [ ] Complete error handling (already partial)

- [ ] /src/app/(app)/parties/[id]/page.tsx
  - [ ] Error handling for party detail
  - [ ] Error handling for party invoice list

- [ ] /src/app/(app)/parties/add/page.tsx
  - [ ] Error handling for form submission
  - [ ] Validation error display

- [ ] /src/app/(app)/onboarding/page.tsx
  - [ ] Error handling for onboarding flows

- [ ] /src/app/auth/page.tsx
  - [ ] Error handling for auth page

- [ ] /src/app/auth/callback/page.tsx
  - [ ] Error handling for callback

### Phase 2: API Validation (Critical Routes)
- [ ] /api/recovery/queue - Verify tenant, validate pagination
- [ ] /api/recovery/queue/actions - Validate action payload
- [ ] /api/recovery/timeline - Validate invoice ID, tenant
- [ ] /api/payment/* - All payment routes (6 routes)
- [ ] /api/whatsapp/pair - Validate request
- [ ] /api/whatsapp/send - Validate message payload
- [ ] /api/invoices/* - Invoice CRUD operations (6 routes)
- [ ] /api/products/* - Product CRUD operations (6 routes)
- [ ] /api/purchases/* - Purchase CRUD operations (6 routes)
- [ ] /api/parties/* - Party CRUD operations (6 routes)

### Phase 3: Type Safety
- [ ] Remove `any` from dashboard components
- [ ] Remove `any` from invoice components
- [ ] Create proper TypeScript interfaces:
  - [ ] QueueItem, QueueSummary
  - [ ] Invoice, InvoiceItem, InvoiceLine
  - [ ] Customer, CustomerWithStats
  - [ ] Payment, PaymentSource
  - [ ] Product, ProductInventory
  - [ ] Party, PartyStats

### Phase 4: UX Improvements
- [ ] Add loading skeletons to all pages
- [ ] Add request timeout handling (30s default)
- [ ] Add retry logic with exponential backoff
- [ ] Add network state detection
- [ ] Add offline indicator

### Phase 5: Security
- [ ] Rotate exposed API keys (CRITICAL)
- [ ] Remove .env from git history
- [ ] Add GitHub Secrets for CI/CD
- [ ] Add rate limiting to APIs
- [ ] Add request validation logging

---

## 📋 QUICK REFERENCE

### Apply Error Handling to Page
```typescript
// 1. Add error state
const [error, setError] = useState<string | null>(null)

// 2. Clear error and wrap load in try/catch
const loadData = async () => {
  try {
    setError(null)
    const data = await fetch(...)
    // ... process
  } catch (error) {
    setError(error instanceof Error ? error.message : 'An error occurred')
  }
}

// 3. Show error banner before content
if (error) {
  return <ErrorBanner error={error} onRetry={loadData} />
}
```

### Apply Validation to API
```typescript
// 1. Import middleware
import { verifyRequest, validateRequired, errorResponse } from '@/lib/billzo/api-middleware'

// 2. Verify tenant
const auth = await verifyRequest(request)
if (auth.response) return auth.response

// 3. Validate body
const { valid, errors } = validateRequired(body, ['field1', 'field2'])
if (!valid) return errorResponse('Missing required fields', 400)

// 4. Return error responses
return errorResponse('Invalid input', 400)
```

---

## 🎯 PRIORITY ORDER

### This Week (High Impact)
1. **Critical payment routes** - Used heavily, high failure risk
2. **Cashflow/pulse pages** - Used by CEO for reporting
3. **Secrets rotation** - Security risk, blocking production

### Next Week (Medium Impact)
1. **Remaining page error handling** - Improves overall UX
2. **API validation rollout** - Prevents backend crashes
3. **Loading skeletons** - Better perceived performance

### Following Week (Nice to Have)
1. **Type safety improvements** - Reduces runtime errors
2. **Timeout handling** - Better handling of slow networks
3. **Offline support** - Better mobile experience

---

## 📞 DEPLOYMENT STEPS

1. **Before Merging**
   - [ ] Run all tests
   - [ ] Check for console errors
   - [ ] Verify error handling works
   - [ ] Test retry functionality

2. **Staging Deployment**
   - [ ] Deploy to staging branch
   - [ ] Run smoke tests
   - [ ] Check Sentry for errors
   - [ ] Monitor for 24 hours

3. **Production Deployment**
   - [ ] Create release PR
   - [ ] Get code review
   - [ ] Merge to main
   - [ ] Monitor error rates (Sentry)
   - [ ] Be ready to rollback

---

## 📊 METRICS TO TRACK

Track these before/after to measure improvement:

- **Error Rates:** % of API calls that fail
- **Silent Failures:** Unhandled errors per day
- **User Recovery:** % of users who retry on error
- **Page Load Time:** Mean time to load data
- **Memory Usage:** Peak memory during pairing
- **API Response Times:** P99 latency

---

## 🚀 SUCCESS CRITERIA

✅ All pages have visible error states  
✅ All API routes validate input  
✅ No console errors on happy path  
✅ Users can recover from failures  
✅ Error tracking (Sentry) shows < 100 errors/day  
✅ No memory leaks in long-running operations  
✅ TypeScript catches more errors at compile time  

---

## 📝 NOTES

- Use existing error handling patterns for consistency
- Import validators from api-middleware.ts
- Always log errors for debugging
- Test error cases during development
- Don't skip validation "just this time" - validation debt compounds
- Update this checklist as work progresses

