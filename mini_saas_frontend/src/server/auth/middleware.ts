import { NextResponse } from 'next/server';

export function requireAuth(req: Request) {
  const userId = req.headers.get('x-user-id');
  const tenantId = req.headers.get('x-tenant-id');

  if (!userId || !tenantId) {
    throw new Error('Unauthorized');
  }

  return { userId, tenantId };
}
