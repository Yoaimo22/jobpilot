import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { recomputeMatch } from "@/modules/jobs/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const job = await prisma.job.findFirst({
      where: { id, userId },
      include: {
        company: true,
        source: true,
        jobSkills: { include: { skill: true } },
        applications: { select: { id: true, status: true } },
      },
    });
    if (!job) return fail("Job not found", 404);
    return ok(job);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const match = await recomputeMatch(userId, id);
    if (!match) return fail("Job not found", 404);
    return ok(match);
  } catch (err) {
    return toErrorResponse(err);
  }
}
