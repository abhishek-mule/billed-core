import type { SovereigntyCriticality, SovereigntyScope, MutationInventoryEntry } from '@billzo/shared'
import { EXEMPT_ENTRIES, DEFERRED_ENTRIES, CRITICALITY_OVERRIDES } from './exemptions'
import { CapabilityRegistry } from '../src/lib/authority/capabilities'
import { invoiceCapabilities } from '../src/lib/authority/invoice-capabilities'
import { tenantCapabilities } from '../src/lib/authority/tenant-capabilities'
import { reconciliationCapabilities } from '../src/lib/authority/reconciliation-capabilities'
import { recoveryCapabilities } from '../src/lib/authority/recovery-capabilities'
import { gstrCapabilities } from '../src/lib/authority/gstr-capabilities'

function heuristicCriticality(classification: string): SovereigntyCriticality {
  switch (classification) {
    case 'financial':    return 'financial'
    case 'regulatory':   return 'regulatory'
    case 'transport':    return 'transport'
    case 'infrastructure': return 'operational'
    case 'destructive':  return 'financial'
    default:             return 'operational'
  }
}

function heuristicScope(blastRadius: string): SovereigntyScope {
  switch (blastRadius) {
    case 'tenant':  return 'tenant_local'
    case 'system':  return 'cross_tenant'
    case 'external': return 'global'
    default:        return 'tenant_local'
  }
}

export function buildTopology(): MutationInventoryEntry[] {
  const registry = new CapabilityRegistry()
  for (const p of invoiceCapabilities) registry.register(p)
  for (const p of tenantCapabilities) registry.register(p)
  for (const p of reconciliationCapabilities) registry.register(p)
  for (const p of recoveryCapabilities) registry.register(p)
  for (const p of gstrCapabilities) registry.register(p)
  registry.freeze()

  const derived: MutationInventoryEntry[] = []
  const overrideMap = new Map(CRITICALITY_OVERRIDES.map(o => [o.capabilityId, o]))

  for (const provider of registry.getAll()) {
    const override = overrideMap.get(provider.capabilityId)
    const criticality = override?.overrideCriticality ?? heuristicCriticality(provider.classification)
    const scope = override?.overrideScope ?? heuristicScope(provider.blastRadius)

    for (const mutation of (provider.ownedMutations ?? [])) {
      derived.push({
        table: mutation.table,
        mutationPath: `(capability:${provider.capabilityId})`,
        lineNumber: 0,
        operation: 'update',
        governance: 'governed',
        intentType: provider.capabilityId.replace(/\.v\d+$/, ''),
        justificationCode: 'ephemeral_operational_state',
        reversibility: provider.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
        criticality,
        scope,
        sourceOfTruth: 'authority',
      })
    }
  }

  return [...derived, ...EXEMPT_ENTRIES, ...DEFERRED_ENTRIES]
}

export function mutationIsInInventory(
  inventory: MutationInventoryEntry[],
  table: string,
  operation: string,
  lineNumber: number,
): MutationInventoryEntry | undefined {
  return inventory.find(e =>
    e.table === table &&
    e.operation === operation &&
    Math.abs(e.lineNumber - lineNumber) <= 3,
  )
}
