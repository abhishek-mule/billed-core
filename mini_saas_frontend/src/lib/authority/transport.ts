import { submitAuthorityIntent } from '@billzo/shared/authority-transport'
import { getAuthorityConfig } from './config'
import type { IntentEnvelope } from '@billzo/shared/authority-transport'

export { submitAuthorityIntent } from '@billzo/shared/authority-transport'
export type { IntentEnvelope }

export function getAuthorityTransport() {
  return getAuthorityConfig()
}

export async function submitIntent(
  intent: Omit<IntentEnvelope, 'signature'>,
  source: string,
): Promise<{ accepted: boolean; intentId: string; error?: string }> {
  const config = getAuthorityConfig()
  if (!config) {
    return { accepted: false, intentId: '', error: 'Authority config not available (missing env vars)' }
  }
  return submitAuthorityIntent(config, intent as any, source as any)
}
