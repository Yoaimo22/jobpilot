import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const company = await prisma.company.findFirst({
      where: { id, userId },
      include: {
        applications: {
          include: { job: { select: { title: true, location: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!company) return fail("Company not found", 404);

    const dates = company.applications.map((a) => a.createdAt).sort((a, b) => a.getTime() - b.getTime());
    return ok({
      ...company,
      totalApplications: company.applications.length,
      firstApplicationDate: dates[0] ?? null,
      latestApplicationDate: dates[dates.length - 1] ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
