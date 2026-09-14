/**
 * CV analysis orchestration (spec §13, §22, §24, §26, §33).
 * Ties parser → evidence → matcher → recommender together and persists results.
 */
import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";
import { extractPdfText } from "@/lib/pdf-text";
import { parseCvText, computeYearsFromCv, parsedCvSchema, type ParsedCv } from "./parser";
import { buildEvidence, categorizeSkills, ownedSkills, type Evidence } from "./skill-graph";
import { matchCvToJob, gapAnalysis, DEFAULT_WEIGHTS, type CvMatchResult, type JobForMatch } from "./matcher";
import { buildOptions, augmentWithAI, diagnose, buildSummaryOptions, type RecommendationMode } from "./recommender";

/** Read the stored PDF and produce + persist the structured parse. */
export async function parseResume(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw new Error("CV not found");

  let text = "";
  try {
    const buf = await readFile(resume.filePath);
    text = (await extractPdfText(buf)).text;
  } catch (e) {
    // extractPdfText already produces a user-facing message.
    throw e instanceof Error ? e : new Error("Could not read the PDF.");
  }

  const cv = parseCvText(text);
  const evidence = buildEvidence(cv, text);

  await prisma.$transaction([
    prisma.cvEvidence.deleteMany({ where: { resumeId } }),
    prisma.resume.update({
      where: { id: resumeId },
      data: {
        rawText: text.slice(0, 100_000),
        parsedData: cv as unknown as object,
        parsedAt: new Date(),
        // keep the simple lists in sync for the rest of the app
        extractedSkills: ownedSkills(evidence).slice(0, 60),
        extractedLanguages: cv.programmingLanguages,
        extractedFrameworks: cv.frameworks,
        extractedTools: [...cv.devopsTools, ...cv.pmTools],
        extractedCertifications: cv.certifications,
      },
    }),
    prisma.cvEvidence.createMany({
      data: evidence.map((e) => ({
        resumeId,
        skill: e.skill,
        kind: e.kind as never,
        quote: e.quote.slice(0, 1000),
        section: e.section ?? null,
        confidence: e.confidence,
      })),
    }),
  ]);

  const sectionScores = scoreSections(cv, evidence);
  for (const s of sectionScores) {
    await prisma.cvAnalysis.upsert({
      where: { resumeId_section: { resumeId, section: s.section } },
      create: { resumeId, ...s },
      update: s,
    });
  }

  return {
    parsed: cv,
    evidence,
    sectionScores,
    counts: {
      technicalSkills: ownedSkills(evidence).length,
      experiences: cv.experiences.length,
      projects: cv.projects.length,
      educations: cv.educations.length,
      certifications: cv.certifications.length,
    },
  };
}

/** Load the persisted analysis context for a CV. */
export async function loadCvContext(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId },
    include: { evidence: true },
  });
  if (!resume) throw new Error("CV not found");
  if (!resume.parsedData || !resume.rawText) {
    throw new Error("This CV has not been analysed yet. Run the analysis first.");
  }

  const parsed = parsedCvSchema.parse(resume.parsedData);
  const evidence: Evidence[] = resume.evidence.map((e) => ({
    skill: e.skill,
    kind: e.kind as Evidence["kind"],
    quote: e.quote,
    section: e.section ?? undefined,
    confidence: e.confidence,
  }));

  const verifiedRows = await prisma.userVerifiedSkill.findMany({ where: { userId } });
  const verified = new Map<string, "YES" | "NO" | "NOT_SURE">(
    verifiedRows.map((v) => [v.skill.toLowerCase(), v.confirmation as "YES" | "NO" | "NOT_SURE"])
  );

  return { resume, parsed, evidence, verified, rawText: resume.rawText };
}

