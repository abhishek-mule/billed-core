import { db } from "@/lib/db";
import { failedJobs } from "@/lib/schema";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

export const dynamic = 'force-dynamic';

export async function GET() {
  const failures = await db.query.failedJobs.findMany({
    orderBy: [desc(failedJobs.failedAt)],
    limit: 10
  });

  return NextResponse.json({
    failedJobsCount: failures.length,
    recentFailures: failures.map(f => ({
      id: f.id,
      queue: f.queue,
      errorMessage: f.errorMessage,
      failedAt: f.failedAt
    }))
  });
}
