// ============================================================
// Authority Gateway — Canonical & Semantic Hashing
// ============================================================
// Replay determinism depends on stable, platform-independent
// hashing.  These functions guarantee that the same logical
// payload always produces the same hash, regardless of:
//   - key ordering
//   - Unicode normalization forms
//   - number encoding quirks
//   - undefined / NaN contamination
// ============================================================

import crypto from 'crypto'

// --- Stable JSON Serialization ---

function serialize(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '' // stripped at object level
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (Number.isNaN(value)) throw new Error('NaN cannot be hashed — likely data corruption')
    if (!Number.isFinite(value)) throw new Error(`Non-finite number cannot be hashed: ${value}`)
    return String(value)
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) {
    const items = value.map(serialize).join(',')
    return `[${items}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).filter(
      (k) => (value as Record<string, unknown>)[k] !== undefined,
    )
    keys.sort()
    const pairs = keys.map((k) => {
      const key = JSON.stringify(k)
      const val = serialize((value as Record<string, unknown>)[k])
      return `${key}:${val}`
    })
    return `{${pairs.join(',')}}`
  }
  return JSON.stringify(value)
}

// --- Hashing ---

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex')
}

/**
 * Compute the canonical hash of any JSON-serializable value.
 *
 * Guarantees:
 *   - Deterministic key ordering (sorted)
 *   - UTF-8 NFC normalization for strings
 *   - undefined values are stripped (they carry no semantic weight)
 *   - NaN and non-finite numbers throw (data corruption detection)
 *   - BigInt is serialized as decimal string
 *   - Date objects are serialized as ISO 8601
 *
 * Output: hex-encoded SHA-256 string.
 */
export function canonicalHash(payload: unknown): string {
  const serialized = serialize(payload)
  return sha256(serialized)
}

/**
 * Compute the semantic hash of a payload after applying a normalizer.
 *
 * The semantic normalizer is per-capability and may:
 *   - normalize phone numbers (+91, spaces, etc.)
 *   - normalize amounts to smallest unit (paise, cents)
 *   - lowercase/uppercase normalize identifiers
 *   - strip irrelevant fields
 *
 * If no normalizer is provided, the semantic hash equals the canonical hash.
 *
 * Output: hex-encoded SHA-256 string.
 */
export function semanticHash(
  payload: Readonly<Record<string, unknown>>,
  normalizer?: (payload: Readonly<Record<string, unknown>>) => Record<string, unknown>,
): string {
  const normalized = normalizer ? normalizer(payload) : { ...payload }
  return canonicalHash(normalized)
}

/**
 * Canonicalize a payload for stable JSON output (not hashing).
 * Useful for debugging, serialization, and wire format.
 */
export function canonicalJson(payload: unknown): string {
  // Reuses serialize for stable ordering, then pretty-prints
  const compact = serialize(payload)
  return JSON.stringify(JSON.parse(compact), null, 2)
}
