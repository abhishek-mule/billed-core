# 🚀 Invoice Creation & Recovery Queue - Quick Start Guide

**What Changed:** Dashboard now updates immediately when invoices are created  
**When:** June 11, 2026  
**Deployment:** Ready for production (no database changes needed)

---

## 📝 WHAT THE USER EXPERIENCES

### Before
```
User → Creates invoice with credit terms
     → Invoice appears in POS success screen
     → Clicks "New Sale"
     → Goes to Dashboard
     → ❌ Recovery queue is EMPTY
     → Waits 30-60 seconds...
     → Eventually recovery case appears
```

### After
```
User → Creates invoice with credit terms
     → Success screen shows "✓ Added to recovery queue"
     → Clicks "View Queue" button
     → Dashboard loads
     → ✅ Recovery case ALREADY VISIBLE
     → Can take immediate recovery actions
```

---

## 🛠️ WHAT CHANGED IN CODE

### 1. New Recovery Case API
**File:** `src/app/api/recovery/case/route.ts` (NEW FILE)

**What it does:**
- Accepts invoice details after creation
- Immediately creates/updates recovery case in database
- Eliminates waiting for async worker (30-60 second delay)

**Called from:** POS page after successful invoice creation

---

### 2. Updated POS Page  
**File:** `src/app/(app)/pos/page.tsx`

**Changes:**
```diff
+ // After invoice created, call recovery case API
+ const res = await fetch('/api/recovery/case', {...})

+ // Emit custom event so dashboard knows to refresh  
+ window.dispatchEvent(new CustomEvent('billzo:invoice-created', {...}))

+ // Show user that case was added
+ {success.method === 'udhar' && (
+   <div>✓ Added to recovery queue</div>
+ )}

+ // Add "View Queue" button
+ <Button onClick={() => router.push('/dashboard')}>
+   View Queue →
+ </Button>
```

---

### 3. Updated Dashboard
**File:** `src/app/(app)/dashboard/page.tsx`

**Changes:**
```diff
+ // Poll queue with exponential backoff
+ const pollQueueWithBackoff = useCallback(async (maxAttempts, delayMs) => {
+   // Try 4 times: 300ms, 600ms, 1200ms, 2400ms
+   // Usually succeeds on first or second attempt
+ }, [])

+ // Listen to invoice creation event
+ window.addEventListener("billzo:invoice-created", onInvoiceCreated)

+ // When event fires, poll the queue
+ const onInvoiceCreated = (event) => {
+   pollQueueWithBackoff(4, 300)
+ }
```

---

## ✅ HOW TO TEST

### Test 1: Manual Invoice Creation
1. Go to POS page
2. Add a product to cart
3. Click "Collect Payment"
4. Select "Credit (Udhar)" payment method  
5. Click "Pay"
6. ✅ Should see "✓ Added to recovery queue" message
7. Click "View Queue" button
8. ✅ New invoice should appear in recovery queue immediately

### Test 2: Verify API
```bash
curl -X POST http://localhost:3000/api/recovery/case \
  -H "Content-Type: application/json" \
  -b "bz_tenant=abc123" \
  -d '{
    "invoiceId": "inv_test",
    "customerId": "cust_123",
    "amount": 5000,
    "customerName": "Test",
    "customerPhone": "+919876543210"
  }'

# Expected: { "success": true }
```

### Test 3: Check Network Requests
1. Open DevTools → Network tab
2. Create invoice in POS
3. ✅ Should see requests to:
   - `POST /api/recovery/case` (creates case immediately)
   - `GET /api/recovery/queue` (polled 1-4 times to fetch updated queue)

### Test 4: Non-Udhar Invoices
1. Create invoice with UPI/Cash payment
2. ✅ Should NOT see recovery queue message (only applies to credit)
3. ✅ Should only see "New Sale" button (not "View Queue")

---

## 🔍 HOW IT WORKS

