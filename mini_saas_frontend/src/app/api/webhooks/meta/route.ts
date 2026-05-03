import { db } from '@/lib/db'
import { invoices } from '@/lib/schema'
import { eq, ne, and, sql } from 'drizzle-orm'

const STATUS_MAP: Record<string, string> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
}

const ORDER = ['sent', 'delivered', 'read']

async function handleStatusUpdate(messageId: string, state: string) {
  const mapped = STATUS_MAP[state]
  if (!mapped) return
  
  // Guard against regression
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.metaMessageId, messageId)
  })
  
  if (!invoice || invoice.waStatus === 'read') return
  
  // Prevent state regression: 'read' > 'delivered' > 'sent'
  if (ORDER.indexOf(mapped) < ORDER.indexOf(invoice.waStatus || '')) return

  await db.update(invoices)
    .set({ waStatus: mapped })
    .where(eq(invoices.metaMessageId, messageId))
}

export async function POST(req: Request) {
  const body = await req.json()
  const statuses = body.entry?.[0]?.changes?.[0]?.value?.statuses
  
  if (statuses) {
    for (const status of statuses) {
      await handleStatusUpdate(status.id, status.status)
    }
  }
  return Response.json({ ok: true })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge)
  }
  return new Response('Forbidden', { status: 403 })
}
