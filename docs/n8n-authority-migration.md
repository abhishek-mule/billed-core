# n8n → Authority Gateway Migration

n8n workflows must submit authority intents instead of calling app endpoints directly.

## Gateway Endpoint

```
POST http://localhost:3001/api/v1/authority/evaluate
```

Production URL configured via `AUTHORITY_GATEWAY_URL` env var.

## Authentication

HMAC-SHA256 signing with per-source secrets. Set `AUTHORITY_HMAC_SECRET_N8N_PROD` env var on the gateway.

### Signing Algorithm (implemented in n8n as a Function node or sub-workflow)

```
payload = canonicalJson({...body, timestamp, nonce})
signature = HMAC-SHA256(secret, 'POST/api/v1/authority/evaluate' + timestamp + nonce + payload)
```

`canonicalJson` = deterministic JSON with sorted keys, no whitespace, NaN/Infinity rejected.

The `nonce` is a UUID v4. The `timestamp` is ISO-8601. Both are part of the body (not just the signature input). The gateway verifies the signature matches.

**Retries MUST reuse the same nonce + timestamp** to preserve idempotency.

## Intent Format

```jsonc
{
  "intentId": "uuid-v4",
  "intentType": "tenant.provision",
  "intentVersion": 1,
  "tenantId": "tenant_abc123",
  "actor": "n8n",
  "source": "n8n_prod",
  "timestamp": "2026-05-28T12:00:00.000Z",
  "causationId": null,
  "correlationId": null,
  "payload": {
    // intent-type-specific fields
  },
  "nonce": "uuid-v4",
  "signature": "hex-string"
}
```

## Intent Types for n8n Workflows

| Intent Type | Payload Fields | Source |
|---|---|---|
| `tenant.provision` | `{ plan: string, ... }` | `n8n_prod` |
| `tenant.deprovision` | `{ tenantId }` | `n8n_prod` |
| `invoice.gst.submit` | `{ invoiceId, gstData }` | `n8n_prod` |
| `invoice.gst.calculate` | `{ invoiceId }` | `n8n_prod` |
| `whatsapp.send.template` | `{ phone, template, params }` | `n8n_prod` |
| `kyc.aadhaar.verify` | `{ aadhaarRef, ... }` | `n8n_prod` |

## Response

```jsonc
{
  "accepted": true,
  "intentId": "...",
  "decisionId": "plan-hash",
  "decision": {
    "outcome": "accepted",
    "decisionGraph": [ /* node results */ ],
    "policySnapshotHash": "...",
    "policyVersion": "2026.05.28-alpha",
    "evaluatedAt": "..."
  }
}
```

On rejection (HTTP 403 or body `accepted: false`), the `decisionGraph` contains the failing node.

## Migration Steps per Workflow

1. **Replace HTTP Request nodes** that call app endpoints (e.g. `POST /api/payment/webhook`) with a **Function node** that builds the HMAC-signed intent
2. **POST** the signed intent to `{{ $env.AUTHORITY_GATEWAY_URL }}/api/v1/authority/evaluate`
3. **Check** `response.body.accepted` — if false, surface `response.body.error` for debugging
4. **Remove** any direct supabase calls from n8n workflows
5. **Ensure retries** use the same `nonce` value (store in workflow static data)

## Controlled Intents (not available to n8n)

These intents are reserved for internal worker flows only:
- `invoice.mark_paid` — via `InternalAuthorityClient` only
- `reminder.*` — worker queues only
- `payment.reconcile` — worker reconciliation only
- `reconciliation.*` — worker only
- `recovery.*` — worker only
- `tenant.update_*` — app and admin only
- `ledger.write` — frappe only
