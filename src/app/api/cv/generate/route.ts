import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { saveFile } from "@/lib/storage";
import { loadCvContext, matchResumeToJob } from "@/modules/cv/service";
import { buildOptimisedCv } from "@/modules/cv/build";
import { generateCvPdf } from "@/modules/cv/pdf";
import { TEMPLATE_IDS, type TemplateId } from "@/modules/cv/templates";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  resumeId: z.string(),
  jobId: z.string().optional(),
  label: z.string().max(160).optional(),
  template: z.enum(TEMPLATE_IDS).default("ats-simple"),
  /** true = stream a PDF for preview without saving a version */
  previewOnly: z.boolean().default(false),
});

/**
 * Render the optimised CV from APPROVED recommendations and either stream it as
 * a preview or persist it as a new version. The original upload is never
 * modified (spec §19, §20, §28).
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { resumeId, jobId, label, template, previewOnly } = schema.parse(await req.json());

    const { resume, parsed } = await loadCvContext(userId, resumeId);
    const { content } = await buildOptimisedCv(userId, resumeId, jobId ?? null);

    const bytes = await generateCvPdf(content, template as TemplateId);

    if (previewOnly) {
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="cv-preview.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }

    const accepted = await prisma.cvRecommendation.count({
      where: {
        resumeId,
        ...(jobId ? { jobId } : {}),
        status: { in: ["ACCEPTED", "MODIFIED"] },
        recommendationType: { not: "NOT_ALLOWED" },
      },
    });

    // Before / after scores so the improvement is visible and honest (§19, §32).
    let matchBefore: number | null = null;
    let matchAfter: number | null = null;
    if (jobId) {
      try {
        matchBefore = (await matchResumeToJob(userId, resumeId, jobId)).overall;

        const optimisedText = [
          content.summary ?? "",
          ...content.experiences.flatMap((e) => [e.position, e.company, ...e.bullets]),
          ...Object.values(content.skills).flat(),
          ...content.projects.flatMap((p) => [p.name, p.description ?? "", ...p.technologies]),
        ].join("\n");

        const { evidence, verified } = await loadCvContext(userId, resumeId);
        const job = await prisma.job.findFirst({
          where: { id: jobId, userId },
          include: { jobSkills: { include: { skill: true } } },
        });
        if (job) {
          const { matchCvToJob } = await import("@/modules/cv/matcher");
          const { computeYearsFromCv } = await import("@/modules/cv/parser");
          matchAfter = matchCvToJob(parsed, optimisedText, evidence, verified, {
            title: job.title,
            requiredSkills: job.jobSkills.map((s) => s.skill.name),
            preferredSkills: job.preferredSkills,
            description: job.description,
            experienceYears: job.experienceYears,
            educationRequirement: job.educationRequirement,
            industry: job.industry,
            location: job.location,
            workplaceType: job.workplaceType,
          }, computeYearsFromCv(parsed)).overall;
        }
      } catch { /* scoring is best-effort, never blocks the export */ }
    }

    const stored = await saveFile(userId, `cv-optimized-${Date.now()}.pdf`, Buffer.from(bytes));

    const job = jobId
      ? await prisma.job.findFirst({ where: { id: jobId, userId }, include: { company: true } })
      : null;

    const version = await prisma.cvVersion.create({
      data: {
        userId,
        parentResumeId: resumeId,
        label: label || (job ? `${resume.name} — ${job.title}` : `${resume.name} — optimised`),
        targetJobId: jobId ?? null,
        targetCompany: job?.company?.name ?? null,
        content: content as unknown as object,
        template,
        filePath: stored.relativePath,
        matchBefore,
        matchAfter,
        changeCount: accepted,
      },
    });

    return ok({
      versionId: version.id,
      label: version.label,
      template,
      matchBefore,
      matchAfter,
      changesApplied: accepted,
    });
  } catch (err) {
    if (err instanceof Error && /not been analysed|not found/i.test(err.message)) {
      return fail(err.message, 422);
    }
    return toErrorResponse(err);
  }
}

/** List saved CV versions (spec §19). */
export async function GET() {
  try {
    const userId = await requireUserId();
    const versions = await prisma.cvVersion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { parent: { select: { name: true } } },
    });
    return ok(versions);
  } catch (err) {
    return toErrorResponse(err);
  }
}
