import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  resumeId: z.string(),
  jobId: z.string().optional(),
  /** Omit ids to apply to every eligible recommendation. */
  ids: z.array(z.string()).optional(),
  status: z.enum(["ACCEPTED", "REJECTED", "PENDING"]),
});

/**
 * Accept All / Reject All / Accept Selected / Undo (spec §18).
 *
 * NOT_ALLOWED suggestions are excluded from every bulk accept — a blanket
 * "accept all" must never sweep a fabricating suggestion into the CV.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { resumeId, jobId, ids, status } = schema.parse(await req.json());

    const owns = await prisma.resume.findFirst({ where: { id: resumeId, userId }, select: { id: true } });
    if (!owns) return fail("CV not found", 404);

    const result = await prisma.cvRecommendation.updateMany({
      where: {
        resumeId,
        ...(jobId ? { jobId } : {}),
        ...(ids?.length ? { id: { in: ids } } : {}),
        // Accepting can never touch a blocked suggestion.
        ...(status === "ACCEPTED" ? { recommendationType: { not: "NOT_ALLOWED" } } : {}),
      },
      data: { status },
    });

    const blocked =
      status === "ACCEPTED"
        ? await prisma.cvRecommendation.count({
            where: { resumeId, ...(jobId ? { jobId } : {}), recommendationType: "NOT_ALLOWED" },
          })
        : 0;

    return ok({ updated: result.count, skippedBlocked: blocked });
  } catch (err) {
    return toErrorResponse(err);
  }
}