```
BEFORE (30-60 second delay):
┌─────────────────────────────────────────────┐
│ 1. Create invoice → IndexedDB              │
│ 2. Save to outbox (async)                  │
│ 3. Trigger billzo:changed event            │
│ 4. Dashboard loads recovery queue from API │
│ 5. API queries recovery_cases table        │
│ 6. No case yet (worker hasn't processed)   │
│ 7. [Wait 30-60 seconds for worker]         │
│ 8. Worker processes event                  │
│ 9. Recovery case created                   │
│ 10. Dashboard eventually updates           │
└─────────────────────────────────────────────┘

AFTER (1-2 seconds):
┌─────────────────────────────────────────────┐
│ 1. Create invoice → IndexedDB              │
│ 2. Call /api/recovery/case API             │
│ 3. Recovery case created IMMEDIATELY       │
│ 4. Emit billzo:invoice-created event       │
│ 5. Dashboard hears event                   │
│ 6. Poll /api/recovery/queue (4 attempts)   │
│ 7. 1st attempt: Case visible! Success ✅   │
│ 8. Dashboard updates in real-time          │
└─────────────────────────────────────────────┘
```

---

## 📊 MONITORING

### What to watch in production:

**Metrics:**
- `api.recovery.case.requests` → Should spike when users create invoices
- `api.recovery.case.success_rate` → Should be 99%+
- `dashboard.queue.update_latency` → Should be < 2 seconds

**Error logs:**
- Look for failures in `/api/recovery/case`
- Check if polling is working (`billzo:invoice-created` events)
- Monitor for duplicate cases

**User feedback:**
- Should report seeing invoices immediately in queue
- No more complaints about missing invoices

---

## 🐛 TROUBLESHOOTING

**Problem:** Recovery cases still not appearing immediately

**Check:**
1. Is the recovery case API being called?
   - Check Network tab: POST to `/api/recovery/case`
   - If missing, ensure invoice method is 'udhar'

2. Is the dashboard event listener working?
   - Open Console: `window.addEventListener` should be set
   - Create invoice, check if `billzo:invoice-created` event fires
   
3. Is polling working?
   - Check Network tab: Should see 1-4 requests to `/api/recovery/queue`
   - Should succeed on first or second attempt

**Solution:**
- Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
- Check browser console for JavaScript errors
- Verify tenant ID is set in cookies: `console.log(document.cookie)`

---

## 🚨 ROLLBACK (If needed)

If issues occur:

1. **Disable API call in POS:**
   ```typescript
   // Comment out in handlePay():
   // const res = await fetch('/api/recovery/case', {...})
   ```

2. **Remove event listener in Dashboard:**
   ```typescript
   // Comment out in useEffect:
   // window.addEventListener("billzo:invoice-created", onInvoiceCreated)
   ```

3. **Revert code:**
   ```bash
   git revert <commit-hash>
   ```

**Note:** Cases will still be created by async worker (just slower)

---

## 📈 SUCCESS METRICS

**Before Deployment:**
- Recovery queue update time: 30-60 seconds
- User satisfaction: Medium (frustration about missing invoices)
- Support tickets: "Where's my invoice in the queue?"

**After Deployment (Expected):**
- Recovery queue update time: < 2 seconds
- User satisfaction: High (immediate feedback)
- Support tickets: Significantly reduced

---

## 🎯 KEY TAKEAWAY

**The Problem:** There was a 30-60 second delay between creating an invoice and seeing it in the recovery queue.

**The Solution:** We now create the recovery case immediately via API, then poll the queue to ensure the dashboard sees it within 1-2 seconds.

**The Impact:** Users get instant feedback that their invoice was recorded and added to the recovery queue.

---

## 📚 FULL DOCUMENTATION

For more details, see:
- `INVOICE_RECOVERY_QUEUE_IMPROVEMENTS.md` - Complete technical analysis
- `IMPLEMENTATION_CHECKLIST.md` - All remaining tasks
- `CODE_PATTERNS_GUIDE.md` - API validation patterns used

---

**Status: ✅ READY TO DEPLOY**

No database migrations needed. Can deploy immediately.

