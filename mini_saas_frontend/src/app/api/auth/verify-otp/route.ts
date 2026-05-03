import { verifyOTP } from '@/lib/auth/otp'
import { signToken } from '@/lib/auth/jwt'
import { query, queryOne } from '@/lib/db/client'

export async function POST(req: Request) {
  const { phone, otp } = await req.json()
  
  const valid = await verifyOTP(phone, otp)
  if (!valid) {
    return Response.json({ error: 'Invalid OTP' }, { status: 401 })
  }
  
  const normalizedPhone = phone.replace(/\D/g, '')
  
  // Find user
  let user = await queryOne<{ id: string; tenant_id: string }>(
    'SELECT id, tenant_id FROM tenant_users WHERE phone = $1',
    [normalizedPhone]
  )
  
  let tenantId: string
  
  if (!user) {
    // Create tenant
    const tenantResult = await query<{ id: string }>(
      'INSERT INTO tenants (company_name, plan) VALUES ($1, $2) RETURNING id',
      ['My Shop', 'free']
    )
    tenantId = tenantResult[0].id
    
    // Create user
    const userResult = await query<{ id: string }>(
      'INSERT INTO tenant_users (phone, tenant_id, role) VALUES ($1, $2, $3) RETURNING id',
      [normalizedPhone, tenantId, 'owner']
    )
    user = { id: userResult[0].id, tenant_id: tenantId }
  } else {
    tenantId = user.tenant_id
  }
  
  const token = await signToken({
    userId: user.id,
    tenantId
  })
  
  return Response.json({
    token,
    user: {
      id: user.id,
      phone: normalizedPhone
    }
  })
}
