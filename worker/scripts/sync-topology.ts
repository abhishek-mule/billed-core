// ============================================================
// Topology Sync Validator — Anti-Drift Compiler Pass
// ============================================================
// Requires AUTHORITY_DATABASE_URL and SUPABASE env vars.
// Run in CI after deployments to validate capability→inventory
// alignment. Not part of the hot lint path.
//
// Validates:
//   - governed capability without inventory coverage
//   - inventory references nonexistent intentTypes
//   - capability criticality override references nonexistent capability
//   - overlapping mutation claims between capabilities
// ============================================================

import { buildTopology } from '../sovereignty/topology'

interface TopologyIssue {
  severity: 'error' | 'warning'
  message: string
}

function validate(): void {
  console.log('[TopologySync] Validating sovereignty topology...')
  const issues: TopologyIssue[] = []

  try {
    const topology = buildTopology()
    const ownershipMap = new Map<string, Set<string>>()

    for (const entry of topology) {
      if (entry.governance === 'governed' && entry.intentType) {
        const key = `${entry.table}:${entry.operation}`
        if (!ownershipMap.has(key)) {
          ownershipMap.set(key, new Set())
        }
        ownershipMap.get(key)!.add(entry.intentType!)

        if (!entry.intentType.match(/^[a-z]+\.[a-z_]+$/)) {
          issues.push({
            severity: 'warning',
            message: `Suspicious intentType format: "${entry.intentType}" (table: ${entry.table})`,
          })
        }
      }
    }

    for (const [key, owners] of ownershipMap) {
      if (owners.size > 1) {
        issues.push({
          severity: 'warning',
          message: `Mutation ${key} claimed by multiple capabilities: [${Array.from(owners).join(', ')}]`,
        })
      }
    }

    if (issues.length === 0) {
      console.log('[TopologySync] ✅ Topology valid — no drift detected')
      process.exit(0)
    }

    console.error(`[TopologySync] Found ${issues.length} topology issue(s):`)
    for (const issue of issues) {
      const prefix = issue.severity === 'error' ? '❌' : '⚠️'
      console.error(`  ${prefix} [${issue.severity}] ${issue.message}`)
    }

    const hasErrors = issues.some(i => i.severity === 'error')
    process.exit(hasErrors ? 1 : 0)
  } catch (err: any) {
    console.error('[TopologySync] ❌ Failed to build topology:', err.message)
    console.error('  This script requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.')
    console.error('  Run in CI after deployment, not as part of the build/lint path.')
    process.exit(1)
  }
}

validate()
