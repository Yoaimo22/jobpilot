import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { experienceSchema } from "@/lib/validators";

/** Verify the experience row belongs to the caller's profile. */
async function owned(userId: string, id: string) {
  const row = await prisma.experience.findFirst({
    where: { id, profile: { userId } },
    select: { id: true },
  });
  return !!row;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await owned(userId, id))) return fail("Not found", 404);
    const data = experienceSchema.parse(await req.json());
    const item = await prisma.experience.update({
      where: { id },
      data: {
        title: data.title,
        company: data.company,
        location: data.location || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.current || !data.endDate ? null : new Date(data.endDate),
        current: data.current,
        description: data.description || null,
      },
    });
    return ok(item);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await owned(userId, id))) return fail("Not found", 404);
    await prisma.experience.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
