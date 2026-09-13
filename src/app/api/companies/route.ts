import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";

export async function GET() {
  try {
    const userId = await requireUserId();
    const companies = await prisma.company.findMany({
      where: { userId },
      include: {
        applications: {
          select: { id: true, status: true, createdAt: true, job: { select: { title: true } } },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { applications: true, jobs: true } },
      },
      orderBy: { name: "asc" },
    });

    const rows = companies
      .map((c) => ({
        id: c.id,
        name: c.name,
        logoUrl: c.logoUrl,
        industry: c.industry,
        applicationCount: c._count.applications,
        jobCount: c._count.jobs,
        latestPosition: c.applications[0]?.job?.title ?? null,
        latestStatus: c.applications[0]?.status ?? null,
        latestDate: c.applications[0]?.createdAt ?? null,
      }))
      .filter((c) => c.applicationCount > 0 || c.jobCount > 0)
      .sort((a, b) => b.applicationCount - a.applicationCount);

    return ok(rows);
  } catch (err) {
    return toErrorResponse(err);
  }
}
