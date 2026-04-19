import { NextResponse } from 'next/server'

const mockCustomers = [
  { name: 'CUST-001', customer_name: 'Rajesh Kumar', phone: '9876543210', gstin: '' },
  { name: 'CUST-002', customer_name: 'Amit Sharma', phone: '9876543211', gstin: '27ABCDE1234F1Z5' },
  { name: 'CUST-003', customer_name: 'Suresh Gupta', phone: '9876543212', gstin: '' },
  { name: 'CUST-004', customer_name: 'Pankaj Electronics', phone: '9876543213', gstin: '29PQRST5678G2Z3' },
  { name: 'CUST-005', customer_name: 'Vijay Hardware', phone: '9876543214', gstin: '' },
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  if (query.length < 3) {
    return NextResponse.json([])
  }

  const filtered = mockCustomers.filter(c => 
    c.customer_name.toLowerCase().includes(query.toLowerCase()) ||
    c.phone.includes(query)
  )

  return NextResponse.json(filtered)
}