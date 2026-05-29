import postgres from 'postgres'
import { RuntimeOrchestrator, RuntimePhase } from './runtime-phase'
import { CapabilityRegistry } from './capabilities'
import { InternalAuthorityClient } from './internal-authority'
import { AuthorityPersistence } from './persistence'
import { AuthorityOutboxDispatcher } from './outbox-dispatcher'
import { createAuthorityGateway } from './gateway'
import { ensureMinimumPolicySet, BOOTSTRAP_POLICYSET_VERSION, BOOTSTRAP_POLICYSET_HASH } from './policy-compiler'
import { emitRuntimeFingerprint } from './runtime-fingerprint'
import { assertOperational, type ReadinessReport } from './readiness'
import { createDegradeableRateLimitStore } from './rate-limit-store'
import type { PolicyBundle, CapabilityProvider } from './schemas'
import type { AuthorityCoreConfig, RateLimitStore } from './core'

export interface SupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (n: number) => Promise<{ data: any[] | null; error: any }>
    }
    insert: (rows: any[]) => Promise<{ error: any }>
  }
}

export interface AuthorityRuntimeConfig {
  readonly supabaseAdmin: SupabaseClient
  readonly redisRateLimitStore: RateLimitStore | null
  readonly tenantPlanLookup: (tenantId: string) => Promise<string | undefined>
  readonly capabilityProviders: readonly CapabilityProvider[]
  readonly requiredCapabilities: readonly string[]
  readonly bootstrapCreatedBy: string
  readonly gatewayPort?: number
  readonly databaseUrl?: string
}

export class AuthorityRuntime {
  readonly orchestrator: RuntimeOrchestrator
  readonly capabilities: CapabilityRegistry
  readonly internalClient: InternalAuthorityClient

  private _persistence: AuthorityPersistence | null = null
  private _policy: PolicyBundle | null = null
  private _policySnapshotHash: string | null = null
  private _config: AuthorityCoreConfig | null = null
  private _dispatcher: AuthorityOutboxDispatcher | null = null
  private _gateway: ReturnType<typeof createAuthorityGateway> | null = null
  private _gatewayServer: { close: () => void } | null = null
  private _rateLimitStore: RateLimitStore
  private _fingerprint: ReturnType<typeof emitRuntimeFingerprint> | null = null
  private _sql: postgres.Sql | null = null

  constructor() {
    this.orchestrator = new RuntimeOrchestrator()
    this.capabilities = new CapabilityRegistry()
    this._rateLimitStore = createDegradeableRateLimitStore(null)
    this.internalClient = new InternalAuthorityClient({
      policy: this.fallbackPolicy(),
      capabilities: this.capabilities.getAll(),
      rateLimitStore: this._rateLimitStore,
      tenantPlanLookup: async () => undefined,
      registrySnapshotHash: '',
    })
  }

  get persistence(): AuthorityPersistence | null {
    return this._persistence
  }

  private fallbackPolicy(): PolicyBundle {
    return { policyVersion: 'none', rules: [] }
  }

  get policy(): PolicyBundle | null {
    return this._policy
  }

  get policySnapshotHash(): string | null {
    return this._policySnapshotHash
  }

  get config(): AuthorityCoreConfig | null {
    return this._config
  }

  get fingerprint(): ReturnType<typeof emitRuntimeFingerprint> | null {
    return this._fingerprint
  }

  /**
   * Phase 1-3: Policy loading → capability registration → authority core.
   * Does NOT start queues or HTTP. Safe to call before other workers.
   */
  async initialize(conf: AuthorityRuntimeConfig): Promise<void> {
    try {
      await this.initCore(conf)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.orchestrator.panic(msg)
      throw err
    }
  }

  /**
   * Phase 4-6: Queues → HTTP gateway → readiness self-test → RUNNING.
   * Must be called LAST — after ALL queue workers are created.
   * Gateway does not open until phase 5.
   */
  async activate(conf: AuthorityRuntimeConfig): Promise<void> {
    try {
      await this.activateGateway(conf)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.orchestrator.panic(msg)
      throw err
    }
  }

