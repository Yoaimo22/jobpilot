import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { experienceSchema } from "@/lib/validators";
import { ensureProfileId } from "@/modules/profile/service";

export async function GET() {
  try {
    const userId = await requireUserId();
    const profileId = await ensureProfileId(userId);
    const items = await prisma.experience.findMany({
      where: { profileId },
      orderBy: [{ current: "desc" }, { startDate: "desc" }],
    });
    return ok(items);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const profileId = await ensureProfileId(userId);
    const data = experienceSchema.parse(await req.json());
    const item = await prisma.experience.create({
      data: {
        profileId,
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
