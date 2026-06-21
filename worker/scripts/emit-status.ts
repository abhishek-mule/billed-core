// Helper: emit simulated WhatsApp status delivery + read events
import { emitWhatsAppStatusUpdated } from '../src/lib/billzo/events'

const [tenantId, invoiceId, stageIndex] = process.argv.slice(2)
if (!tenantId || !invoiceId) {
  console.error('Usage: npx ts-node scripts/emit-status.ts <tenantId> <invoiceId> [stageIndex]')
  process.exit(1)
}

async function main() {
  const idx = stageIndex || '0'
  await emitWhatsAppStatusUpdated({
    billzoMessageId: `bmsg_test_${idx}`,
    invoiceId,
    tenantId,
    status: 'delivered',
    provider: 'baileys',
    providerMessageId: `prov_test_${idx}`,
    timestamp: new Date().toISOString(),
  })
  await emitWhatsAppStatusUpdated({
    billzoMessageId: `bmsg_test_${idx}`,
    invoiceId,
    tenantId,
    status: 'read',
    provider: 'baileys',
    providerMessageId: `prov_test_${idx}`,
    timestamp: new Date().toISOString(),
  })
  console.log(JSON.stringify({ status: 'ok', emitted: ['delivered', 'read'] }))
}

main().catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1) })
