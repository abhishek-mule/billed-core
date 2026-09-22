# Webhook Authentication + Production Secret Ownership

Purpose: one operating document for the webhook-inbox launch that (A) records the
VERIFIED webhook authentication mechanism per provider — the answer to "don't assume
Gupshup sends HMAC, verify it" — and (B) assigns owned responsibility for the secrets
the webhook path depends on. No secret values are stored here, in the repo, or in chat.

**Launch scope (operator decision, 2026-09-19):** Gupshup is the **sole production
WhatsApp provider** (outbound + inbound webhook). Meta Cloud API is NOT an active launch
provider. The legacy Meta webhook route (`/api/meta/webhook`) stays alive temporarily as a
compatibility path for existing connections but is not part of the new outbound production
path. Gupshup webhook authentication is verified against the actual provider configuration
below; the Meta App Secret / Meta HMAC do NOT apply to Gupshup.

---

## Part A — VERIFIED webhook authentication, per provider

Verified 2026-09-19 from provider documentation (not assumed, not from a blog).

### Gupshup (launch provider) — IP allowlisting, NOT a signature

Gupshup **does not sign** webhook callbacks. Its documented inbound security mechanism is
**source-IP allowlisting against Gupshup's published webhook-delivery IP list**:

- `partner-docs.gupshup.io/docs/gupshup-ip-allowlisting` (updated 2026-04-20): the official
  whitelist for webhook delivery. Current list — existing:
  `34.202.224.208, 52.66.99.126, 15.206.217.7, 13.126.35.181, 3.6.228.131, 13.232.173.180,
  13.127.57.130, 13.234.143.231, 3.7.115.196, 13.232.49.3`; added 2026-04-15:
  `18.193.1.225, 3.68.131.220, 63.176.209.228, 63.183.31.123` (14 total).
  ⚠️ Caveat: the sibling support article (support.gupshup.io/hc/…/IP-Addresses-for-Webhook-
  Delivery) lists `3.126.35.181` where the partner docs list `13.126.35.181` — cross-check
  against the live source during the empirical capture (below) and prefer the partner-docs
  page.
- `docs.gupshup.io/docs/what-is-a-webhook` / partner `webhook-key-points`: "whitelist
  Gupshup's inbound request IPs … Not only it will keep it private but also eradicate security
  vulnerabilities." The webhook must accept `User-Agent`, accept the `sandbox-start` user
  event, be public HTTPS, return 2xx empty, and process inbound asynchronously.
- The v2 event envelope (`{ app, timestamp, version, type, payload }`) and the v3
  Meta-format passthrough (`object: whatsapp_business_account`) document **no signature
  header**. The partner Subscription API auth (app token) is for US subscribing to
  Gupshup's API — it is outbound auth from us to Gupshup, not inbound webhook signing.

**Conclusion:** there is no Gupshup-produced signature to verify, and no shared-secret HMAC
exists. The route's `GUPSHUP_WEBHOOK_SECRET` HMAC contract is a false assumption for Gupshup.
The real, verifiable mechanism is **source-IP allowlisting** against the published list above —
fail-closed on unknown source IP. This is authentication, not a weakening: it is the exact
mechanism Gupshup documents, backed by TLS for transport and the existing payload
normalization/dedupe/durability boundary.

### Meta (compatibility only) — signed, keep legacy route as-is

Meta **signs** every webhook POST: `X-Hub-Signature-256: sha256=<hex>` (HMAC-SHA256 over the
raw body with the Meta App Secret) + a GET `hub.challenge` handshake on (re)subscription. The
live legacy route already implements both (`api/meta/webhook/route.ts` POST `:131-139`, GET
`:97`). Since Meta is NOT the launch provider, nothing changes here; this stays a temporary
compat path.

### What the unified route (`/api/whatsapp/webhook`) changes

Current state of `mini_saas_frontend/src/app/api/whatsapp/webhook/route.ts` vs the verified
Gupshup mechanism:

| Current | Reference | Becomes (unfreeze work) |
| --- | --- | --- |
| One `GUPSHUP_WEBHOOK_SECRET` HMAC for both providers | `:8,36-47` | Replaced by Gupshup source-IP allowlist verification for the inbound path; variable's HMAC purpose dropped for the Gupshup path. |
| 401 on missing/mismatched signature header | `:61-64` | Replaced by fail-closed check: reject unless peer source IP ∈ Gupshup webhook IP list. |
| Provider picked from the signing header | `:85` | Provider known from the endpoint/envelope; Gupshup is the launch provider. |
| `hub_challenge` handled only as POST-borne JSON | `:74-76` | Gupshup has no GET handshake, so no GET handler is required for the Gupshup path. |
| Both Meta and flat Gupshup shapes normalised | `:78-93` | Gupshup shape normalisation retained; Meta passthrough normalisation retained (cheap, harmless). |

`GUPSHUP_WEBHOOK_SECRET` is **not** aliased to `META_APP_SECRET` and is **not** the launch
secret — it is retired from the inbound path. Trailing consequence: the incoming `route.ts`
test fixtures that mock a Gupshup signature header become obsolete and must be reworked to
the IP-allowlist contract when the change lands.

### Gate-17 path (verification → implementation → staging test → GO)

