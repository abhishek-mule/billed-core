// ============================================================
// Backfill Recovery Cases — One-time migration
// ============================================================
// Groups invoices by (tenant_id, customer_id), computes aggregate
// collection position, and upserts into recovery_cases with v2
// state columns. Inserts a recovery_case_event (type: 'backfill')
// for each case.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/backfill-recovery-cases.mjs
//
// Options:
//   BATCH=500          invoices per batch (default)
//   TENANT_ID=xxx      backfill single tenant (optional)
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const BATCH = parseInt(process.env.BATCH || '500', 10)
const SINGLE_TENANT = process.env.TENANT_ID || null

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const API = `${SUPABASE_URL}/rest/v1`
const HEADERS = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

// ============================================================
// State precedence (mirrors deriveRecoveryState from shared)
// ============================================================
const PRECEDENCE = {
  active: 0,
  overdue: 1,
  partial_payment: 2,
  promised: 3,
  disputed: 4,
  recovered: 5,
  closed: 6,
}

function deriveState(invoices) {
  let hasOverdue = false
  let hasPartial = false
  let hasActive = false

  for (const inv of invoices) {
    const s = (inv.status || '').toLowerCase()
    if (s === 'disputed') return 'disputed'
    if (s === 'overdue') hasOverdue = true
    else if (s === 'partial') hasPartial = true
    else if (s === 'unpaid' || s === 'active') hasActive = true
  }

  if (hasOverdue) return 'overdue'
  if (hasPartial) return 'partial_payment'
  if (hasActive) return 'active'
  return 'recovered'
}

function computeAttentionScore(params) {
  let score = 0
  if (params.overdueDays > 30) score += 50
  else if (params.overdueDays > 14) score += 30
  else if (params.overdueDays > 7) score += 15
  if (params.totalOverdue > 50000) score += 10
  if (params.totalOverdue > 10000) score += 5
  return Math.max(0, score)
}

// ============================================================
// Fetch invoices with pagination
// ============================================================

