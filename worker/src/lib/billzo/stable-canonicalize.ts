// ============================================================
// STABLE CANONICALIZER — Deterministic serialization for forensic hashing
// ============================================================
// JSON.stringify is non-deterministic: key ordering varies across
// runtimes, undefined fields are dropped, and floats are not normalized.
//
// This module produces byte-identical output for semantically identical
// inputs across any JS runtime.
//
// Rules:
//   - Objects: keys sorted alphabetically
//   - Arrays: original order preserved (semantic sequences)
//   - Floats: normalized to 6 decimal places to absorb floating-point drift
//   - undefined: serialized as null (not omitted — prevents hash drift)
//   - Dates: ISO UTC string
//   - BigInt: stringified with 'n' suffix
//   - NaN: serialized as "NaN"
//   - Infinity: serialized as "Infinity"
// ============================================================

import { createHash } from 'crypto'

const FLOAT_PRECISION = 6

function normalizeFloat(n: number): string {
  if (Number.isNaN(n)) return '"NaN"'
  if (!Number.isFinite(n)) return n > 0 ? '"Infinity"': '"-Infinity"'
  const normalized = parseFloat(n.toFixed(FLOAT_PRECISION))
  return normalized.toString()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || value === undefined) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function stableCanonicalize(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'null'
  }

  if (typeof value === 'boolean') {
    return value.toString()
  }

  if (typeof value === 'number') {
    return normalizeFloat(value)
  }

  if (typeof value === 'bigint') {
    return `"${value.toString()}n"`
  }

  if (typeof value === 'string') {
    return JSON.stringify(value)
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString())
  }

  if (Array.isArray(value)) {
    const elements = value.map((el) => stableCanonicalize(el))
    return `[${elements.join(',')}]`
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort()
    const pairs = keys.map((key) => {
      const k = JSON.stringify(key)
      const v = stableCanonicalize(value[key])
      return `${k}:${v}`
    })
    return `{${pairs.join(',')}}`
  }

  return JSON.stringify(value)
}

export function canonicalHash(value: unknown): string {
  const serialized = stableCanonicalize(value)
  return createHash('sha256').update(serialized, 'utf8').digest('hex')
}

export { stableCanonicalize }
