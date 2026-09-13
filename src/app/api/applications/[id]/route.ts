import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { updateStatus } from "@/modules/applications/service";
import { applicationStatusEnum } from "@/lib/validators";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const app = await prisma.application.findFirst({
      where: { id, userId },
      include: {
        job: { include: { jobSkills: { include: { skill: true } }, source: true } },
        company: true,
        resume: true,
        events: { orderBy: { createdAt: "asc" } },
        notes: { orderBy: { createdAt: "desc" } },
        appTags: { include: { tag: true } },
        followUps: { orderBy: { dueDate: "asc" } },
      },
    });
    if (!app) return fail("Application not found", 404);
    return ok(app);
  } catch (err) {
    return toErrorResponse(err);
  }
}

const patchSchema = z.object({
  status: applicationStatusEnum,
  note: z.string().max(2000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const { status, note } = patchSchema.parse(await req.json());
    const updated = await updateStatus(userId, id, status, note);
    if (!updated) return fail("Application not found", 404);
    return ok(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await prisma.application.deleteMany({ where: { id, userId } });
    return ok({ deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
