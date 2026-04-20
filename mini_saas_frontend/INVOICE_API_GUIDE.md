# Invoice API Guide

## Overview
This document details the API endpoints for the Invoice service used in the Mini SaaS application.

## Base URL
```
https://api.mini-saas.com
```

## Authentication
All endpoints require authentication. Use the API key in the request header:
```
Authorization: Bearer YOUR_API_KEY
```

## Endpoints

### 1. Create Invoice
- **Endpoint:** `/api/merchant/invoices`
- **Method:** POST
- **Request Body:**
```json
{
  "customerPhone": "9876543210",
  "customerName": "Rajesh Kumar",
  "items": [
    { "itemCode": "FAN-BAJAJ-48", "itemName": "Bajaj 48 Fan", "quantity": 2, "rate": 3500 }
  ],
  "notes": "Payment due in 15 days"
}
```
- **Response:** 201 Created
```json
{
  "success": true,
  "invoiceId": "SIN-2026-00001",
  "invoiceNumber": "INV-20260420-000001",
  "whatsappLink": "https://wa.me/919876543210?text=...",
  "message": "Invoice INV-20260420-000001 created for ₹7070.00"
}
```

### 2. Health Check
- **Endpoint:** `/api/merchant`
- **Method:** GET
- **Response:**
```json
{
  "status": "ok",
  "message": "Merchant API is running",
  "version": "1.0.0"
}
```

## Error Handling
- **401 Unauthorized:** Invalid or missing API key.
- **400 Bad Request:** Invalid input data.

## Example
### Create Invoice Example
```bash
curl -X POST https://api.mini-saas.com/api/merchant/invoices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJ..." \
  -d '{"customerPhone":"9876543210","items":[{"itemCode":"FAN-001","quantity":1,"rate":2500}]}'
```

## GST Rate Reference
| Category | GST Rate |
|----------|----------|
| Electronics | 18% |
| Electrical Equipment | 18% |
| Mobile & Accessories | 18% |
| Grocery | 0% |
| Pharmacy | 0% |
| Clothing | 5% |
| Hardware | 18% |
| Auto Parts | 18% |
| Services | 18% |

For further inquiries, please contact support@billed.in