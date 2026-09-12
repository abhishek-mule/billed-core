import 'dotenv/config'
import { createAuthorityGateway } from './lib/authority/gateway'
import { CapabilityRegistry } from './lib/authority/capabilities'
import { tenantCapabilities } from './lib/authority/tenant-capabilities'
import { invoiceCapabilities } from './lib/authority/invoice-capabilities'
import { recoveryCapabilities } from './lib/authority/recovery-capabilities'
import { gstrCapabilities } from './lib/authority/gstr-capabilities'
import { reconciliationCapabilities } from './lib/authority/reconciliation-capabilities'
import { DEFAULT_POLICY_BUNDLE_V1 } from './lib/authority/policy-compiler'
import { createDegradeableRateLimitStore } from './lib/authority/rate-limit-store'
import type { AuthorityCoreConfig } from './lib/authority/core'

// Gateway-only dev boot: starts JUST the authority HTTP gateway on
// :3001 (override with AUTHORITY_GATEWAY_PORT). No recovery queues, no
// database, no outbound side effects — mirroring the same policy bundle
// and capability registry the full runtime would load in production.
async function main(): Promise<void> {
  const capabilities = new CapabilityRegistry()
  for (const provider of [
    ...tenantCapabilities,
    ...invoiceCapabilities,
    ...recoveryCapabilities,
    ...gstrCapabilities,
    ...reconciliationCapabilities,
  ] as const) {
    capabilities.register(provider)
  }
  capabilities.freeze()

  const config: AuthorityCoreConfig = {
    policy: DEFAULT_POLICY_BUNDLE_V1,
    capabilities: capabilities.getAll(),
    rateLimitStore: createDegradeableRateLimitStore(null),
    tenantPlanLookup: async () => undefined,
    registrySnapshotHash: capabilities.runtimeHash,
  }

  const app = createAuthorityGateway(config)

  const { serve } = await import('@hono/node-server')
  const port = Number(process.env.AUTHORITY_GATEWAY_PORT || 3001)
  const server = serve({ fetch: app.fetch, port })

  const shutdown = (): void => {
    console.log('[gateway] Shutting down...')
    server.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  console.log(`[gateway] Authority gateway listening on http://localhost:${port}`)
  console.log(`[gateway] Policy: ${DEFAULT_POLICY_BUNDLE_V1.policyVersion} (bootstrap)`)
  console.log(`[gateway] Capabilities: ${capabilities.getAll().map((c) => c.capabilityId).join(', ')}`)
  console.log('[gateway] HMAC sources: app, n8n_prod, worker, internal_worker')
}

main().catch((err) => {
  console.error('[gateway] Failed to start:', err instanceof Error ? err.message : err)
  process.exit(1)
})