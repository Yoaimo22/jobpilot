import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { matchResumeToJob, rankJobsForResume, compareResumes, gapAnalysis } from "@/modules/cv/service";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Rank all jobs for a CV (spec §4, §24). */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const resumeId = searchParams.get("resumeId");
    if (!resumeId) return fail("Missing resumeId", 400);
    const rows = await rankJobsForResume(userId, resumeId, 30);
    return ok(rows);
  } catch (err) {
    if (err instanceof Error && /not been analysed|not found/i.test(err.message)) {
      return fail(err.message, 422);
    }
    return toErrorResponse(err);
  }
}

const postSchema = z.object({
  resumeId: z.string().optional(),
  jobId: z.string(),
  /** compare = score every analysed CV against this job (§26) */
  compare: z.boolean().optional(),
});

/** Detailed match + gap analysis for one CV × job, or CV comparison. */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { resumeId, jobId, compare } = postSchema.parse(await req.json());

    if (compare) {
      return ok(await compareResumes(userId, jobId));
    }
    if (!resumeId) return fail("Missing resumeId", 400);

    const match = await matchResumeToJob(userId, resumeId, jobId);
    return ok({ match, gaps: gapAnalysis(match) });
  } catch (err) {
    if (err instanceof Error && /not been analysed|not found/i.test(err.message)) {
      return fail(err.message, 422);
    }
    return toErrorResponse(err);
  }
}
