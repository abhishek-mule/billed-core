// authority:exempt notification_routing — device token management
import dns from 'node:dns'
dns.setDefaultResultOrder('ipv4first')
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // The admin client must use the service-role key. Falling back to the
  // publishable/anon key would perform privileged server-side writes with
  // unprivileged credentials (and silently bypass RLS expectations). Refuse
  // to construct the client unless the service-role key is present.
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[supabase-admin] SUPABASE_SERVICE_ROLE_KEY not set — refusing to create admin client (will not fall back to publishable key)')
    throw new Error('Supabase admin client not configured: SUPABASE_SERVICE_ROLE_KEY is required')
  }

  const supabaseKey = serviceRoleKey

  _supabaseAdmin = createClient(supabaseUrl, supabaseKey)
  return _supabaseAdmin
}

// Lazy Proxy — client is not created until first property access
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = getSupabaseAdmin()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export async function saveDeviceToken(tenantId: string, fcmToken: string, deviceType: string) {
  const { data, error } = await supabaseAdmin
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
  const { data, error } = await supabaseAdmin
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

  const { error } = await supabaseAdmin
    .from('device_tokens')
    .delete()
    .in('fcm_token', tokens)

  if (error) {
    console.error('Supabase token cleanup error:', error)
  }
}
