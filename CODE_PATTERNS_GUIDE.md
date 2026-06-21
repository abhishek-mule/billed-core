# 🎓 BillZo Bug Fixes - Code Examples & Patterns

**Purpose:** Quick reference for implementing consistent error handling and validation  
**Audience:** Full Stack Engineering Team  
**Date:** June 11, 2026

---

## 📚 TABLE OF CONTENTS

1. [Frontend Error Handling Patterns](#frontend-error-handling-patterns)
2. [API Validation Patterns](#api-validation-patterns)
3. [Component Error Boundaries](#component-error-boundaries)
4. [Common Error Messages](#common-error-messages)
5. [Testing Error States](#testing-error-states)

---

## 🎨 Frontend Error Handling Patterns

### Pattern 1: Simple Data Loading (Dashboard Style)

Use this for pages that load a list of items:

```typescript
"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/billzo/Button";

export default function ExamplePage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null);
      setLoading(true);

      const res = await fetch("/api/items", {
        credentials: "include",
      });

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const result = await res.json();
      setData(result.items || []);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "An error occurred";
      console.error("Failed to load data:", error);
      setError(errorMsg);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-7xl mx-auto">
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-700">{error}</p>
            <p className="text-sm text-red-600 mt-1">Please try again later.</p>
          </div>
          <Button onClick={loadData} size="sm" variant="outline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8">
      {/* Your content here */}
    </div>
  );
}
```

**When to use:** List pages (invoices, customers, products)

---

### Pattern 2: Form Submission (POS/Add Customer Style)

Use this for forms that submit data:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/billzo/Button";
import { Toast } from "@/components/billzo/Toast";

export default function AddItemForm() {
  const [formData, setFormData] = useState({ name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setError(null);
      setSuccess(false);
      setSubmitting(true);

      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const result = await res.json();
      setSuccess(true);
      setFormData({ name: "", email: "" });
      
      // Auto-hide success after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "An error occurred";
      console.error("Submission failed:", error);
      setError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Error toast */}
      {error && (
        <Toast
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Success toast */}
      {success && (
        <Toast
          type="success"
          message="Item created successfully!"
          onClose={() => setSuccess(false)}
        />
      )}

      {/* Form fields */}
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Item name"
        className="w-full px-3 py-2 border rounded"
      />

      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="Email"
        className="w-full px-3 py-2 border rounded"
      />

      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating..." : "Create Item"}
      </Button>
    </form>
  );
}
```

**When to use:** Forms, action buttons that trigger POST/PATCH/DELETE

---

### Pattern 3: Multiple Async Operations (Invoice Detail Style)

Use this when you have multiple independent async operations:

```typescript
"use client";

import { useState, useEffect } from "react";

export default function InvoiceDetail({ id }: { id: string }) {
  const [invoice, setInvoice] = useState<any>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    loadInvoice();
    loadTimeline();
  }, [id]);

  const loadInvoice = async () => {
    try {
      setInvoiceError(null);
      // Load from IndexedDB or API
      const data = await fetchInvoice(id);
      setInvoice(data);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to load invoice";
      setInvoiceError(errorMsg);
    }
  };

  const loadTimeline = async () => {
    try {
      setTimelineLoading(true);
      setTimelineError(null);
      
      const res = await fetch(`/api/recovery/timeline?invoiceId=${id}`, {
        credentials: "include",
      });

      if (!res.ok) {
        let errorMsg = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          errorMsg = data.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const data = await res.json();
      setTimeline(data.events || []);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to load timeline";
      setTimelineError(errorMsg);
    } finally {
      setTimelineLoading(false);
    }
  };

  return (
    <div>
      {/* Invoice section */}
      {invoiceError ? (
        <div className="p-4 bg-red-50 border border-red-300 rounded">
          Invoice not found: {invoiceError}
        </div>
      ) : (
        <div>{/* Show invoice */}</div>
      )}

      {/* Timeline section */}
      {timelineLoading ? (
        <div>Loading timeline...</div>
      ) : timelineError ? (
        <div className="p-4 bg-red-50 border border-red-300 rounded">
          {timelineError}
          <button onClick={loadTimeline}>Retry</button>
        </div>
      ) : (
        <div>{/* Show timeline */}</div>
      )}
    </div>
  );
}
```

**When to use:** Detail pages with multiple data sources (invoice, timeline, customer, payments)

---

## 🔒 API Validation Patterns

### Pattern 1: Basic GET Route with Pagination

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, errorResponse } from "@/lib/billzo/api-middleware";
import { supabaseAdmin } from "@/lib/billzo/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Verify tenant & user
    const auth = await verifyRequest(request);
    if (auth.response) return auth.response;

    const tenantId = auth.tenantId!;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    // Validate pagination
    if (offset < 0) {
      return errorResponse("Invalid offset", 400);
    }

    // Fetch data
    const { data, count, error } = await supabaseAdmin
      .from("items")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[ItemAPI] Query error:", error);
      return errorResponse("Failed to fetch items", 500);
    }

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error("[ItemAPI] GET error:", err);
    return errorResponse("Internal server error", 500);
  }
}
```

**Use this for:** GET requests with optional pagination

---

### Pattern 2: POST with Full Validation

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  verifyRequest,
  validateJsonBody,
  validateRequired,
  validateEmail,
  validatePhone,
  errorResponse,
  logApiAccess,
} from "@/lib/billzo/api-middleware";
import { supabaseAdmin } from "@/lib/billzo/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Verify auth
    const auth = await verifyRequest(request);
    if (auth.response) return auth.response;

    const tenantId = auth.tenantId!;
    const userId = auth.userId!;

    // Log for audit
    logApiAccess(request, tenantId, userId, "create_item");

    // Validate JSON
    const bodyResult = await validateJsonBody(request);
    if (bodyResult.response) return bodyResult.response;

    const body = bodyResult.data!;
    const { name, email, phone } = body;

    // Validate required fields
    const required = validateRequired(body, ["name", "email"]);
    if (!required.valid) {
      return errorResponse(
        `Missing fields: ${Object.keys(required.errors!).join(", ")}`,
        400
      );
    }

    // Validate types
    if (typeof name !== "string" || !name.trim()) {
      return errorResponse("Name must be a non-empty string", 400);
    }

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return errorResponse(emailValidation.error!, 400);
    }

    // Validate phone if provided
    if (phone) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.valid) {
        return errorResponse(phoneValidation.error!, 400);
      }
    }

    // Insert data
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("items")
      .insert({
        id: `item_${Date.now()}`,
        tenant_id: tenantId,
        name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse("Item with this email already exists", 409);
      }
      console.error("[ItemAPI] Insert error:", error);
      return errorResponse("Failed to create item", 500);
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err: any) {
    console.error("[ItemAPI] POST error:", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
}
```

**Use this for:** POST endpoints with validation

---

### Pattern 3: PATCH with Selective Updates

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyRequest, validateJsonBody, errorResponse } from "@/lib/billzo/api-middleware";
import { supabaseAdmin } from "@/lib/billzo/supabase-admin";

export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyRequest(request);
    if (auth.response) return auth.response;

    const tenantId = auth.tenantId!;

    const bodyResult = await validateJsonBody(request);
    if (bodyResult.response) return bodyResult.response;

    const body = bodyResult.data!;
    const { id, ...updates } = body;

    if (!id) {
      return errorResponse("Item ID required", 400);
    }

    // Build safe update object (only allow certain fields)
    const allowedFields = ["name", "email", "phone"];
    const safeUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const field of allowedFields) {
      if (field in updates) {
        safeUpdates[field] = updates[field];
      }
    }

    const { data, error } = await supabaseAdmin
      .from("items")
      .update(safeUpdates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      console.error("[ItemAPI] Update error:", error);
      return errorResponse("Failed to update item", 500);
    }

    if (!data) {
      return errorResponse("Item not found", 404);
    }

    return NextResponse.json({ item: data });
  } catch (err: any) {
    console.error("[ItemAPI] PATCH error:", err);
    return errorResponse("Internal server error", 500);
  }
}
```

**Use this for:** PATCH endpoints

---

## 🚨 Component Error Boundaries

### Error Boundary Component

Already created at: `/src/components/billzo/ErrorBoundary.tsx`

**Usage:**

```typescript
import { ErrorBoundary } from '@/components/billzo/ErrorBoundary'

export default function Layout() {
  return (
    <ErrorBoundary>
      {/* Your app content */}
    </ErrorBoundary>
  )
}
```

---

## 📝 Common Error Messages

Use these exact messages for consistency:

| Scenario | Message | HTTP |
|----------|---------|------|
| Missing auth | `Unauthorized: Missing tenant ID` | 401 |
| Missing required field | `Missing fields: field1, field2` | 400 |
| Invalid format (email) | `Invalid email format` | 400 |
| Invalid format (phone) | `Invalid phone number format` | 400 |
| Duplicate record | `Item with this email already exists` | 409 |
| Not found | `Item not found` | 404 |
| Bad JSON | `Invalid JSON request body` | 400 |
| Server error | `Failed to fetch items` | 500 |
| Validation error | `{field} must be a non-empty string` | 400 |

---

## 🧪 Testing Error States

### Test in Browser Dev Tools

```javascript
// Test network error
1. Open DevTools → Network tab
2. Right-click on page → Throttle Offline
3. Try to load data → Should show error
4. Restore network → Click Retry → Should work

// Test API error
1. Open DevTools → Network tab
2. Right-click → Throttle to "Slow 3G"
3. Load page with API call
4. In Network tab, click request → Response
5. Should show actual error message from API

// Test component error
1. Add: throw new Error('test')
2. To any component render
3. Should show ErrorBoundary UI
4. Should NOT crash entire app
```

### Unit Test Example

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExamplePage from "./page";

describe("ExamplePage Error Handling", () => {
  it("shows error banner on API failure", async () => {
    // Mock fetch to fail
    global.fetch = jest.fn(() =>
      Promise.reject(new Error("Network error"))
    );

    render(<ExamplePage />);

    // Wait for error to show
    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    });
  });

  it("retries on button click", async () => {
    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("Error"));
      return Promise.resolve({ ok: true, json: () => ({ items: [] }) });
    });

    render(<ExamplePage />);

    // Wait for error
    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    });

    // Click retry
    fireEvent.click(screen.getByText("Retry"));

    // Should load successfully
    await waitFor(() => {
      expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
    });
  });
});
```

---

## 🎓 KEY PRINCIPLES

1. **Always wrap API calls in try/catch**
   - Never let errors bubble up unhandled

2. **Parse error messages from responses**
   - Try to extract `response.json().error` first
   - Fall back to HTTP status code
   - Have a generic fallback message

3. **Show errors to users**
   - Never silently fail
   - Error banner for page-level failures
   - Toast for action-level failures
   - Form field errors for validation

4. **Always provide recovery**
   - Retry button for API failures
   - Ability to go back
   - Clear success/error messages

5. **Log for debugging**
   - `console.error()` with context
   - Include error object for stack trace
   - Log to Sentry in production

6. **Validate on both sides**
   - Frontend for UX (instant feedback)
   - Backend for security (never trust client)
   - Return same error format from API

---

## 📞 QUICK START

**To add error handling to a new page:**

1. Copy Pattern 1 from above
2. Replace `/api/items` with your endpoint
3. Replace `setData` with your state setter
4. Add your content in the success section
5. Test with network disabled

**To add validation to a new API route:**

1. Copy Pattern 2 (for POST) or Pattern 1 (for GET)
2. Update field names to match your schema
3. Add custom validators if needed (phone, GSTIN, etc.)
4. Test with curl:

```bash
# Test valid request
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -b "bz_tenant=abc" \
  -d '{"name":"test","email":"test@example.com"}'

# Test invalid request
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -b "bz_tenant=abc" \
  -d '{"name":""}'  # Should return 400
```

---

**Questions?** Check FRONTEND_BUG_FIXES_SUMMARY.md or IMPLEMENTATION_CHECKLIST.md

