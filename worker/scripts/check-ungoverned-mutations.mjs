// ============================================================
// Mutation Governance Lint — Sovereignty Compiler Pass
// ============================================================
// Scans worker source + queues for direct supabase mutations.
// Every mutation must declare constitutional intent via:
//   // authority:governed <intentType>
//   // authority:fallback <intentType>
//   // authority:exempt <justificationCode>
//   // authority:deferred-authoritative <justificationCode>
//
// Build fails on unclassified mutations.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'

const WORKER_SRC = path.resolve(import.meta.dirname, '..', 'src')
const WORKER_QUEUES = path.resolve(import.meta.dirname, '..', 'queues')

const VALID_JUSTIFICATION_CODES = new Set([
  'derived_state',
  'append_only_observability',
  'event_transport',
  'offline_sync_debt',
  'bootstrap_import',
  'idempotency_guard',
  'notification_routing',
  'ephemeral_operational_state',
])

const VALID_GOVERNANCE_PREFIXES = ['authority:governed ', 'authority:fallback ']
const VALID_EXEMPT_PREFIXES = ['authority:exempt ', 'authority:deferred-authoritative ']

const MUTATION_PATTERNS = [
  /supabaseAdmin\.from\([^)]+\)\.\s*update\s*\(/g,
  /supabaseAdmin\.from\([^)]+\)\.\s*insert\s*\(/g,
  /supabaseAdmin\.from\([^)]+\)\.\s*delete\s*\(/g,
  /supabaseAdmin\.from\([^)]+\)\.\s*upsert\s*\(/g,
]

const EXEMPT_DIRS = [
  path.join(WORKER_SRC, 'lib', 'authority'),
]

function isExempt(filePath) {
  return EXEMPT_DIRS.some(d => filePath.startsWith(d))
}

function findClassificationComment(content, mutationIndex) {
  const firstLines = content.split('\n').slice(0, 5)
  for (const line of firstLines) {
    if (line.includes('authority:')) return line
  }

  const lines = content.substring(0, mutationIndex).split('\n')
  const lastLines = lines.slice(-5)
  for (const line of lastLines) {
    if (line.includes('authority:')) return line
  }

  return null
}

function classifyComment(comment) {
  const trimmed = comment.trim()

  for (const prefix of VALID_GOVERNANCE_PREFIXES) {
    if (trimmed.includes(prefix)) {
      const value = trimmed.substring(trimmed.indexOf(prefix) + prefix.length).split(/\s/)[0].trim()
      if (!value || value.startsWith('//') || value.startsWith('*')) {
        return { type: 'invalid', reason: `Missing intent type after ${prefix.trim()}` }
      }
      return { type: prefix === 'authority:governed ' ? 'governed' : 'fallback', value }
    }
  }

  for (const prefix of VALID_EXEMPT_PREFIXES) {
    if (trimmed.includes(prefix)) {
      const value = trimmed.substring(trimmed.indexOf(prefix) + prefix.length).split(/\s/)[0].trim()
      if (!value || value.startsWith('//') || value.startsWith('*')) {
        return { type: 'invalid', reason: `Missing justification code after ${prefix.trim()}` }
      }
      if (!VALID_JUSTIFICATION_CODES.has(value)) {
        return { type: 'invalid', reason: `Unknown justification code "${value}". Valid codes: ${Array.from(VALID_JUSTIFICATION_CODES).join(', ')}` }
      }
      return { type: prefix === 'authority:exempt ' ? 'exempt' : 'deferred-authoritative', value }
    }
  }

  return { type: 'invalid', reason: 'Unrecognized authority comment format' }
}

function scanFile(filePath, scanQueues) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const violations = []

  for (const regex of MUTATION_PATTERNS) {
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(content)) !== null) {
      const matchStr = match[0].substring(0, 60)
      const lineNumber = content.substring(0, match.index).split('\n').length

      const comment = findClassificationComment(content, match.index)
      if (!comment) {
        violations.push({
          file: filePath,
          line: lineNumber,
          pattern: matchStr,
          reason: 'Unclassified mutation — add // authority:governed|fallback|exempt|deferred-authoritative comment',
        })
        continue
      }

      const result = classifyComment(comment)
      if (result.type === 'invalid') {
        violations.push({
          file: filePath,
          line: lineNumber,
          pattern: matchStr,
          reason: result.reason,
        })
      }
    }
  }

  return violations
}

function scanDirectory(dir, scanQueues) {
  const violations = []
  if (!fs.existsSync(dir)) return violations

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      violations.push(...scanDirectory(fullPath, scanQueues))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      if (isExempt(fullPath)) continue
      violations.push(...scanFile(fullPath, scanQueues))
    }
  }

  return violations
}

function main() {
  console.log('[MutationLint] Scanning for ungoverned supabase mutations...')
  const srcViolations = scanDirectory(WORKER_SRC, false)
  const queueViolations = scanDirectory(WORKER_QUEUES, true)
  const violations = [...srcViolations, ...queueViolations]

  if (violations.length === 0) {
    console.log('[MutationLint] ✅ All mutations are classified (governed|fallback|exempt|deferred-authoritative)')
    process.exit(0)
  }

  console.error(`[MutationLint] ❌ Found ${violations.length} unclassified/invalid mutation(s):`)
  for (const v of violations) {
    const relPath = path.relative(WORKER_SRC, v.file)
    const displayPath = relPath.startsWith('..') ? path.relative(path.resolve(import.meta.dirname, '..'), v.file) : relPath
    console.error(`  ${displayPath}:${v.line}`)
    console.error(`    ${v.pattern}`)
    console.error(`    Reason: ${v.reason}`)
  }
  console.error()
  process.exit(1)
}

main()