/** Score a job against a CV and cache the result. */
export async function matchResumeToJob(userId: string, resumeId: string, jobId: string): Promise<CvMatchResult> {
  const { parsed, evidence, verified, rawText } = await loadCvContext(userId, resumeId);
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: { jobSkills: { include: { skill: true } } },
  });
  if (!job) throw new Error("Job not found");

  const jobForMatch: JobForMatch = {
    title: job.title,
    requiredSkills: job.jobSkills.map((s) => s.skill.name),
    preferredSkills: job.preferredSkills,
    description: job.description,
    experienceYears: job.experienceYears,
    educationRequirement: job.educationRequirement,
    industry: job.industry,
    location: job.location,
    workplaceType: job.workplaceType,
  };

  const result = matchCvToJob(
    parsed, rawText, evidence, verified, jobForMatch,
    computeYearsFromCv(parsed), DEFAULT_WEIGHTS
  );

  await prisma.cvJobMatch.upsert({
    where: { resumeId_jobId: { resumeId, jobId } },
    create: {
      resumeId, jobId,
      overall: result.overall,
      qualificationScore: result.qualificationScore,
      presentationScore: result.presentationScore,
      breakdown: result.breakdown as unknown as object,
      matchedExact: result.matchedExact,
      matchedRelated: result.matchedRelated,
      matchedPartial: result.matchedPartial,
      missing: result.missing,
      atsScore: result.ats.score,
      atsDetected: result.ats.detected,
      atsMissing: [...result.ats.missingButProven, ...result.ats.missingActual],
    },
    update: {
      overall: result.overall,
      qualificationScore: result.qualificationScore,
      presentationScore: result.presentationScore,
      breakdown: result.breakdown as unknown as object,
      matchedExact: result.matchedExact,
      matchedRelated: result.matchedRelated,
      matchedPartial: result.matchedPartial,
      missing: result.missing,
      atsScore: result.ats.score,
      atsDetected: result.ats.detected,
      atsMissing: [...result.ats.missingButProven, ...result.ats.missingActual],
      computedAt: new Date(),
    },
  });

  return result;
}

/** Rank every job in the database against one CV (spec §4, §24). */
export async function rankJobsForResume(userId: string, resumeId: string, limit = 25) {
  const { parsed, evidence, verified, rawText } = await loadCvContext(userId, resumeId);
  const jobs = await prisma.job.findMany({
    where: { userId },
    include: { jobSkills: { include: { skill: true } }, company: { select: { id: true, name: true } } },
    take: 200,
  });

  const years = computeYearsFromCv(parsed);
  const rows = jobs.map((job) => {
    const r = matchCvToJob(parsed, rawText, evidence, verified, {
      title: job.title,
      requiredSkills: job.jobSkills.map((s) => s.skill.name),
      preferredSkills: job.preferredSkills,
      description: job.description,
      experienceYears: job.experienceYears,
      educationRequirement: job.educationRequirement,
      industry: job.industry,
      location: job.location,
      workplaceType: job.workplaceType,
    }, years);

    return {
      jobId: job.id,
      title: job.title,
      companyId: job.company?.id ?? null,
      company: job.company?.name ?? "Unknown",
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      currency: job.currency,
      source: job.sourceId,
      datePosted: job.datePosted,
      originalUrl: job.originalUrl,
      overall: r.overall,
      qualificationScore: r.qualificationScore,
      presentationScore: r.presentationScore,
      matchedExact: r.matchedExact,
      matchedRelated: r.matchedRelated,
      missing: r.missing,
      explanation: r.explanation,
    };
  });

  rows.sort((a, b) => b.overall - a.overall);
  return rows.slice(0, limit);
}

/** Compare several CVs against the same job (spec §26). */
export async function compareResumes(userId: string, jobId: string) {
  const resumes = await prisma.resume.findMany({ where: { userId, parsedAt: { not: null } } });
  const rows: { resumeId: string; name: string; overall: number; qualification: number; presentation: number }[] = [];

  for (const r of resumes) {
    try {
      const m = await matchResumeToJob(userId, r.id, jobId);
      rows.push({
        resumeId: r.id, name: r.name,
        overall: m.overall, qualification: m.qualificationScore, presentation: m.presentationScore,
      });
    } catch { /* skip un-analysable CV */ }
  }

  rows.sort((a, b) => b.overall - a.overall);
  const best = rows[0];
  return {
    rows,
    recommendation: best
      ? `Use "${best.name}" for this application — it scores ${best.overall}% overall (${best.qualification}% qualification, ${best.presentation}% presentation), the highest of your ${rows.length} analysed CV(s).`
      : "No analysed CV available. Analyse a CV first.",
  };
}

