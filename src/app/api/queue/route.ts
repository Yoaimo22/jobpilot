import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { runApplicationGuard } from "@/modules/applications/guard";
import type { ApplicationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const QUEUE_STATUSES: ApplicationStatus[] = ["PREPARING", "READY_TO_APPLY", "AWAITING_REVIEW", "REQUIRES_USER_INPUT"];

/**
 * Application Queue (§35). Returns items awaiting review, each annotated with:
 * - the live guard verdict (blocks/warnings)
 * - whether the job's source permits automated submission (bulk-approve gate)
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const apps = await prisma.application.findMany({
      where: { userId, status: { in: QUEUE_STATUSES } },
      include: {
        job: { select: { id: true, title: true, originalUrl: true, source: { select: { name: true, supportsApply: true } } } },
        company: { select: { name: true } },
        resume: { select: { name: true } },
      },
      orderBy: [{ matchScore: "desc" }, { createdAt: "desc" }],
    });

    const items = await Promise.all(
      apps.map(async (a) => {
        const guard = await runApplicationGuard({ userId, jobId: a.jobId });
        return {
          id: a.id,
          status: a.status,
          matchScore: a.matchScore,
          matchedSkills: a.matchedSkills,
          missingSkills: a.missingSkills,
          jobId: a.jobId,
          jobTitle: a.job.title,
          originalUrl: a.job.originalUrl,
          sourceName: a.job.source?.name ?? "Manual",
          supportsAutoApply: a.job.source?.supportsApply ?? false,
          companyName: a.company?.name ?? "—",
          resumeName: a.resume?.name ?? null,
          allowed: guard.allowed,
          blocks: guard.checks.filter((c) => c.severity === "block" && !c.passed).map((c) => c.label),
          warnings: guard.checks.filter((c) => c.severity === "warn" && !c.passed).map((c) => c.label),
        };
      })
    );

    return ok({
      items,
      // Bulk approval is only offered when EVERY selected item's source permits
      // official submission. Otherwise each must be applied manually (§35, §31).
      bulkAllowed: items.length > 0 && items.every((i) => i.supportsAutoApply),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
