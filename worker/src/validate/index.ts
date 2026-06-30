import { ValidationRunner, printReport } from './runner'
import { invoicePipeline } from './pipelines/invoice'
import { paymentPipeline } from './pipelines/payment'

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const workerUrl = process.env.WORKER_URL || 'http://localhost:10000'
  const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || ''

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const runner = new ValidationRunner()

  runner.register(invoicePipeline())
  runner.register(paymentPipeline())

  console.log()
  console.log('  ╔══════════════════════════════════════════╗')
  console.log('  ║     BillZo System Validation Suite      ║')
  console.log('  ╚══════════════════════════════════════════╝')
  console.log()
  console.log(`  Supabase : ${supabaseUrl}`)
  console.log(`  Worker   : ${workerUrl}`)
  console.log(`  Redis    : ${redisUrl ? 'configured' : 'not set'}`)

  const report = await runner.run({
    supabaseUrl,
    supabaseKey,
    workerUrl,
    redisUrl,
  })

  printReport(report)

  process.exit(report.summary.fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Validation crashed:', err)
  process.exit(1)
})
