import type { AuthorityConfig } from './schema'

interface EnvSource {
  [key: string]: string | undefined
}

const DEFAULTS: Readonly<Partial<AuthorityConfig>> = {
  gatewayUrl: 'http://localhost:3001',
  transportTimeoutMs: 10_000,
  transportRetryCount: 3,
  transportRetryBaseMs: 200,
  replaySkewToleranceMs: 30_000,
  leaseTtlMs: 15_000,
  maxExecutionMs: 10_000,
  clockSkewToleranceMs: 2_000,
}

function requireEnv(env: EnvSource, key: string): string {
  const val = env[key]
  if (!val) {
    throw new Error(
      `AuthorityConfig: missing required env variable "${key}". ` +
      `Set it in .env or process environment before parseEnv() is called.`
    )
  }
  return val
}

function parseHmacSecrets(env: EnvSource): Record<string, string> {
  const prefix = 'AUTHORITY_HMAC_SECRET_'
  const secrets: Record<string, string> = {}
  for (const key of Object.keys(env)) {
    if (key.startsWith(prefix)) {
      const source = key.slice(prefix.length).toLowerCase()
      const val = env[key]!
      if (!val) continue
      secrets[source] = val
    }
  }
  return secrets
}

function freezeDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return Object.freeze(obj.map(freezeDeep)) as unknown as T
  const props = Object.getOwnPropertyNames(obj)
  for (const prop of props) {
    const val = (obj as Record<string, unknown>)[prop]
    if (val !== null && typeof val === 'object') {
      freezeDeep(val)
    }
  }
  return Object.freeze(obj)
}

export function parseEnv(env: EnvSource): AuthorityConfig {
  const hmacSecrets = parseHmacSecrets(env)

  const raw: AuthorityConfig = {
    gatewayUrl: env.AUTHORITY_GATEWAY_URL || DEFAULTS.gatewayUrl!,
    hmacSecrets,
    transportTimeoutMs: Number(env.AUTHORITY_TRANSPORT_TIMEOUT_MS) || DEFAULTS.transportTimeoutMs!,
    transportRetryCount: Number(env.AUTHORITY_TRANSPORT_RETRY_COUNT) || DEFAULTS.transportRetryCount!,
    transportRetryBaseMs: Number(env.AUTHORITY_TRANSPORT_RETRY_BASE_MS) || DEFAULTS.transportRetryBaseMs!,
    replaySkewToleranceMs: Number(env.AUTHORITY_REPLAY_SKEW_TOLERANCE_MS) || DEFAULTS.replaySkewToleranceMs!,
    databaseUrl: requireEnv(env, 'AUTHORITY_DATABASE_URL'),
    leaseTtlMs: Number(env.AUTHORITY_LEASE_TTL_MS) || DEFAULTS.leaseTtlMs!,
    maxExecutionMs: Number(env.AUTHORITY_MAX_EXECUTION_MS) || DEFAULTS.maxExecutionMs!,
    clockSkewToleranceMs: Number(env.AUTHORITY_CLOCK_SKEW_TOLERANCE_MS) || DEFAULTS.clockSkewToleranceMs!,
  }

  if (raw.transportTimeoutMs < 100) throw new Error('AuthorityConfig: transportTimeoutMs must be >= 100')
  if (raw.leaseTtlMs < 1000) throw new Error('AuthorityConfig: leaseTtlMs must be >= 1000')

  return freezeDeep(raw)
}
