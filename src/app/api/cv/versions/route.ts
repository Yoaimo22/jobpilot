import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { deleteFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** List every generated CV version, newest first (spec §19). */
export async function GET() {
  try {
    const userId = await requireUserId();
    const versions = await prisma.cvVersion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        parent: { select: { id: true, name: true } },
      },
    });

    // Resolve target job titles in one query rather than per row.
    const jobIds = versions.map((v) => v.targetJobId).filter(Boolean) as string[];
    const jobs = jobIds.length
      ? await prisma.job.findMany({
          where: { id: { in: jobIds }, userId },
          select: { id: true, title: true },
        })
      : [];
    const jobTitle = new Map(jobs.map((j) => [j.id, j.title]));

    return ok(
      versions.map((v) => ({
        id: v.id,
        label: v.label,
        parentName: v.parent?.name ?? null,
        parentId: v.parentResumeId,
        targetJobId: v.targetJobId,
        targetJobTitle: v.targetJobId ? jobTitle.get(v.targetJobId) ?? null : null,
        targetCompany: v.targetCompany,
        template: v.template,
        matchBefore: v.matchBefore,
        matchAfter: v.matchAfter,
        changeCount: v.changeCount,
        hasFile: Boolean(v.filePath),
        createdAt: v.createdAt,
      }))
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Delete one generated version. The parent CV is never touched. */
export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return fail("Missing id", 400);

    const version = await prisma.cvVersion.findFirst({ where: { id, userId } });
    if (!version) return fail("CV version not found", 404);

    if (version.filePath) await deleteFile(version.filePath);
    await prisma.cvVersion.delete({ where: { id } });

    return ok({ deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
