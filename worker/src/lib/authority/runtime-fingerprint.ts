import { canonicalHash } from './hashing'

export const DECISION_GRAPH_VERSION = '2026.05.28-alpha'
export const SEMANTIC_NORMALIZER_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // sha256('')

export interface RuntimeFingerprint {
  readonly policy_hash: string
  readonly policy_version: string
  readonly capability_hash: string
  readonly decision_graph_version: string
  readonly semantic_normalizer_hash: string
  readonly environment: string
}

export function emitRuntimeFingerprint(opts: {
  policyHash: string
  policyVersion: string
  capabilityIds: readonly string[]
  environment?: string
}): RuntimeFingerprint {
  const capabilityHash = canonicalHash([...opts.capabilityIds].sort())

  const fingerprint: RuntimeFingerprint = {
    policy_hash: opts.policyHash,
    policy_version: opts.policyVersion,
    capability_hash: capabilityHash,
    decision_graph_version: DECISION_GRAPH_VERSION,
    semantic_normalizer_hash: SEMANTIC_NORMALIZER_HASH,
    environment: opts.environment ?? process.env.NODE_ENV ?? 'development',
  }

  return fingerprint
}
