import { parseEnv } from '@billzo/shared/authority-config'

let _config: ReturnType<typeof parseEnv> | null = null

export function getAuthorityConfig() {
  if (!_config) {
    _config = parseEnv(typeof process !== 'undefined' ? process.env : {})
  }
  return _config
}
