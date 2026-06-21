// authority:exempt ephemeral_operational_state — generic supabase helpers (non-governed context)
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseKey)
}

export async function supabaseTenants() {
  if (!supabase) return null
  return supabase.from('tenants')
}

export async function supabaseProducts() {
  if (!supabase) return null
  return supabase.from('products')
}

export async function supabaseUsers() {
  if (!supabase) return null
  return supabase.from('users')
}

export async function supabaseInvoices() {
  if (!supabase) return null
  return supabase.from('invoices')
}

export async function supabaseQueue() {
  if (!supabase) return null
  return supabase.from('queue')
}

export async function supabaseInsert(table: string, data: Record<string, unknown>) {
  if (!supabase) return { error: 'Supabase not configured' }
  const { error } = await supabase.from(table).insert(data)
  return { error }
}

export async function supabaseUpsert(table: string, data: Record<string, unknown>, matchKey: string) {
  if (!supabase) return { error: 'Supabase not configured' }
  const { error } = await supabase.from(table).upsert(data, { onConflict: matchKey })
  return { error }
}

export async function supabaseGet(table: string, id: string) {
  if (!supabase) return { data: null, error: 'Supabase not configured' }
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single()
  return { data, error }
}
