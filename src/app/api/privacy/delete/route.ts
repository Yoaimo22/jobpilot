import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { deleteUserDir } from "@/lib/storage";

/**
 * §28 Privacy → Delete My Data. Removes all user-owned records (cascades)
 * and their private files, but keeps the account so they can start over.
 * Pass { deleteAccount: true } to remove the account entirely.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const deleteAccount = body?.deleteAccount === true;

    await deleteUserDir(userId);

    // Delete user-owned data (relations cascade from these).
    await prisma.$transaction([
      prisma.application.deleteMany({ where: { userId } }),
      prisma.job.deleteMany({ where: { userId } }),
      prisma.company.deleteMany({ where: { userId } }),
      prisma.resume.deleteMany({ where: { userId } }),
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.followUpReminder.deleteMany({ where: { userId } }),
      prisma.applicationError.deleteMany({ where: { userId } }),
      prisma.automationLog.deleteMany({ where: { userId } }),
      prisma.userSkill.deleteMany({ where: { userId } }),
      prisma.tag.deleteMany({ where: { userId } }),
      prisma.screeningAnswer.deleteMany({ where: { userId } }),
    ]);

    if (deleteAccount) {
      await prisma.user.delete({ where: { id: userId } });
    }

    return ok({ deleted: true, accountRemoved: deleteAccount });
  } catch (err) {
    return toErrorResponse(err);
  }
}