/**
 * Generate recommendations for a CV against a job, persist them as PENDING.
 * Nothing is applied — the user approves each one (spec §28).
 */
export async function generateRecommendations(
  userId: string,
  resumeId: string,
  jobId: string,
  mode: RecommendationMode = "BALANCED"
) {
  const { parsed, evidence, verified, rawText } = await loadCvContext(userId, resumeId);
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: { jobSkills: { include: { skill: true } } },
  });
  if (!job) throw new Error("Job not found");

  const jobSkills = [...job.jobSkills.map((s) => s.skill.name), ...job.preferredSkills];
  const ctx = { rawText, evidence, verified, jobSkills, mode };

  // Clear previous PENDING suggestions for this pair; keep decided ones.
  await prisma.cvRecommendation.deleteMany({ where: { resumeId, jobId, status: "PENDING" } });

  const created: unknown[] = [];

  // 1. Professional summary
  const summaryOptions = buildSummaryOptions(parsed, ownedSkills(evidence), job.title);
  if (summaryOptions.length) {
    const original = parsed.professionalSummary ?? "";
    const options = summaryOptions
      .map((text, i) => ({ label: ["ATS Optimized", "Professional", "Concise"][i] ?? "Alternative", text }))
      .map((o) => {
        const opts = buildOptions(original || o.text, { ...ctx, mode });
        return { ...o, verdict: opts[0]?.type ?? "SAFE_REWRITE", reason: opts[0]?.reason ?? "Rewritten from your own CV data." };
      });

    const row = await prisma.cvRecommendation.create({
      data: {
        resumeId, jobId, section: "summary",
        originalText: original || "(no professional summary in your CV)",
        recommendedText: options[0].text,
        options: options as unknown as object,
        recommendationType: "SAFE_REWRITE",
        reason: original
          ? "Your summary can state your specialisation and key technologies more directly."
          : "Your CV has no professional summary. This one is built only from skills your CV already proves.",
        evidence: ownedSkills(evidence).slice(0, 6),
        relatedSkills: ownedSkills(evidence).slice(0, 6),
        confidence: 0.9,
        estimatedImpact: 5,
      },
    });
    created.push(row);
  }

  // 2. Experience bullets
  for (const [ei, exp] of parsed.experiences.entries()) {
    const bullets = [...exp.responsibilities, ...exp.achievements].slice(0, 6);
    for (const bullet of bullets) {
      let options = buildOptions(bullet, ctx);
      options = await augmentWithAI(bullet, options, ctx);
      if (!options.length) continue;

      const best = options[0];
      const row = await prisma.cvRecommendation.create({
        data: {
          resumeId, jobId,
          section: `experience.${ei}`,
          originalText: bullet,
          recommendedText: best.text,
          options: options as unknown as object,
          recommendationType: best.type as never,
          reason: `${diagnose(bullet, jobSkills, rawText).join(" ")} ${best.reason}`.trim(),
          evidence: best.evidence,
          relatedSkills: best.relatedSkills,
          unsupportedSkills: best.unsupportedSkills,
          confidence: best.confidence,
          estimatedImpact: best.estimatedImpact,
        },
      });
      created.push(row);
    }
  }

  return { count: created.length, mode };
}