  private async initCore(conf: AuthorityRuntimeConfig): Promise<void> {
    // PHASE 1: POLICY
    const policyResult = await ensureMinimumPolicySet({
      supabaseAdmin: conf.supabaseAdmin,
      createdBy: conf.bootstrapCreatedBy,
    })
    this._policySnapshotHash = policyResult.seeded
      ? policyResult.snapshotHash
      : BOOTSTRAP_POLICYSET_HASH
    this._policy = await this.loadPolicyFromDb(conf.supabaseAdmin)
    this.orchestrator.transition(RuntimePhase.POLICY_READY)

    // PHASE 2: CAPABILITIES
    for (const provider of conf.capabilityProviders) {
      this.capabilities.register(provider)
    }
    this.capabilities.assertRequiredCapabilities(conf.requiredCapabilities)
    this.capabilities.freeze()
    this.orchestrator.transition(RuntimePhase.CAPABILITIES_READY)

    // PHASE 2b: PERSISTENCE
    const databaseUrl = conf.databaseUrl || process.env.AUTHORITY_DATABASE_URL
    if (databaseUrl) {
      this._sql = postgres(databaseUrl, { max: 4, connection: { application_name: 'authority-runtime' } })
      this._persistence = new AuthorityPersistence(this._sql)
    }

    // PHASE 3: AUTHORITY CORE
    this._rateLimitStore = createDegradeableRateLimitStore(conf.redisRateLimitStore)
    this._config = {
      policy: this._policy,
      capabilities: this.capabilities.getAll(),
      rateLimitStore: this._rateLimitStore,
      tenantPlanLookup: conf.tenantPlanLookup,
      registrySnapshotHash: this.capabilities.runtimeHash,
    }
    this.internalClient.reconfigure(this._config, this._persistence, this.capabilities)
    this.orchestrator.transition(RuntimePhase.AUTHORITY_READY)
  }

  private async activateGateway(conf: AuthorityRuntimeConfig): Promise<void> {
    // PHASE 4: QUEUES — start authority outbox dispatcher
    this.orchestrator.assertPhase(RuntimePhase.AUTHORITY_READY)
    if (this._sql && this.capabilities.isFrozen) {
      this._dispatcher = new AuthorityOutboxDispatcher(this._sql, this.capabilities)
      this._dispatcher.start()
    }
    this.orchestrator.transition(RuntimePhase.QUEUES_READY)

    // PHASE 5: HTTP GATEWAY (starts LAST)
    if (!this._config) {
      throw new Error('AuthorityRuntime not initialized')
    }
    this._gateway = createAuthorityGateway(this._config)

    const { serve } = await import('@hono/node-server')
    const port = conf.gatewayPort ?? 3001
    this._gatewayServer = serve({
      fetch: this._gateway.fetch,
      port,
    })
    console.log(`[AuthorityRuntime] Gateway listening on :${port}`)
    this.orchestrator.transition(RuntimePhase.HTTP_READY)

    // PHASE 6: READINESS SELF-TEST
    const report = this.assertOperational()
    if (!report.operational) {
      const failures = report.checks.filter((c) => !c.ok).map((c) => c.error).join('; ')
      throw new Error(`Readiness check failed: ${failures}`)
    }

    this._fingerprint = emitRuntimeFingerprint({
      policyHash: this._policySnapshotHash ?? '',
      policyVersion: this._policy?.policyVersion ?? 'unknown',
      capabilityIds: this.capabilities.getAll().map((c) => c.capabilityId),
    })

    console.log('[AuthorityRuntime] Runtime fingerprint:', JSON.stringify(this._fingerprint, null, 2))
    this.orchestrator.transition(RuntimePhase.RUNNING)
  }

  assertOperational(): ReadinessReport {
    return assertOperational({
      phase: this.orchestrator.currentPhase,
      capabilityRegistry: this.capabilities,
      policyPresent: this._policy !== null,
      gatewayListening: this._gatewayServer !== null,
    })
  }

  private async loadPolicyFromDb(_supabase: SupabaseClient): Promise<PolicyBundle> {
    const { DEFAULT_POLICY_BUNDLE_V1 } = await import('./policy-compiler')
    return DEFAULT_POLICY_BUNDLE_V1
  }

  async shutdown(): Promise<void> {
    console.log('[AuthorityRuntime] Shutting down...')
    if (this._dispatcher) {
      this._dispatcher.stop()
      console.log('[AuthorityRuntime] Dispatcher stopped')
    }
    if (this._gatewayServer) {
      this._gatewayServer.close()
      console.log('[AuthorityRuntime] Gateway stopped')
    }
    if (this._sql) {
      await this._sql.end()
      console.log('[AuthorityRuntime] DB connection closed')
    }
    console.log('[AuthorityRuntime] Shutdown complete')
  }
}