1. **Empirical capture (operator, needs Gupshup console).** Point the app's callback URL at
   `webhook.site`; send an inbound message from a real phone; record every request header and
   the **source/peer IP**, and confirm there is no signature header and no GET handshake.
   Capture protocol — record exactly:
   - the full callback URL set in the Gupshup app/console,
   - the complete inbound POST request headers (`webhook.site` shows them; watch for
     `x-gupshup-signature`, `x-hub-signature-256`, `user-agent`, and `x-forwarded-for`),
   - the **source/peer IP actually observed on the request** — this is the decisive evidence;
     do NOT ping/validate candidate IPs from your own machine,
   - whether any GET/handshake occurred on URL registration (Gupshup does not handshake),
   - a second inbound message from a different phone (confirm no per-session difference;
     record its source IP + headers too),
   - one redacted raw inbound body (for the payload-shape check against `normalizePayload`).
   Then compare the OBSERVED source IP against Gupshup's documented list; resolve the
   `13.126.35.181` vs `3.126.35.181` discrepancy from the provider documentation/support —
   never from an active network probe.
   **Do not paste** into the evidence: API keys, tokens, authorization headers, phone numbers,
   customer names, or any customer-identifying/business-identifying data. Return only the
   headers (minus auth material), observed source IPs, and a redacted body.
2. **Implement Gupshup-specific verification (needs unfreeze decision).** In the unified
   route, verify the peer source IP against the Gupshup webhook IP allowlist (fail-closed) and
   remove the Gupshup HMAC path. Reading the peer address behind Vercel's edge requires using
   the trusted `X-Forwarded-For` value the platform sets (never a client-supplied first entry);
   record the exact deployment-specific evidence in the code comment. Keep payload
   validation, `normalizePayload`, dedupe, the durability boundary, and `WEBHOOK_DRAIN_ENABLED=false`.
3. **Staging lifecycle test.** Re-run `worker/scripts/staging-webhook-inbox-verify.ts`
   (real ingest → claim → process) with the allowlist gate active; add allowance for any
   staging egress IP. Confirm forged source IPs are rejected (403/503, provider retries).
4. **Production GO.** Apply the new route + the verified allowlist, flip the Gupshup callback
   URL, keep the drain OFF until activation (gate 19).

---

## Part B — Production secret & allowlist ownership matrix

Storage rule (holds today): **no secret values are committed** — git tracks only
`.example` env files (`mini_saas_frontend/.env.example`, `mini_saas_frontend/.env.local.example`,
`worker/.env.local.example`, `ocr_backend/.env.example`). Real values live only in the
deployment platform's secret store (Vercel env) and in git-ignored local dev files
(`worker/.env.local`, `mini_saas_frontend/.env.local` — staging credentials; never paste into
repo or chat, never into CI logs).

| Secret / config | What it authenticates (IN = inbound, OUT = outbound/subscription) | Where it is referenced | Storage (prod) | Owner | Rotation |
| --- | --- | --- | --- | --- | --- |
| **Gupshup webhook IP allowlist** | IN — the launch webhook authentication (source IP ∈ published list) | unified route (to be implemented); captured from `partner-docs.gupshup.io/docs/gupshup-ip-allowlisting` | Vercel env or route config; record capture date + source | **TBD — assign operator** | Gupshup adds IPs over time (latest 2026-04-15). Review the docs page at every rotation/quarterly review and on webhook delivery failures. Do not treat the list above as static — it is a captured snapshot. |
| `GUPSHUP_PARTNER_ID` / `GUPSHUP_API_KEY` | OUT — Gupshup Embedded Signup OAuth token exchange (`/api/whatsapp/callback`) | `api/whatsapp/callback/route.ts:7-8` | Vercel env | **TBD — assign operator** | Rotate in Gupshup partner console; update env; redeploy frontend. |
| Gupshup app token (Subscription API) | OUT — partner subscribes app to webhook events (v3 `set subscription`) | subscription setup (console/API), not in repo env today | Sealed in subscription config / deploy secrets | **TBD — assign operator** | As above. |
| `META_APP_SECRET` | IN — legacy compat route only (not the launch provider) | `api/meta/webhook/route.ts:131-139` | Vercel env | **TBD — assign operator** | Rotate in Meta App Dashboard → update env → redeploy. |
| Supabase service-role key + staging/prod DSNs | Route + worker DB access | `supabaseAdmin`, worker env | Vercel env / Fly secrets / git-ignored `.env.local` dev files | **TBD — assign operator** | Regenerate in Supabase dashboard; update stores; never in repo. |

**Retired for the inbound path:** `GUPSHUP_WEBHOOK_SECRET` — its HMAC role is a false
assumption for Gupshup; it is not the Meta App Secret and is not aliased to it. Remove it from
the unified inbound auth when the allowlist implementation lands.

### Rotation procedure (summary)

1. Rotate/replace at the provider (Gupshup console, Meta dashboard, Supabase dashboard) or
   refresh the IP list from the official page. 2. Update the single deployment-platform secret
   store (Vercel/Fly) — not local files except the operator's own dev override. 3. Redeploy the
   affected runtime. 4. Confirm a live webhook/DB call succeeds before discarding the old value.
   5. Log rotation date + owner.

### GO implication

Gate **"production secrets ownership"** stays ⏳ until an operator is named for each row above.
Gate **"Gupshup authentication verified"** is now resolved to Gupshup-only + IP allowlisting;
it stays ⏳ until the empirical capture (plan step 1) records the real headers/source IP and the
allowlist verification is implemented and staging-tested (steps 2–3).