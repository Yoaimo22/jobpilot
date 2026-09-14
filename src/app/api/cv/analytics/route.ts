import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { getCvAnalytics, recomputeAllMatches } from "@/modules/cv/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CV performance analytics, aggregated from stored rows only. */
export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await getCvAnalytics(userId));
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Recompute CV × job matches so the analytics have data to aggregate.
 * Bounded to the top jobs to keep the request within its time budget.
 */
export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await recomputeAllMatches(userId, 25);
    return ok(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
