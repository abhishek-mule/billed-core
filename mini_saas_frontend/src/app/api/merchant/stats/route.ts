import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getSessionFromRequest } from "@/lib/session";

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { tenantId } = session;

  try {
    const [money, counts, outstanding, failures, activity, heartbeat] =
      await Promise.all([
        // 💰 Money
        db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN event_name = 'payment.success' THEN amount_paise END), 0) AS collected,
            COALESCE(SUM(CASE WHEN event_name = 'invoice.created' THEN amount_paise END), 0) AS invoiced
          FROM events
          WHERE tenant_id = ${tenantId}
          AND created_at >= CURRENT_DATE
        `),

        // 📊 Counts
        db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE event_name = 'invoice.created') AS invoices_created,
            COUNT(*) FILTER (WHERE event_name = 'payment.success') AS payments_today
          FROM events
          WHERE tenant_id = ${tenantId}
          AND created_at >= CURRENT_DATE
        `),

        // 📉 Outstanding
        db.execute(sql`
          SELECT
            COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN total::numeric * 100 END), 0) AS outstanding,
            COALESCE(SUM(CASE 
              WHEN payment_status != 'paid' AND due_date < now() THEN total::numeric * 100
            END), 0) AS overdue,

            COUNT(*) FILTER (WHERE payment_status != 'paid') AS unpaid_count,
            COUNT(*) FILTER (
              WHERE payment_status != 'paid' AND due_date < now()
            ) AS overdue_count

          FROM invoices
          WHERE tenant_id = ${tenantId}
        `),

        // ⚠️ Failures
        db.execute(sql`
          SELECT
            COUNT(*) FILTER (WHERE event_name = 'whatsapp.failed') AS whatsapp,
            COUNT(*) FILTER (WHERE event_name = 'payment.failed') AS payments,
            COUNT(*) FILTER (WHERE event_name = 'system.failed') AS system
          FROM events
          WHERE tenant_id = ${tenantId}
          AND created_at >= now() - interval '1 hour'
        `),

        // 📜 Activity
        db.execute(sql`
          SELECT
            id,
            event_name,
            entity_id,
            amount_paise,
            metadata->>'customerName' AS customer_name,
            created_at
          FROM events
          WHERE tenant_id = ${tenantId}
          ORDER BY created_at DESC
          LIMIT 10
        `),

        // 🫀 Heartbeat
        db.execute(sql`
          SELECT MAX(created_at) AS last_event_at
          FROM events
          WHERE tenant_id = ${tenantId}
        `),
      ]);

    const m = money.rows[0];
    const c = counts.rows[0];
    const o = outstanding.rows[0];
    const f = failures.rows[0];
    const h = heartbeat.rows[0];

    const lastEventAt = h?.last_event_at ?? null;

    // 🧠 System State Logic
    function computeSystemState() {
      if (f.system > 0) return "degraded";

      if (!lastEventAt) return "warning";

      const diff = Date.now() - new Date(lastEventAt).getTime();
      if (diff > 2 * 60 * 60 * 1000) return "warning";

      if (f.whatsapp > 5) return "warning";

      return "nominal";
    }

    return NextResponse.json({
      success: true,
      window: {
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      },

      money: {
        collectedTodayPaise: Number(m.collected),
        invoicedTodayPaise: Number(m.invoiced),

        outstandingPaise: Number(o.outstanding),
        overduePaise: Number(o.overdue),

        cashCollectedPaise: Number(m.collected),
      },

      counts: {
        invoicesCreatedToday: Number(c.invoices_created),
        paymentsToday: Number(c.payments_today),

        unpaidInvoices: Number(o.unpaid_count),
        overdueInvoices: Number(o.overdue_count),
      },

      failures: {
        whatsapp: Number(f.whatsapp),
        payments: Number(f.payments),
        system: Number(f.system),
        total: Number(f.whatsapp) + Number(f.payments) + Number(f.system),
      },

      inventory: {
        lowStock: [], // ⚠️ Missing Dependency → needs product query
      },

      recentActivity: activity.rows.map((row: any) => ({
        id: row.id,
        type: row.event_name.replace(".", "_"),
        entityId: row.entity_id,
        amountPaise: row.amount_paise,
        customerName: row.customer_name,
        createdAt: row.created_at,
      })),

      lastEventAt,
      systemState: computeSystemState(),
    });
  } catch (error) {
    console.error('[Merchant Stats Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}