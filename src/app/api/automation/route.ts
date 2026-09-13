import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { automationRuleSchema } from "@/lib/validators";

export async function GET() {
  try {
    const userId = await requireUserId();
    const rule = await prisma.automationRule.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return ok(rule);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const data = automationRuleSchema.parse(await req.json());
    const rule = await prisma.automationRule.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return ok(rule);
  } catch (err) {
    return toErrorResponse(err);
  }
}
