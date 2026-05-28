import { semanticHash } from './hashing'
import type { CapabilityProvider, SemanticDedupRule } from './schemas'

export type NormalizerFn = (payload: Readonly<Record<string, unknown>>) => Record<string, unknown>

export interface RegisteredNormalizer {
  readonly capabilityId: string
  readonly normalizer: NormalizerFn
}

export class SemanticNormalizerRegistry {
  private readonly normalizers = new Map<string, NormalizerFn>()

  register(capabilityId: string, normalizer: NormalizerFn): void {
    if (this.normalizers.has(capabilityId)) {
      return
    }
    this.normalizers.set(capabilityId, normalizer)
  }

  registerFromCapability(provider: CapabilityProvider): void {
    if (provider.semanticNormalizer) {
      this.register(provider.capabilityId, provider.semanticNormalizer)
    }
  }

  getNormalizer(capabilityId: string): NormalizerFn | undefined {
    return this.normalizers.get(capabilityId)
  }

  computeDedupHash(
    capabilityId: string,
    payload: Readonly<Record<string, unknown>>,
  ): string {
    const normalizer = this.normalizers.get(capabilityId) ?? ((p) => ({ ...p }))
    return semanticHash(payload, normalizer)
  }

  evaluateDedup(
    dedupRule: SemanticDedupRule,
    payload: Readonly<Record<string, unknown>>,
    recentIntents: Array<{ payload_hash: string }>,
  ): { matched: boolean; matchedHash?: string } {
    const hash = this.computeDedupHash(dedupRule.capabilityId, payload)
    const matched = recentIntents.some((i) => i.payload_hash === hash)
    return matched ? { matched: true, matchedHash: hash } : { matched: false }
  }

  get allNormalizers(): ReadonlyMap<string, NormalizerFn> {
    return this.normalizers
  }
}
