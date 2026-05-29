import { parseEnv } from '@billzo/shared/authority-config'
import type { AuthorityConfig } from '@billzo/shared/authority-config'

let _config: AuthorityConfig | null = null
let _errored = false

export function getAuthorityConfig(): AuthorityConfig | null {
  if (_config) return _config
  if (_errored) return null
  try {
    _config = parseEnv(typeof process !== 'undefined' ? process.env : {})
    return _config
  } catch (e) {
    _errored = true
    console.warn('[authority] Config not available:', (e as Error).message)
    return null
  }
}
