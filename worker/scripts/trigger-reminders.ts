// Helper: trigger overdue reminders and print result
import { enqueueOverdueReminders } from '../queues/reminders'

async function main() {
  const count = await enqueueOverdueReminders()
  console.log(JSON.stringify({ queued: count }))
}

main().catch(e => { console.error(JSON.stringify({ error: e.message })); process.exit(1) })
