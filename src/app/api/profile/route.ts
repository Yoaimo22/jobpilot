import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { profileSchema } from "@/lib/validators";

export async function GET() {
  try {
    const userId = await requireUserId();
    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { experiences: true, educations: true, certifications: true },
    });
    return ok(profile);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const data = profileSchema.parse(await req.json());
    const clean = {
      ...data,
      linkedinUrl: data.linkedinUrl || null,
      portfolioUrl: data.portfolioUrl || null,
      githubUrl: data.githubUrl || null,
      email: data.email || null,
    };
    const profile = await prisma.profile.upsert({
      where: { userId },
      create: { userId, ...clean },
      update: clean,
    });
    return ok(profile);
  } catch (err) {
    return toErrorResponse(err);
  }
}
