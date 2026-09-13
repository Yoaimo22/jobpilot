import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { educationSchema } from "@/lib/validators";

async function owned(userId: string, id: string) {
  const row = await prisma.education.findFirst({
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
    const data = educationSchema.parse(await req.json());
    const item = await prisma.education.update({
      where: { id },
      data: {
        institution: data.institution,
        degree: data.degree || null,
        field: data.field || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
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
    await prisma.education.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