async function fetchInvoices(offset = 0) {
  let filter = `status=neq.paid,and(status.neq.cancelled,and(status.neq.reconciled))`
  let url = `${API}/invoices?select=id,tenant_id,customer_id,status,total,due_date,payment_status&offset=${offset}&limit=${BATCH}&order=tenant_id.asc,customer_id.asc`

  if (SINGLE_TENANT) {
    url += `&tenant_id=eq.${SINGLE_TENANT}`
  }

  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) {
    throw new Error(`Failed to fetch invoices: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

// ============================================================
// Fetch existing recovery cases for merging
// ============================================================

async function fetchExistingCases(tenantId, customerIds) {
  if (customerIds.length === 0) return {}
  const ids = customerIds.map(c => `"${c}"`).join(',')
  const url = `${API}/recovery_cases?select=id,tenant_id,customer_id,invoice_count,created_at&tenant_id=eq.${tenantId}&customer_id=in.(${ids})`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return {}
  const rows = await res.json()
  const map = {}
  for (const r of rows) map[r.customer_id] = r
  return map
}

// ============================================================
// Upsert recovery case
// ============================================================

async function upsertCase(row) {
  const url = `${API}/recovery_cases`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Prefer': 'resolution=merge-duplicates-duplicates',
    },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    console.error(`  Failed to upsert case for customer ${row.customer_id}: ${res.status}`)
  }
}

async function insertEvent(event) {
  const url = `${API}/recovery_case_events`
  await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(event),
  }).catch(() => {})
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`\nRecoveryCase Backfill`)
  console.log(`  Supabase: ${SUPABASE_URL}`)
  console.log(`  Batch size: ${BATCH}`)
  if (SINGLE_TENANT) console.log(`  Tenant filter: ${SINGLE_TENANT}`)
  console.log('')

  let offset = 0
  let totalProcessed = 0
  let totalCases = 0
  let startTime = Date.now()

  while (true) {
    const invoices = await fetchInvoices(offset)
    if (invoices.length === 0) break

    // Group by (tenant_id, customer_id)
    const groups = {}
    for (const inv of invoices) {
      const key = `${inv.tenant_id}:${inv.customer_id}`
      if (!groups[key]) {
        groups[key] = { tenantId: inv.tenant_id, customerId: inv.customer_id, invoices: [] }
      }
      groups[key].invoices.push(inv)
    }

    const groupList = Object.values(groups)
    console.log(`  Batch offset=${offset}: ${invoices.length} invoices, ${groupList.length} groups`)

    // Fetch existing cases for these tenant+customer combinations to merge
    const tenantGroups = {}
    for (const g of groupList) {
      if (!tenantGroups[g.tenantId]) tenantGroups[g.tenantId] = []
      tenantGroups[g.tenantId].push(g.customerId)
    }

    const existingMap = {}
    for (const [tenantId, customerIds] of Object.entries(tenantGroups)) {
      const map = await fetchExistingCases(tenantId, customerIds)
      Object.assign(existingMap, map)
    }

    // Process each group
    for (const group of groupList) {
      const { tenantId, customerId, invoices } = group
      const now = new Date().toISOString()

      // Compute aggregates
      const totalOutstanding = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0)
      const openCount = invoices.filter(i => (i.status || '').toLowerCase() !== 'paid').length
      const overdueCount = invoices.filter(i => {
        const s = (i.status || '').toLowerCase()
        return s === 'overdue' || (s === 'unpaid' && i.due_date && new Date(i.due_date) < new Date())
      }).length
      const disputedCount = invoices.filter(i => (i.status || '').toLowerCase() === 'disputed').length
      const totalOverdue = invoices
        .filter(i => (i.status || '').toLowerCase() === 'overdue')
        .reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0)

      const state = deriveState(invoices)
      const engagement = 'unseen'
      const nextAction = state === 'overdue' || state === 'partial_payment' ? 'send_reminder' : 'wait'

      // Attention score
      const oldestOverdue = invoices
        .filter(i => i.due_date && new Date(i.due_date) < new Date())
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0]
      const overdueDays = oldestOverdue
        ? Math.floor((Date.now() - new Date(oldestOverdue.due_date).getTime()) / 86400000)
        : 0
      const attentionScore = computeAttentionScore({ overdueDays, totalOverdue })

      // Existing case (for idempotency / version)
      const existing = existingMap[customerId]
      const caseId = existing?.id || crypto.randomUUID()

      // Upsert
      await upsertCase({
        id: caseId,
        tenant_id: tenantId,
        customer_id: customerId,
        recovery_state_v2: state,
        engagement_state_v2: engagement,
        next_action_type: nextAction,
        attention_score: attentionScore,
        version: 1,
        invoice_count: invoices.length,
        open_invoice_count: openCount,
        overdue_invoice_count: overdueCount,
        disputed_invoice_count: disputedCount,
        promised_invoice_count: 0,
        total_outstanding: totalOutstanding,
        total_overdue: totalOverdue,
        last_activity_at: now,
        updated_at: now,
      })

      // Insert backfill event
      await insertEvent({
        case_id: caseId,
        event_type: 'backfill',
        to_recovery_state: state,
        to_engagement_state: engagement,
        reason: `Backfill: ${invoices.length} invoice(s), ₹${totalOutstanding} outstanding, state=${state}`,
        trigger: { invoiceCount: invoices.length, totalOutstanding, batchOffset: offset },
      })

      totalCases++
    }

    totalProcessed += invoices.length
    offset += BATCH

    // Progress
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`  Progress: ${totalProcessed} invoices, ${totalCases} cases (${elapsed}s)`)
  }

  console.log(`\nDone: ${totalCases} recovery cases backfilled from ${totalProcessed} invoices`)
}

main().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
