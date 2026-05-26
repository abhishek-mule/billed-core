"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const outbox_1 = require("./queues/outbox");
const reminders_1 = require("./queues/reminders");
const reconciliation_1 = require("./queues/reconciliation");
const supabase_admin_1 = require("./src/lib/billzo/supabase-admin");
const baileys_socket_1 = require("./lib/baileys-socket");
const notifications_1 = require("./src/lib/billzo/notifications");
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
    // Start Baileys sockets for tenants with Baileys WhatsApp provider
    supabase_admin_1.supabaseAdmin.from('tenants').select('id, whatsapp_config').then(({ data: tenants }) => {
        if (tenants) {
            for (const t of tenants) {
                const cfg = (t.whatsapp_config || {});
                if (cfg.whatsappProvider === 'baileys') {
                    console.log(`[Worker] Starting Baileys socket for tenant ${t.id}`);
                    (0, baileys_socket_1.startBaileysSocket)(t.id).catch((err) => console.error(`[Worker] Failed to start Baileys for ${t.id}:`, err));
                }
            }
        }
    });
    // Scan for overdue invoices every 5 minutes and enqueue reminder jobs
    const enqueueOverdue = async () => {
        try {
            const count = await (0, reminders_1.enqueueOverdueReminders)();
            if (count > 0)
                console.log(`[Worker] Enqueued ${count} overdue reminder jobs`);
        }
        catch (err) {
            console.error('[Worker] Failed to enqueue overdue reminders:', err);
        }
    };
    enqueueOverdue();
    const overdueInterval = setInterval(enqueueOverdue, 5 * 60 * 1000);
    // Compute merchant reputation daily
    const computeReputation = async () => {
        try {
            const { data: tenants } = await supabase_admin_1.supabaseAdmin.from('tenants').select('id').limit(500);
            if (!tenants)
                return;
            for (const t of tenants) {
                try {
                    const { data: events } = await supabase_admin_1.supabaseAdmin
                        .from('whatsapp_events')
                        .select('status')
                        .eq('tenant_id', t.id)
                        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
                    if (!events || events.length === 0)
                        continue;
                    const total = events.length;
                    const delivered = events.filter((e) => e.status === 'delivered' || e.status === 'read').length;
                    const failed = events.filter((e) => e.status === 'failed').length;
                    const replied = events.filter((e) => e.status === 'read' || e.status === 'clicked_upi').length;
                    const replyRate = total > 0 ? replied / total : 0;
                    const failureRate = total > 0 ? failed / total : 0;
                    const deliveryRate = total > 0 ? delivered / total : 0;
                    const volumeScore = Math.min(total / 500, 1);
                    const reputation = replyRate * 0.30 +
                        deliveryRate * 0.25 +
                        (1 - failureRate) * 0.25 +
                        (1 - volumeScore) * 0.20;
                    await supabase_admin_1.supabaseAdmin
                        .from('tenants')
                        .update({ whatsapp_reputation: Math.round(reputation * 100) / 100 })
                        .eq('id', t.id);
                    if (reputation < 0.1) {
                        console.log(`[Worker] Reputation critical for tenant ${t.id}, pausing sends`);
                        await (0, notifications_1.sendPushNotification)({
                            tenantId: t.id,
                            title: 'WhatsApp Reputation Critical',
                            body: 'Your WhatsApp sending has been paused due to delivery quality issues. Contact support.',
                            type: 'reputation_alert',
                            url: '/settings/whatsapp',
                        }).catch(() => { });
                    }
                }
                catch (err) {
                    console.error(`[Worker] Reputation computation failed for tenant ${t.id}:`, err);
                }
            }
            console.log('[Worker] Reputation computation completed');
        }
        catch (err) {
            console.error('[Worker] Reputation computation error:', err);
        }
    };
    computeReputation();
    const reputationInterval = setInterval(computeReputation, 60 * 60 * 1000);
    const shutdown = async () => {
        console.log('[Worker] Shutting down...');
        clearInterval(overdueInterval);
        clearInterval(reputationInterval);
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