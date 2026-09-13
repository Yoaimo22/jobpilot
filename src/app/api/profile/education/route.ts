import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { educationSchema } from "@/lib/validators";
import { ensureProfileId } from "@/modules/profile/service";

export async function GET() {
  try {
    const userId = await requireUserId();
    const profileId = await ensureProfileId(userId);
    const items = await prisma.education.findMany({
      where: { profileId },
      orderBy: { startDate: "desc" },
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
    const data = educationSchema.parse(await req.json());
    const item = await prisma.education.create({
      data: {
        profileId,
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
