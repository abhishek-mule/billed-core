import { AuthorityRuntime } from './lib/authority/authority-runtime'
import { recoveryCapabilities } from './lib/authority/recovery-capabilities'
import { invoiceCapabilities } from './lib/authority/invoice-capabilities'
import { reconciliationCapabilities } from './lib/authority/reconciliation-capabilities'
import { tenantCapabilities } from './lib/authority/tenant-capabilities'
import { gstrCapabilities } from './lib/authority/gstr-capabilities'
import { supabaseAdmin } from './lib/billzo/supabase-admin'
import type { AuthorityRuntimeConfig } from './lib/authority/authority-runtime'

const CAPABILITY_PROVIDERS = [
  ...recoveryCapabilities,
  ...invoiceCapabilities,
  ...reconciliationCapabilities,
  ...tenantCapabilities,
  ...gstrCapabilities,
]

const GATEWAY_PORT = Number(process.env.AUTHORITY_GATEWAY_PORT ?? process.env.PORT ?? '10000')

async function tenantPlanLookup(tenantId: string): Promise<string | undefined> {
  try {
    const { data } = await supabaseAdmin.from('tenants').select('plan').eq('id', tenantId).maybeSingle()
    return data?.plan ?? undefined
  } catch {
    return undefined
  }
}

async function boot(): Promise<void> {
  const runtime = new AuthorityRuntime()

  const config: AuthorityRuntimeConfig = {
    supabaseAdmin: supabaseAdmin as unknown as AuthorityRuntimeConfig['supabaseAdmin'],
    redisRateLimitStore: null,
    tenantPlanLookup,
    capabilityProviders: CAPABILITY_PROVIDERS,
    requiredCapabilities: CAPABILITY_PROVIDERS.map((c) => c.capabilityId),
    bootstrapCreatedBy: 'billzo-worker:index',
    gatewayPort: GATEWAY_PORT,
    databaseUrl: process.env.AUTHORITY_DATABASE_URL ?? process.env.DATABASE_URL,
  }

  await runtime.initialize(config)
  await runtime.activate(config)

  console.log(`[worker] authority runtime RUNNING (phase=${runtime.orchestrator.currentPhase}, gateway=:${GATEWAY_PORT})`)
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] received ${signal}, shutting down`)
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

boot().catch((err) => {
  console.error('[worker] boot failed:', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})