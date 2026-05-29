import { submitAuthorityIntent } from '@billzo/shared/authority-transport'
import { AUTHORITY_CONFIG } from './config'
import type { IntentEnvelope } from '@billzo/shared/authority-transport'

export { submitAuthorityIntent } from '@billzo/shared/authority-transport'
export type { IntentEnvelope }

export function getAuthorityTransport() {
  return {
    gatewayUrl: AUTHORITY_CONFIG.gatewayUrl,
    hmacSecrets: AUTHORITY_CONFIG.hmacSecrets,
    timeoutMs: AUTHORITY_CONFIG.transportTimeoutMs,
    retryCount: AUTHORITY_CONFIG.transportRetryCount,
    retryBaseMs: AUTHORITY_CONFIG.transportRetryBaseMs,
  }
}

export async function submitIntent(
  intent: Omit<IntentEnvelope, 'signature'>,
  source: string,
): Promise<{ accepted: boolean; intentId: string; error?: string }> {
  return submitAuthorityIntent(intent, source, getAuthorityTransport())
}
