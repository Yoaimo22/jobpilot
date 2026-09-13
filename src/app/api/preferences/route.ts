import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { jobPreferenceSchema } from "@/lib/validators";

export async function GET() {
  try {
    const userId = await requireUserId();
    const pref = await prisma.jobPreference.findUnique({ where: { userId } });
    return ok(pref);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const data = jobPreferenceSchema.parse(await req.json());
    const pref = await prisma.jobPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return ok(pref);
  } catch (err) {
    return toErrorResponse(err);
  }
}
