import { generateOTP } from '@/lib/auth/otp'

export async function POST(req: Request) {
  const { phone } = await req.json()
  
  if (!phone) {
    return Response.json({ error: 'Phone required' }, { status: 400 })
  }
  
  await generateOTP(phone)
  return Response.json({ success: true })
}
