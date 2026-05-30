// ============================================================
// Backfill Recovery Cases — Neon (postgres.js)
// ============================================================
// Groups invoices by (tenant_id, customer_id), computes aggregate
// collection position, and upserts into recovery_cases with v2
// state columns. Inserts a recovery_case_event for each case.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/backfill-recovery-cases.mjs
//
// Options:
//   TENANT_ID=xxx      backfill single tenant (optional)
// ============================================================

import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL || ''
const SINGLE_TENANT = process.env.TENANT_ID || null

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const sql = postgres(DATABASE_URL, { max: 1 })

function deriveState(invoices) {
  let hasOverdue = false
  let hasPartial = false
  let hasActive = false

  for (const inv of invoices) {
    const s = (inv.status || '').toLowerCase()
    const ps = (inv.payment_status || '').toLowerCase()

    if (s === 'disputed') return 'disputed'
    if (ps === 'paid' || s === 'paid') continue

    const isOverdue =
      s === 'overdue' ||
      (inv.due_date && new Date(inv.due_date) < new Date() &&
       (s === 'finalized' || s === 'unpaid' || s === 'active'))

    if (isOverdue) hasOverdue = true
    else if (s === 'partial' || ps === 'partial') hasPartial = true
    else if (s === 'unpaid' || s === 'active' || s === 'finalized') hasActive = true
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

async function main() {
  console.log(`\nRecoveryCase Backfill (Neon)`)
  if (SINGLE_TENANT) console.log(`  Tenant filter: ${SINGLE_TENANT}`)
  console.log('')

  let tenantFilter = ''
  if (SINGLE_TENANT) tenantFilter = sql`AND tenant_id = ${SINGLE_TENANT}`

  const invoices = await sql`
    SELECT id, tenant_id, customer_id, customer_name, status, total, due_date, payment_status
    FROM invoices
    WHERE 1=1 ${sql.unsafe(tenantFilter)}
      AND (status IS DISTINCT FROM 'PAID')
      AND (payment_status IS DISTINCT FROM 'PAID')
    ORDER BY tenant_id, customer_id
  `

  console.log(`  Fetched ${invoices.length} unpaid invoices`)
  if (invoices.length === 0) {
    console.log('\nNothing to backfill.')
    await sql.end()
    return
  }

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
  console.log(`  Groups: ${groupList.length}\n`)

  let totalCases = 0
  const startTime = Date.now()

  for (const group of groupList) {
    const { tenantId, customerId, invoices } = group
    const now = new Date()

    // Compute aggregates
    const totalOutstanding = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0)
    const openCount = invoices.length
    const overdueCount = invoices.filter(i => {
      const s = (i.status || '').toLowerCase()
      const ps = (i.payment_status || '').toLowerCase()
      if (ps === 'paid' || s === 'paid') return false
      return s === 'overdue' || (i.due_date && new Date(i.due_date) < now)
    }).length
    const disputedCount = invoices.filter(i => (i.status || '').toLowerCase() === 'disputed').length
    const totalOverdue = invoices
      .filter(i => {
        const s = (i.status || '').toLowerCase()
        const ps = (i.payment_status || '').toLowerCase()
        if (ps === 'paid' || s === 'paid') return false
        return s === 'overdue' || (i.due_date && new Date(i.due_date) < now)
      })
      .reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0)

    const state = deriveState(invoices)
    const engagement = 'unseen'
    const nextAction = state === 'overdue' || state === 'partial_payment' ? 'send_reminder' : 'wait'

    // Attention score
    const oldestDue = invoices
      .filter(i => i.due_date && new Date(i.due_date) < now)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0]
    const overdueDays = oldestDue
      ? Math.floor((now.getTime() - new Date(oldestDue.due_date).getTime()) / 86400000)
      : 0
    const attentionScore = computeAttentionScore({ overdueDays, totalOverdue })

    const caseId = crypto.randomUUID()
    const nowISO = now.toISOString()
    const customerNames = [...new Set(invoices.map(i => i.customer_name).filter(Boolean))].join(', ')

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO recovery_cases (
          id, tenant_id, customer_id, status,
          recovery_state_v2, engagement_state_v2, next_action_type, attention_score,
          version, invoice_count, open_invoice_count, overdue_invoice_count,
          disputed_invoice_count, promised_invoice_count,
          total_outstanding, total_overdue,
          last_activity_at, updated_at
        ) VALUES (
          ${caseId}, ${tenantId}, ${customerId}, ${state},
          ${sql.unsafe(`'${state}'::recovery_state_v2`)},
          ${sql.unsafe(`'${engagement}'::engagement_state_v2`)},
          ${sql.unsafe(`'${nextAction}'::recovery_next_action`)},
          ${attentionScore},
          1, ${invoices.length}, ${openCount}, ${overdueCount},
          ${disputedCount}, 0,
          ${totalOutstanding}, ${totalOverdue},
          ${nowISO}, ${nowISO}
        )
        ON CONFLICT (id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          customer_id = EXCLUDED.customer_id,
          recovery_state_v2 = EXCLUDED.recovery_state_v2,
          engagement_state_v2 = EXCLUDED.engagement_state_v2,
          next_action_type = EXCLUDED.next_action_type,
          attention_score = EXCLUDED.attention_score,
          invoice_count = EXCLUDED.invoice_count,
          open_invoice_count = EXCLUDED.open_invoice_count,
          overdue_invoice_count = EXCLUDED.overdue_invoice_count,
          disputed_invoice_count = EXCLUDED.disputed_invoice_count,
          total_outstanding = EXCLUDED.total_outstanding,
          total_overdue = EXCLUDED.total_overdue,
          updated_at = EXCLUDED.updated_at
      `

      // Insert backfill event
      await tx`
        INSERT INTO recovery_case_events (
          case_id, event_type, to_recovery_state, to_engagement_state,
          reason, trigger
        ) VALUES (
          ${caseId}, 'backfill',
          ${sql.unsafe(`'${state}'::recovery_state_v2`)},
          ${sql.unsafe(`'${engagement}'::engagement_state_v2`)},
          ${`Backfill: ${invoices.length} invoice(s), ₹${totalOutstanding} outstanding, state=${state}, customers: ${customerNames}`},
          ${sql.json({ invoiceCount: invoices.length, totalOutstanding })}
        )
      `
    })

    const customerLabel = customerNames || customerId
    console.log(`  [${state.padEnd(16)}] ${tenantId.slice(0,12)}... | ${customerLabel.slice(0,24).padEnd(24)} | ₹${totalOutstanding.toString().padStart(8)} | ${invoices.length} invoice(s)`)
    totalCases++
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone: ${totalCases} recovery cases backfilled in ${elapsed}s`)
}

main()
  .catch(err => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
  .finally(() => sql.end().catch(() => {}))
