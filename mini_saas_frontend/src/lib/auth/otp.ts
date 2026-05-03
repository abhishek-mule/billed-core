import { createRedisClient } from '../redis-factory'

const redis = createRedisClient()
const OTP_EXPIRY = 300 // 5 minutes

export async function generateOTP(phone: string) {
  const normalizedPhone = phone.replace(/\D/g, '')
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  
  await redis.set(
    `otp:${normalizedPhone}`,
    otp,
    { ex: OTP_EXPIRY }
  )
  
  // Dev only logging
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV OTP] ${normalizedPhone}: ${otp}`)
  }
  
  return true
}

export async function verifyOTP(phone: string, input: string) {
  const normalizedPhone = phone.replace(/\D/g, '')
  const stored = await redis.get<string>(`otp:${normalizedPhone}`)
  
  if (!stored) return false
  if (stored !== input) return false
  
  await redis.del(`otp:${normalizedPhone}`)
  return true
}
