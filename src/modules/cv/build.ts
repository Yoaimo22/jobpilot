/**
 * Builds the optimised CV content from APPROVED recommendations only.
 *
 * Extracted so the Before/After comparison, the PDF preview, and the saved
 * version all render from exactly the same logic — a diff the user approves is
 * guaranteed to be the diff that lands in the PDF (spec §18, §20, §28).
 */
import { prisma } from "@/lib/prisma";
import { loadCvContext } from "./service";
import { categorizeSkills, ownedSkills } from "./skill-graph";
import { buildRow, summarize, type ComparisonRow } from "./diff";
import type { CvContent } from "./pdf";

export interface BuiltCv {
  content: CvContent;
  /** Approved replacements keyed by the original sentence. */
  replacements: Map<string, string>;
  summaryReplaced: boolean;
}

export async function buildOptimisedCv(
  userId: string,
  resumeId: string,
  jobId?: string | null,
  /** When true, include PENDING suggestions too (for previewing everything). */
  includePending = false
): Promise<BuiltCv> {
  const { resume, parsed, evidence } = await loadCvContext(userId, resumeId);

  const recs = await prisma.cvRecommendation.findMany({
    where: {
      resumeId,
      ...(jobId ? { jobId } : {}),
      status: includePending
        ? { in: ["ACCEPTED", "MODIFIED", "PENDING"] }
        : { in: ["ACCEPTED", "MODIFIED"] },
      // A blocked suggestion can never contribute, in any mode.
      recommendationType: { not: "NOT_ALLOWED" },
    },
  });

  const replacements = new Map<string, string>();
  let newSummary: string | null = null;
  for (const rec of recs) {
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

  return { content, replacements, summaryReplaced: newSummary != null };
}

/** Row-by-row Before/After comparison for the review screen (spec §18). */
export async function buildComparison(userId: string, resumeId: string, jobId?: string | null) {
  const { parsed } = await loadCvContext(userId, resumeId);

  const recs = await prisma.cvRecommendation.findMany({
    where: { resumeId, ...(jobId ? { jobId } : {}) },
    orderBy: [{ section: "asc" }, { createdAt: "asc" }],
  });

  const rows: ComparisonRow[] = [];

  // Summary row
  const summaryRec = recs.find((r) => r.section === "summary");
  if (summaryRec) {
    const approved = summaryRec.status === "ACCEPTED" || summaryRec.status === "MODIFIED";
    rows.push(
      buildRow({
        id: summaryRec.id,
        section: "Professional Summary",
        before: parsed.professionalSummary ?? "",
        after: approved ? (summaryRec.userText ?? summaryRec.recommendedText) : (parsed.professionalSummary ?? ""),
        approved,
        recommendationType: summaryRec.recommendationType,
        evidence: summaryRec.evidence,
      })
    );
  } else if (parsed.professionalSummary) {
    rows.push(buildRow({
      id: "summary-unchanged",
      section: "Professional Summary",
      before: parsed.professionalSummary,
      after: parsed.professionalSummary,
      approved: false,
    }));
  }

  // Experience bullets — every bullet appears, changed or not, so the user sees
  // the whole document rather than only the edits.
  for (const [ei, exp] of parsed.experiences.entries()) {
    const bullets = [...exp.responsibilities, ...exp.achievements];
    for (const bullet of bullets) {
      const rec = recs.find(
        (r) => r.section === `experience.${ei}` && r.originalText.trim() === bullet.trim()
      );
      const approved = !!rec && (rec.status === "ACCEPTED" || rec.status === "MODIFIED");
      rows.push(
        buildRow({
          id: rec?.id ?? `exp-${ei}-${rows.length}`,
          section: `${exp.position} — ${exp.company}`,
          before: bullet,
          after: approved && rec ? (rec.userText ?? rec.recommendedText) : bullet,
          approved,
          recommendationType: rec?.recommendationType,
          evidence: rec?.evidence,
        })
      );
    }
  }

  return { rows, summary: summarize(rows) };
}
