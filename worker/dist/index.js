"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const outbox_1 = require("./queues/outbox");
const reminders_1 = require("./queues/reminders");
const reconciliation_1 = require("./queues/reconciliation");
function startHealthServer() {
    const port = parseInt(process.env.PORT || '10000', 10);
    const server = node_http_1.default.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
        }
        else {
            res.writeHead(200);
            res.end('BillZo Worker');
        }
    });
    server.listen(port, () => {
        console.log(`[Worker] Health server listening on port ${port}`);
    });
    return server;
}
async function main() {
    console.log('[Worker] Starting BillZo worker service...');
    if (!process.env.UPSTASH_REDIS_URL) {
        console.error('[Worker] Missing UPSTASH_REDIS_URL');
        console.error('[Worker] Format: rediss://default:TOKEN@HOST:PORT');
        process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('[Worker] Missing SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }
    console.log('[Worker] Redis:', process.env.UPSTASH_REDIS_URL?.slice(0, 20) + '...');
    console.log('[Worker] Supabase:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'not set');
    const healthServer = startHealthServer();
    const outboxWorker = (0, outbox_1.createOutboxWorker)();
    const remindersWorker = (0, reminders_1.createRemindersWorker)();
    const reconciliationWorker = (0, reconciliation_1.createReconciliationWorker)();
    console.log('[Worker] All workers started');
    const shutdown = async () => {
        console.log('[Worker] Shutting down...');
        healthServer.close();
        await Promise.all([
            outboxWorker.close(),
            remindersWorker.close(),
            reconciliationWorker.close(),
        ]);
        console.log('[Worker] All workers closed');
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.stdin.resume();
}
main().catch((err) => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map