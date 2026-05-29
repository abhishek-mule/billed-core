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
  return submitAuthorityIntent(getAuthorityConfig(), intent as any, source as any)
}
