import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runDiscovery } from "@/modules/jobs/discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled discovery (Vercel Cron). Runs a discovery cycle for every user who
 * has auto-discovery enabled, so the system works while nobody is logged in.
 *
 * AUTHORIZATION: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. A
 * request without the matching secret is refused — this endpoint must not be
 * publicly triggerable.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET is not configured on the server." },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const rules = await prisma.automationRule.findMany({
    where: { autoDiscoverEnabled: true },
    select: { userId: true },
  });

  const results: { userId: string; imported?: number; prepared?: number; error?: string }[] = [];

  // Sequential on purpose: a shared connection pool and a bounded function
  // budget make parallel per-user runs unsafe.
  for (const r of rules) {
    try {
      const report = await runDiscovery(r.userId);
      results.push({ userId: r.userId, imported: report.imported, prepared: report.prepared });
    } catch (e) {
      results.push({ userId: r.userId, error: e instanceof Error ? e.message.slice(0, 200) : "failed" });
    }
  }

  return NextResponse.json({ success: true, data: { users: results.length, results } });
}
