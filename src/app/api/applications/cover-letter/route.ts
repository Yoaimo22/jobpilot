import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { buildCoverLetter } from "@/modules/applications/cover-letter";
import { z } from "zod";

const schema = z.object({ applicationId: z.string() });

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { applicationId } = schema.parse(await req.json());

    const app = await prisma.application.findFirst({
      where: { id: applicationId, userId },
      include: {
        job: { include: { jobSkills: { include: { skill: true } }, company: true } },
      },
    });
    if (!app) return fail("Application not found", 404);

    const [profile, userSkills] = await Promise.all([
      prisma.profile.findUnique({ where: { userId }, include: { experiences: true } }),
      prisma.userSkill.findMany({ where: { userId }, include: { skill: true } }),
    ]);

    let years = 0;
    for (const e of profile?.experiences ?? []) {
      if (e.startDate) {
        const end = e.endDate ?? new Date();
        years += Math.max(0, (end.getTime() - e.startDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
      }
    }

    const letter = buildCoverLetter({
      fullName: profile?.fullName ?? "Applicant",
      companyName: app.job.company?.name ?? "the company",
      jobTitle: app.job.title,
      jobDescription: app.job.description,
      userSkills: userSkills.map((s) => s.skill.name),
      requiredSkills: app.job.jobSkills.map((s) => s.skill.name),
      professionalSummary: profile?.professionalSummary,
      portfolioUrl: profile?.portfolioUrl,
      yearsExperience: Math.round(years),
    });

    await prisma.application.update({
      where: { id: applicationId },
      data: { coverLetter: letter },
    });

    return ok({ coverLetter: letter });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = z.object({ applicationId: z.string(), coverLetter: z.string().max(20000) }).parse(await req.json());
    const app = await prisma.application.findFirst({ where: { id: body.applicationId, userId } });
    if (!app) return fail("Application not found", 404);
    await prisma.application.update({ where: { id: body.applicationId }, data: { coverLetter: body.coverLetter } });
    return ok({ saved: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
