// authority:exempt notification_routing — device token management
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[supabase-admin] SUPABASE_URL or SERVICE_ROLE_KEY not set — supabase client unavailable')
    throw new Error('Supabase client not configured')
  }

  _supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
    realtime: { transport: WebSocket as never },
  })
  return _supabaseAdmin
}

// Lazy Proxy — all existing import { supabaseAdmin } sites work without changes.
// The client is not created until the first property access (e.g. .from()).
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getSupabaseAdmin()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export async function saveDeviceToken(tenantId: string, fcmToken: string, deviceType: string) {
  const client = getSupabaseAdmin()
  const { data, error } = await client
    .from('device_tokens')
    .upsert({ 
      tenant_id: tenantId, 
      fcm_token: fcmToken, 
      device_type: deviceType,
      updated_at: new Date().toISOString() 
    }, { onConflict: 'fcm_token' })
  
  if (error) {
    console.error('Supabase save error:', error)
    throw error
  }
  return data
}

export async function getDeviceTokens(tenantId: string) {
  const client = getSupabaseAdmin()
  const { data, error } = await client
    .from('device_tokens')
    .select('fcm_token')
    .eq('tenant_id', tenantId)
  
  if (error) {
    console.error('Supabase fetch error:', error)
    return []
  }
  return data.map(d => d.fcm_token)
}

export async function deleteDeviceTokens(tokens: string[]) {
  if (tokens.length === 0) return

  const client = getSupabaseAdmin()
  const { error } = await client
    .from('device_tokens')
    .delete()
    .in('fcm_token', tokens)

  if (error) {
    console.error('Supabase token cleanup error:', error)
  }
}
