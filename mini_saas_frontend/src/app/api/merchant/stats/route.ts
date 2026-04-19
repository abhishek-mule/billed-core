import { NextResponse } from 'next/server'

export async function GET() {
  const today = new Date().toISOString().split('T')[0]
  
  const stats = {
    todaySales: 15680,
    todayInvoices: 12,
    pendingPayments: 3,
    lowStockCount: 5,
    customers: 89
  }

  return NextResponse.json(stats)
}