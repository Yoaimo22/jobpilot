import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { jobSchema } from "@/lib/validators";
import { createJob } from "@/modules/jobs/service";
import { notify } from "@/modules/notifications/service";

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const minScore = searchParams.get("minScore");

    const jobs = await prisma.job.findMany({
      where: {
        userId,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { company: { name: { contains: q, mode: "insensitive" } } },
                { location: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(minScore ? { matchScore: { gte: parseInt(minScore, 10) } } : {}),
      },
      include: {
        company: { select: { name: true, logoUrl: true } },
        source: { select: { name: true } },
        applications: { select: { id: true, status: true } },
      },
      orderBy: [{ matchScore: "desc" }, { dateDiscovered: "desc" }],
      take: 100,
    });
    return ok(jobs);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const data = jobSchema.parse(await req.json());
    const { job, match } = await createJob(userId, data);

    if (match.score >= 90) {
      await notify(
        userId,
        "new_match",
        "New highly matched job",
        `${job.title} scored ${match.score}% — a strong match.`,
        `/dashboard/jobs/${job.id}`
      );
    }
    return ok({ job, match });
  } catch (err) {
    return toErrorResponse(err);
  }
}
