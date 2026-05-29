import { canonicalHash } from './hashing'
import type { CapabilityProvider, OwnedMutation } from './schemas'

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilityProvider>()
  private _frozen = false
  private _runtimeHash: string | null = null

  register(provider: CapabilityProvider): void {
    if (this._frozen) {
      throw new Error(`CapabilityRegistry is frozen — cannot register ${provider.capabilityId}`)
    }
    if (this.capabilities.has(provider.capabilityId)) {
      return
    }
    this.capabilities.set(provider.capabilityId, provider)
  }

  freeze(): void {
    if (this._frozen) return
    this._frozen = true

    const allProviders = Array.from(this.capabilities.values())
    this.checkOwnershipOverlap(allProviders)
    this._runtimeHash = this.computeRuntimeHash(allProviders)
  }

  get isFrozen(): boolean {
    return this._frozen
  }

  get runtimeHash(): string {
    if (!this._frozen) {
      throw new Error('CapabilityRegistry not yet frozen — runtimeHash unavailable')
    }
    return this._runtimeHash!
  }

  assertRequiredCapabilities(ids: readonly string[]): void {
    const missing = ids.filter((id) => !this.capabilities.has(id))
    if (missing.length > 0) {
      throw new Error(
        `Required capabilities missing: [${missing.join(', ')}]. ` +
        `Registered: [${Array.from(this.capabilities.keys()).join(', ')}]`,
      )
    }
  }

  get(capabilityId: string): CapabilityProvider | undefined {
    return this.capabilities.get(capabilityId)
  }

  getAll(): readonly CapabilityProvider[] {
    return Array.from(this.capabilities.values())
  }

  findForIntent(intentType: string): CapabilityProvider[] {
    return this.getAll().filter((c) => c.capabilityId.startsWith(intentType))
  }

  get size(): number {
    return this.capabilities.size
  }

  private checkOwnershipOverlap(providers: CapabilityProvider[]): void {
    const ownership = new Map<string, Map<string, string[]>>()

    for (const p of providers) {
      const mutations = p.ownedMutations ?? []
      for (const mut of mutations) {
        if (!ownership.has(mut.table)) {
          ownership.set(mut.table, new Map())
        }
        const colMap = ownership.get(mut.table)!
        const cols = mut.columns ?? []
        for (const col of cols) {
          if (!colMap.has(col)) {
            colMap.set(col, [])
          }
          colMap.get(col)!.push(p.capabilityId)
        }
      }
    }

    for (const [table, colMap] of ownership) {
      for (const [col, owners] of colMap) {
        if (owners.length > 1) {
          console.warn(
            `[CapabilityRegistry] Ownership overlap detected: ` +
            `table "${table}" column "${col}" is claimed by: [${owners.join(', ')}]`,
          )
        }
      }
    }
  }

  private computeRuntimeHash(providers: CapabilityProvider[]): string {
    const sorted = [...providers].sort((a, b) => a.capabilityId.localeCompare(b.capabilityId))

    const metadata = sorted.map((p) => ({
      id: p.capabilityId,
      classification: p.classification,
      reversibility: p.reversibility,
      blastRadius: p.blastRadius,
      priorityClass: p.priorityClass,
      ownedMutations: [...(p.ownedMutations ?? [])]
        .sort((a, b) => a.table.localeCompare(b.table))
        .map((m) => ({
          table: m.table,
          columns: m.columns ? [...m.columns].sort() : undefined,
        })),
    }))

    return canonicalHash(metadata)
  }
}
