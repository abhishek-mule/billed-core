export interface AuthorityConfig {
  readonly gatewayUrl: string
  readonly hmacSecrets: Readonly<Record<string, string>>
  readonly transportTimeoutMs: number
  readonly transportRetryCount: number
  readonly transportRetryBaseMs: number
  readonly replaySkewToleranceMs: number
  readonly databaseUrl: string
  readonly leaseTtlMs: number
  readonly maxExecutionMs: number
  readonly clockSkewToleranceMs: number
}
