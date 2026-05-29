import { parseEnv } from '@billzo/shared/authority-config'

export const AUTHORITY_CONFIG = parseEnv(typeof process !== 'undefined' ? process.env : {})
