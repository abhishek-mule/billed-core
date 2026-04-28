import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    success: true,
    queued: true,
    message: 'Manual sync trigger accepted',
  })
}
