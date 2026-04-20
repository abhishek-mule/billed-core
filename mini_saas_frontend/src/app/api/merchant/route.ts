// Merchant API health check
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Merchant API is running',
    version: '1.0.0',
  })
}