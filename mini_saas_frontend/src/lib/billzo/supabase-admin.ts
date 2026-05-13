import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  ''

export const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

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
