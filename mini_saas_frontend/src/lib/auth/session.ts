import { verifyToken } from './jwt'

export async function getSession(req: Request) {
  const auth = req.headers.get('authorization')
  if (!auth) throw new Error('Unauthorized')
  
  const token = auth.replace('Bearer ', '')
  const payload = await verifyToken(token)
  
  return {
    userId: payload.userId as string,
    tenantId: payload.tenantId as string,
  }
}
