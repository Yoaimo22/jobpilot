import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { saveFile } from "@/lib/storage";
import { loadCvContext, matchResumeToJob } from "@/modules/cv/service";
import { categorizeSkills, ownedSkills } from "@/modules/cv/skill-graph";
import { generateCvPdf, type CvContent, type TemplateId } from "@/modules/cv/pdf";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  resumeId: z.string(),
  jobId: z.string().optional(),
  label: z.string().max(160).optional(),
  template: z.enum(["ats-simple", "modern-professional", "compact-technical", "executive-clean"]).default("ats-simple"),
  /** true = render a preview without persisting a version */
  previewOnly: z.boolean().default(false),
});

/**
 * Build the optimised CV from ACCEPTED recommendations only, then render a PDF.
 * The original file is never modified (spec §19, §20, §28).
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { resumeId, jobId, label, template, previewOnly } = schema.parse(await req.json());

    const { resume, parsed, evidence } = await loadCvContext(userId, resumeId);

    const accepted = await prisma.cvRecommendation.findMany({
      where: {
        resumeId,
        ...(jobId ? { jobId } : {}),
        status: { in: ["ACCEPTED", "MODIFIED"] },
        // Belt-and-braces: a blocked suggestion can never reach the PDF.
        recommendationType: { not: "NOT_ALLOWED" },
      },
    });

    // Map original text → approved replacement.
    const replacements = new Map<string, string>();
    let newSummary: string | null = null;
    for (const rec of accepted) {
      const text = (rec.userText ?? rec.recommendedText).trim();
      if (!text) continue;
      if (rec.section === "summary") newSummary = text;
      else replacements.set(rec.originalText.trim(), text);
    }

    const content: CvContent = {
      name: parsed.name ?? resume.name,
      contact: [parsed.email, parsed.phone, parsed.location, ...parsed.links].filter(Boolean) as string[],
      summary: newSummary ?? parsed.professionalSummary,
      experiences: parsed.experiences.map((e) => ({
        position: e.position,
        company: e.company,
        period: e.period,
        bullets: [...e.responsibilities, ...e.achievements].map((b) => replacements.get(b.trim()) ?? b),
      })),
      educations: parsed.educations.map((e) => ({
        institution: e.institution, degree: e.degree, period: e.period,
      })),
      skills: categorizeSkills(ownedSkills(evidence)),
      certifications: parsed.certifications,
      projects: parsed.projects.map((p) => ({
        name: p.name, description: p.description, technologies: p.technologies,
      })),
    };

    const bytes = await generateCvPdf(content, template as TemplateId);

    if (previewOnly) {
      return new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="cv-preview.pdf"' },
      });
    }

    // Score before / after so the user sees the real effect (spec §19, §32).
    let matchBefore: number | null = null;
    let matchAfter: number | null = null;
    if (jobId) {
      try {
        const before = await matchResumeToJob(userId, resumeId, jobId);
        matchBefore = before.overall;
        // "After" recomputes against the optimised text, so presentation gains show.
        const optimisedText = [
          content.summary ?? "",
          ...content.experiences.flatMap((e) => [e.position, e.company, ...e.bullets]),
          ...Object.values(content.skills).flat(),
        ].join("\n");
        const { evidence: ev, verified } = await loadCvContext(userId, resumeId);
        const job = await prisma.job.findFirst({
          where: { id: jobId, userId },
          include: { jobSkills: { include: { skill: true } } },
        });
        if (job) {
          const { matchCvToJob } = await import("@/modules/cv/matcher");
          const { computeYearsFromCv } = await import("@/modules/cv/parser");
          const after = matchCvToJob(parsed, optimisedText, ev, verified, {
            title: job.title,
            requiredSkills: job.jobSkills.map((s) => s.skill.name),
            preferredSkills: job.preferredSkills,
            description: job.description,
            experienceYears: job.experienceYears,
            educationRequirement: job.educationRequirement,
            industry: job.industry,
            location: job.location,
            workplaceType: job.workplaceType,
          }, computeYearsFromCv(parsed));
          matchAfter = after.overall;
        }
      } catch { /* scoring is best-effort */ }
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
        changeCount: accepted.length,
      },
    });

    return ok({
      versionId: version.id,
      label: version.label,
      matchBefore,
      matchAfter,
      changesApplied: accepted.length,
    });
  } catch (err) {
    if (err instanceof Error && /not been analysed|not found/i.test(err.message)) {
      return fail(err.message, 422);
    }
    return toErrorResponse(err);
  }
}

/** List saved CV versions. */
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
