import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'

async function handleSession(request: Request) {
  const session = await getSessionFromRequest(request)

  if (!session) {
    return NextResponse.json({ success: false, error: 'No session' }, { status: 401 })
  }

  return NextResponse.json({
    session: {
      tenantId: session.tenantId,
      companyName: session.companyName,
      role: session.role,
      plan: session.plan,
    }
  })
}

export const GET = handleSession