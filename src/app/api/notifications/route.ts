import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  try {
    const userId = await requireUserId();
    const items = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok(items);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const body = z.object({ id: z.string().optional(), all: z.boolean().optional() }).parse(await req.json());
    if (body.all) {
      await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    } else if (body.id) {
      await prisma.notification.updateMany({ where: { id: body.id, userId }, data: { read: true } });
    }
    return ok({ updated: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
