import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { buildComparison } from "@/modules/cv/build";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Row-by-row Before / After view of the CV (spec §18). */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const resumeId = searchParams.get("resumeId");
    const jobId = searchParams.get("jobId");
    if (!resumeId) return fail("Missing resumeId", 400);

    const result = await buildComparison(userId, resumeId, jobId);
    return ok(result);
  } catch (err) {
    if (err instanceof Error && /not been analysed|not found/i.test(err.message)) {
      return fail(err.message, 422);
    }
    return toErrorResponse(err);
  }
}
