import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { computeConfidence } from '../src/lib/billzo/decay'

// ============================================================
// BEHAVIORAL PROFILE INSPECTOR
// ============================================================
// CLI tool for debugging a customer's behavioral profile.
//
// Usage:
//   npx ts-node scripts/inspect-behavioral-profile.ts \
//     --tenantId=<uuid> --customerId=<uuid>
// ============================================================

async function inspectProfile(tenantId: string, customerId: string): Promise<void> {
  // 1. Load metrics
  const { data: metrics } = await supabaseAdmin
    .from('customer_behavioral_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (!metrics) {
    console.log('No behavioral metrics found for this customer.')
    return
  }

  const confidence = computeConfidence(metrics.observation_count ?? 0)

  console.log('========================================')
  console.log('BEHAVIORAL PROFILE')
  console.log('========================================')
  console.log(`Tenant:           ${tenantId}`)
  console.log(`Customer:         ${customerId}`)
  console.log(`Schema Version:   ${metrics.schema_version}`)
  console.log(`Observation Count: ${metrics.observation_count}`)
  console.log(`Confidence:       ${confidence.toFixed(4)}`)
  console.log('')
  console.log('--- RATES ---')
  console.log(`Read Rate:            ${metrics.read_rate?.toFixed(4) ?? 'N/A'}`)
  console.log(`Payment Conversion:   ${metrics.payment_conversion_rate?.toFixed(4) ?? 'N/A'}`)
  console.log('')
  console.log('--- LATENCIES (hours) ---')
  console.log(`Read → Pay:            ${metrics.avg_read_to_pay_hours?.toFixed(2) ?? 'N/A'}`)
  console.log(`Reminder Response:     ${metrics.avg_reminder_response_hours?.toFixed(2) ?? 'N/A'}`)
  console.log(`Settlement:            ${metrics.avg_settlement_latency_hours?.toFixed(2) ?? 'N/A'}`)
  console.log('')
  console.log('--- INTERVENTIONS ---')
  console.log(`Total Sent:       ${metrics.total_interventions_sent ?? 0}`)
  console.log(`Total Read:       ${metrics.total_interventions_read?.toFixed(2) ?? 0}`)
  console.log(`Resolutions:      ${metrics.total_resolutions_after_intervention ?? 0}`)
  console.log(`Escalations:      ${metrics.total_escalations_received ?? 0}`)
  console.log(`Interventions/Res: ${metrics.interventions_until_resolution ?? 'N/A'}`)
  console.log('')
  console.log('--- TIMESTAMPS ---')
  console.log(`Last Read:        ${metrics.last_read_at ?? 'N/A'}`)
  console.log(`Last Resolution:  ${metrics.last_resolution_at ?? 'N/A'}`)
  console.log(`Last Escalation:  ${metrics.last_escalation_at ?? 'N/A'}`)
  console.log(`Last Event:       ${metrics.last_event_at ?? 'N/A'}`)
  console.log(`Updated:          ${metrics.updated_at}`)

  // 2. Load liquidity windows
  const { data: windows } = await supabaseAdmin
    .from('customer_liquidity_windows')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('affinity_score', { ascending: false })
    .limit(10)

  if (windows && windows.length > 0) {
    console.log('')
    console.log('--- TOP LIQUIDITY WINDOWS ---')
    console.log('Weekday | Hour | Affinity | Obs | Last Seen')

    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    for (const w of windows) {
      const dayName = DAY_NAMES[w.weekday] ?? w.weekday
      const hourStr = `${w.hour_bucket.toString().padStart(2, '0')}:00`
      console.log(
        `  ${dayName}  | ${hourStr} | ${w.affinity_score?.toFixed(2)} | ${w.observation_count} | ${w.last_seen_at ? new Date(w.last_seen_at).toLocaleDateString() : 'N/A'}`,
      )
    }
  }

  // 3. Compute archetype traits summary
  console.log('')
  console.log('--- COMPUTED TRAITS (on read) ---')
  console.log('(Archetype inference not yet integrated)')
}

// ============================================================
// CLI ENTRY POINT
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2).reduce<Record<string, string>>((acc, arg) => {
    const [key, val] = arg.replace('--', '').split('=')
    acc[key] = val
    return acc
  }, {})

  const tenantId = args.tenantId
  const customerId = args.customerId

  if (!tenantId || !customerId) {
    console.error('Usage: --tenantId=<uuid> --customerId=<uuid>')
    process.exit(1)
  }

  await inspectProfile(tenantId, customerId)
}

if (require.main === module) {
  main().catch(console.error)
}

export { inspectProfile }
