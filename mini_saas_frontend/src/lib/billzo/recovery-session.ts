import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import crypto from 'crypto'

export type SessionAction = {
  action: string
  at: string
  detail?: string
}

export type RecoverySession = {
  id: string
  tenantId: string
  caseId: string
  customerId: string | null

  startingRecommendation: string | null
  recommendationAccepted: boolean | null

  startedAt: string
  endedAt: string | null
  sessionDurationSeconds: number | null

  outcome: string | null
  amountRecovered: number
  actionsTaken: SessionAction[]

  manualOverride: string | null
  notes: string | null

  completedBy: string | null
  createdAt: string
  updatedAt: string
}

function rowToSession(row: any): RecoverySession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    caseId: row.case_id,
    customerId: row.customer_id,
    startingRecommendation: row.starting_recommendation,
    recommendationAccepted: row.recommendation_accepted,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    sessionDurationSeconds: row.session_duration_seconds,
    outcome: row.outcome,
    amountRecovered: Number(row.amount_recovered || 0),
    actionsTaken: (row.actions_taken || []) as SessionAction[],
    manualOverride: row.manual_override,
    notes: row.notes,
    completedBy: row.completed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Start a new recovery session when a merchant opens a case.
 * If there's an active unclosed session for this merchant+case, return it.
 */
export async function startSession(params: {
  tenantId: string
  caseId: string
  customerId?: string
  startingRecommendation?: string
  userId?: string
}): Promise<RecoverySession> {
  const { tenantId, caseId, customerId, startingRecommendation, userId } = params

  // Check for an existing open session (same case, not ended, within last 30 min)
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data: existing } = await supabaseAdmin
    .from('recovery_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('case_id', caseId)
    .is('ended_at', null)
    .gte('started_at', thirtyMinAgo)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return rowToSession(existing)

  // Create new session
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const row = {
    id,
    tenant_id: tenantId,
    case_id: caseId,
    customer_id: customerId || null,
    starting_recommendation: startingRecommendation || null,
    started_at: now,
    actions_taken: [],
    amount_recovered: 0,
    created_at: now,
    updated_at: now,
  }

  const { error } = await supabaseAdmin.from('recovery_sessions').insert(row)
  if (error) throw error

  return rowToSession(row)
}

/**
 * Log an action taken during the session.
 */
export async function logSessionAction(params: {
  sessionId: string
  action: string
  detail?: string
}): Promise<void> {
  const { sessionId, action, detail } = params
  const now = new Date().toISOString()
  const entry: SessionAction = { action, at: now, detail }

  // Append to actions_taken array
  const { data: current } = await supabaseAdmin
    .from('recovery_sessions')
    .select('actions_taken')
    .eq('id', sessionId)
    .single()

  const actions = (current?.actions_taken || []) as SessionAction[]
  actions.push(entry)

  await supabaseAdmin
    .from('recovery_sessions')
    .update({ actions_taken: actions, updated_at: now })
    .eq('id', sessionId)
}

/**
 * End a session with outcome data.
 */
export async function endSession(params: {
  sessionId: string
  outcome: string
  amountRecovered?: number
  recommendationAccepted?: boolean
  manualOverride?: string
  notes?: string
  userId?: string
}): Promise<void> {
  const { sessionId, outcome, amountRecovered, recommendationAccepted, manualOverride, notes, userId } = params
  const now = new Date().toISOString()

  // Get session start to compute duration
  const { data: session } = await supabaseAdmin
    .from('recovery_sessions')
    .select('started_at')
    .eq('id', sessionId)
    .single()

  const startedAt = new Date(session?.started_at || now).getTime()
  const endedAt = now
  const durationSeconds = Math.round((new Date(endedAt).getTime() - startedAt) / 1000)

  const updates: Record<string, any> = {
    ended_at: endedAt,
    session_duration_seconds: durationSeconds,
    outcome,
    amount_recovered: amountRecovered || 0,
    updated_at: now,
  }

  if (recommendationAccepted !== undefined) updates.recommendation_accepted = recommendationAccepted
  if (manualOverride !== undefined) updates.manual_override = manualOverride
  if (notes !== undefined) updates.notes = notes
  if (userId !== undefined) updates.completed_by = userId

  await supabaseAdmin.from('recovery_sessions').update(updates).eq('id', sessionId)
}

/**
 * Get sessions for a tenant or case.
 */
export async function getSessions(params: {
  tenantId: string
  caseId?: string
  limit?: number
}): Promise<RecoverySession[]> {
  const { tenantId, caseId, limit = 20 } = params
  let query = supabaseAdmin
    .from('recovery_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (caseId) query = query.eq('case_id', caseId)

  const { data } = await query
  return (data || []).map(rowToSession)
}

/**
 * Get session summary stats for a tenant (today).
 */
export async function getTodaySessionStats(tenantId: string) {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { data } = await supabaseAdmin
    .from('recovery_sessions')
    .select('outcome, amount_recovered, session_duration_seconds, started_at')
    .eq('tenant_id', tenantId)
    .gte('started_at', startOfDay.toISOString())

  const sessions = data || []
  const total = sessions.length
  const successful = sessions.filter(s => s.outcome === 'recovered' || s.outcome === 'promised')
  const recovered = sessions.reduce((s, r) => s + Number(r.amount_recovered || 0), 0)
  const durations = sessions.filter(s => s.session_duration_seconds)
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((s, d) => s + (d.session_duration_seconds || 0), 0) / durations.length)
    : 0

  return {
    totalSessions: total,
    successfulSessions: successful.length,
    totalRecovered: recovered,
    averageDurationSeconds: avgDuration,
    successRate: total > 0 ? Math.round((successful.length / total) * 100) : 0,
  }
}