/** Per-section quality scores + problems (spec §13, §33). */
export function scoreSections(cv: ParsedCv, evidence: Evidence[]) {
  const out: { section: string; score: number; problems: string[]; suggestions: string[]; readability?: number }[] = [];

  // Summary
  const summary = cv.professionalSummary ?? "";
  const sProblems: string[] = [];
  let sScore = 100;
  if (!summary) { sProblems.push("No professional summary found."); sScore = 30; }
  else {
    const words = summary.split(/\s+/).length;
    if (words < 15) { sProblems.push("Too short to convey specialisation."); sScore -= 20; }
    if (words > 90) { sProblems.push("Too long — recruiters skim this section."); sScore -= 10; }
    const named = ownedSkills(evidence).filter((s) => summary.toLowerCase().includes(s.toLowerCase())).length;
    if (named === 0) { sProblems.push("Does not name any of your key technologies."); sScore -= 25; }
    if (/\b(hard.?working|team player|passionate|motivated)\b/i.test(summary)) {
      sProblems.push("Contains generic filler phrases instead of concrete specialisation."); sScore -= 15;
    }
  }
  out.push({ section: "summary", score: clamp(sScore), problems: sProblems, suggestions: sProblems.length ? ["Rewrite the summary to name your main specialisation and top technologies."] : [] });

  // Experience
  const allBullets = cv.experiences.flatMap((e) => [...e.responsibilities, ...e.achievements]);
  const eProblems: string[] = [];
  let eScore = 100;
  if (!cv.experiences.length) { eProblems.push("No work experience section detected."); eScore = 25; }
  else {
    const short = allBullets.filter((b) => b.split(/\s+/).length < 8).length;
    if (short) { eProblems.push(`${short} bullet point(s) are too short.`); eScore -= Math.min(short * 6, 25); }
    const weak = allBullets.filter((b) => /^(responsible for|worked on|helped|made|created|did|handled)/i.test(b.trim())).length;
    if (weak) { eProblems.push(`${weak} bullet point(s) start with a weak phrase instead of an action verb.`); eScore -= Math.min(weak * 6, 25); }
    if (!allBullets.length) { eProblems.push("Experience entries have no bullet points describing what you did."); eScore -= 30; }
    const withMetrics = allBullets.filter((b) => /\d+\s*%|\bby \d+/.test(b)).length;
    if (allBullets.length && withMetrics === 0) {
      eProblems.push("No measurable outcomes stated. Add real numbers only if you have them.");
      eScore -= 10;
    }
  }
  out.push({ section: "experience", score: clamp(eScore), problems: eProblems, suggestions: [], readability: readability(allBullets) });

  // Skills
  const kProblems: string[] = [];
  let kScore = 100;
  const owned = ownedSkills(evidence);
  if (owned.length < 5) { kProblems.push("Few technical skills detected — the skills section may be missing or unclear."); kScore -= 30; }
  const cats = Object.keys(categorizeSkills(owned)).length;
  if (cats < 3 && owned.length > 6) { kProblems.push("Skills are not grouped into categories, which hurts readability."); kScore -= 15; }
  const relatedOnly = evidence.filter((e) => e.kind === "RELATED_COMPETENCY").length;
  if (relatedOnly > 4) { kProblems.push(`${relatedOnly} competencies are implied by your experience but never stated explicitly.`); kScore -= 15; }
  out.push({ section: "skills", score: clamp(kScore), problems: kProblems, suggestions: [] });

  // Projects
  const pProblems: string[] = [];
  let pScore = 100;
  if (!cv.projects.length) { pProblems.push("No projects section found. Projects help when experience is limited."); pScore = 55; }
  else if (cv.projects.some((p) => !p.technologies.length)) {
    pProblems.push("Some projects do not state the technologies used."); pScore -= 20;
  }
  out.push({ section: "projects", score: clamp(pScore), problems: pProblems, suggestions: [] });

  const overall = Math.round(out.reduce((s, o) => s + o.score, 0) / out.length);
  out.push({ section: "overall", score: overall, problems: [], suggestions: [], readability: readability(allBullets) });

  return out;
}

/** Recruiter readability heuristic (spec §33). */
function readability(bullets: string[]): number {
  if (!bullets.length) return 40;
  let score = 100;
  const avgWords = bullets.reduce((s, b) => s + b.split(/\s+/).length, 0) / bullets.length;
  if (avgWords < 8) score -= 20;
  if (avgWords > 32) score -= 20;
  const withVerb = bullets.filter((b) =>
    /^(developed|built|designed|implemented|maintained|integrated|configured|optimi[sz]ed|migrated|automated|led|delivered|created)/i.test(b.trim())
  ).length;
  score -= Math.round((1 - withVerb / bullets.length) * 30);
  const firstWords = bullets.map((b) => b.trim().split(/\s+/)[0]?.toLowerCase());
  const dupes = firstWords.length - new Set(firstWords).size;
  score -= Math.min(dupes * 4, 20);
  return clamp(score);
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export { gapAnalysis };
