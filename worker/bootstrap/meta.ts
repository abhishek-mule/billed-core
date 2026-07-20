import type { MetaConfig } from '@billzo/shared'
import { MetaAdapter } from '../src/lib/transport/adapters/meta-adapter'

// ── Pilot bootstrap (Scenario A) ──
// BillZo owns a single Meta WABA used for every merchant's reminders. Meta is
// infrastructure here, configured once at boot from the environment — never per
// tenant, never via a database "channel" row. See FIRST_MERCHANT_PLAYBOOK.md.

let metaAdapter: MetaAdapter | null = null

function readConfig(): MetaConfig | null {
  const accessToken = process.env.META_ACCESS_TOKEN
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID
  const wabaId = process.env.META_WABA_ID
  if (!accessToken || !phoneNumberId) return null
  return { accessToken, phoneNumberId, wabaId: wabaId || '' }
}

export async function initializeMeta(): Promise<void> {
  const config = readConfig()
  if (!config) {
    throw new Error('Meta bootstrap: META_ACCESS_TOKEN / META_PHONE_NUMBER_ID are required (worker refusing to start)')
  }
  metaAdapter = new MetaAdapter(config)
  await metaAdapter.initialize()
}

export function getMetaAdapter(): MetaAdapter {
  if (!metaAdapter) {
    throw new Error('Meta adapter not initialized — call initializeMeta() during worker boot')
  }
  return metaAdapter
}
