import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { tenantId } = session;

  const stream = new ReadableStream({
    async start(controller) {
      let lastTimestamp = new Date().toISOString();

      const interval = setInterval(async () => {
        try {
          const newEvents = await db.execute(sql`
            SELECT id, event_name, created_at
            FROM events
            WHERE tenant_id = ${tenantId}
            AND created_at > ${lastTimestamp}
            ORDER BY created_at ASC
            LIMIT 20
          `);

          if (newEvents.rows.length > 0) {
            const rows = newEvents.rows as any[];
            lastTimestamp = rows[rows.length - 1].created_at;

            controller.enqueue(
              `data: ${JSON.stringify(rows)}\n\n`
            );
          }
        } catch (error) {
          console.error('[SSE Stream Error]', error);
        }
      }, 2000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
