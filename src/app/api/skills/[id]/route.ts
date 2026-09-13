import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await prisma.userSkill.deleteMany({ where: { id, userId } });
    return ok({ deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
