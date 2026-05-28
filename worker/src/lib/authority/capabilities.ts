import { canonicalHash } from './hashing'
import type { CapabilityProvider } from './schemas'

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
    const ids = Array.from(this.capabilities.keys()).sort()
    this._runtimeHash = canonicalHash(ids)
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
}
