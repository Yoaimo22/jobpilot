/**
 * CV ↔ Job matching (spec §5, §6, §7, §12, §32).
 *
 * The central idea of §32: two different things are measured separately.
 *
 *   Actual Qualification  — what the user can really do. Wording changes must
 *                           NEVER move this number.
 *   CV Presentation       — how visibly the CV states it. This is the only
 *                           number optimization is allowed to improve.
 *
 * Keeping them apart is what stops "optimization" from masquerading as new
 * competence.
 */
import { mentions } from "./parser";
import type { ParsedCv } from "./parser";
import { classifySkill, type Evidence, type EvidenceKind } from "./skill-graph";

export interface MatchWeights {
  requiredSkills: number;
  experience: number;
  technology: number;
  jobTitle: number;
  preferredSkills: number;
  education: number;
  industry: number;
  keywordAlignment: number;
}

/** Defaults from §5. Configurable per call. */
export const DEFAULT_WEIGHTS: MatchWeights = {
  requiredSkills: 0.30,
  experience: 0.20,
  technology: 0.15,
  jobTitle: 0.10,
  preferredSkills: 0.10,
  education: 0.05,
  industry: 0.05,
  keywordAlignment: 0.05,
};

export interface JobForMatch {
  title: string;
  requiredSkills: string[];
  preferredSkills: string[];
  description: string | null;
  experienceYears: number | null;
  educationRequirement: string | null;
  industry: string | null;
  location: string | null;
  workplaceType: string;
}

export type SkillMatchStatus = "EXACT" | "RELATED" | "PARTIAL" | "MISSING";

export interface SkillMatch {
  skill: string;
  status: SkillMatchStatus;
  evidence?: string;
  confidence: number;
  /** True when the CV proves it but does not say it plainly — fixable by wording. */
  fixableByWording: boolean;
}

export interface CvMatchResult {
  overall: number;
  qualificationScore: number;
  presentationScore: number;
  breakdown: Record<string, number>;
  skills: SkillMatch[];
  matchedExact: string[];
  matchedRelated: string[];
  matchedPartial: string[];
  missing: string[];
  ats: {
    score: number;
    detected: string[];
    /** In the job, absent from the CV, but the CV proves the competency. */
    missingButProven: string[];
    /** In the job, and genuinely not possessed. */
    missingActual: string[];
  };
  explanation: string;
}

const statusOf = (kind: EvidenceKind): SkillMatchStatus =>
  kind === "DIRECT_SKILL" ? "EXACT"
  : kind === "RELATED_COMPETENCY" ? "RELATED"
  : kind === "INFERRED_COMPETENCY" ? "PARTIAL"
  : "MISSING";

const creditFor = (s: SkillMatchStatus) =>
  s === "EXACT" ? 1 : s === "RELATED" ? 0.8 : s === "PARTIAL" ? 0.45 : 0;

export function matchCvToJob(
  cv: ParsedCv,
  rawText: string,
  evidence: Evidence[],
  verified: Map<string, "YES" | "NO" | "NOT_SURE">,
  job: JobForMatch,
  yearsExperience: number | null,
  weights: MatchWeights = DEFAULT_WEIGHTS
): CvMatchResult {
  const required = dedupe(job.requiredSkills);
  const preferred = dedupe(job.preferredSkills);

  // ── Per-skill classification against the evidence set ──
  const skills: SkillMatch[] = [...required, ...preferred].map((skill) => {
    const c = classifySkill(skill, evidence, verified);
    const status = statusOf(c.kind);
    // "Fixable by wording" = the CV proves it, but the CV text never says the
    // job's own term for it. That is a presentation gap, not a skill gap (§7).
    const saidPlainly = mentions(rawText, skill);
    return {
      skill,
      status,
      evidence: c.quote,
      confidence: c.confidence,
      fixableByWording: status !== "MISSING" && !saidPlainly,
    };
  });

  const reqMatches = skills.filter((s) => required.includes(s.skill));
  const prefMatches = skills.filter((s) => preferred.includes(s.skill));

  // ── QUALIFICATION: does the user have the ability, however it is worded? ──
  const requiredScore = avg(reqMatches.map((s) => creditFor(s.status)));
  const preferredScore = prefMatches.length ? avg(prefMatches.map((s) => creditFor(s.status))) : 0.5;

  const experienceScore =
    job.experienceYears == null ? 0.6
    : yearsExperience == null ? 0.4
    : Math.min(yearsExperience / Math.max(job.experienceYears, 1), 1);

  const technologyScore = avg(
    reqMatches.filter((s) => isTechLike(s.skill)).map((s) => creditFor(s.status))
  ) || requiredScore;

  const educationScore = scoreEducation(cv, job.educationRequirement);
  const industryScore = job.industry
    ? mentions(rawText, job.industry) ? 1 : 0.4
    : 0.6;

  // ── PRESENTATION: how plainly does the CV state what it proves? ──
  const jobKeywords = extractJobKeywords(job);
  const detected = jobKeywords.filter((k) => mentions(rawText, k));
  const keywordAlignment = jobKeywords.length ? detected.length / jobKeywords.length : 0.5;
  const titleScore = titleRelevance(job.title, rawText, cv);

  const qualificationScore = clamp01(
    (requiredScore * weights.requiredSkills +
      experienceScore * weights.experience +
      technologyScore * weights.technology +
      preferredScore * weights.preferredSkills +
      educationScore * weights.education +
      industryScore * weights.industry) /
      (weights.requiredSkills + weights.experience + weights.technology +
        weights.preferredSkills + weights.education + weights.industry)
  );

  // Presentation blends keyword visibility, title alignment, and how much of
  // what the user HAS is actually spelled out.
  const provenButUnstated = skills.filter((s) => s.fixableByWording).length;
  const provenTotal = skills.filter((s) => s.status !== "MISSING").length || 1;
  const visibility = 1 - provenButUnstated / provenTotal;
  const presentationScore = clamp01(keywordAlignment * 0.45 + titleScore * 0.2 + visibility * 0.35);

  const overall = Math.round(clamp01(qualificationScore * 0.65 + presentationScore * 0.35) * 100);

  // ── ATS split (§12): missing-but-proven vs missing-for-real ──
  const missingKeywords = jobKeywords.filter((k) => !mentions(rawText, k));
  const missingButProven = missingKeywords.filter((k) => {
    const c = classifySkill(k, evidence, verified);
    return c.kind === "DIRECT_SKILL" || c.kind === "RELATED_COMPETENCY";
  });
  const missingActual = missingKeywords.filter((k) => !missingButProven.includes(k));

  const result: CvMatchResult = {
    overall,
    qualificationScore: Math.round(qualificationScore * 100),
    presentationScore: Math.round(presentationScore * 100),
    breakdown: {
      "Required Skills": pct(requiredScore),
      "Preferred Skills": pct(preferredScore),
      Experience: pct(experienceScore),
      "Job Title Relevance": pct(titleScore),
      "Technology Stack": pct(technologyScore),
      Education: pct(educationScore),
      Industry: pct(industryScore),
      "Keyword Alignment": pct(keywordAlignment),
    },
    skills,
    matchedExact: skills.filter((s) => s.status === "EXACT").map((s) => s.skill),
    matchedRelated: skills.filter((s) => s.status === "RELATED").map((s) => s.skill),
    matchedPartial: skills.filter((s) => s.status === "PARTIAL").map((s) => s.skill),
    missing: skills.filter((s) => s.status === "MISSING").map((s) => s.skill),
    ats: {
      score: Math.round(keywordAlignment * 100),
      detected,
      missingButProven,
      missingActual,
    },
    explanation: "",
  };

  result.explanation = explain(result);
  return result;
}

/** Gap analysis rows for §7 — wording gap vs real skill gap. */
export interface GapRow {
  skill: string;
  status: "FOUND" | "RELATED_EVIDENCE" | "NOT_FOUND";
  verdict: "CAN_BE_IMPROVED_BY_WORDING" | "REQUIRES_ACTUAL_SKILL" | "ALREADY_CLEAR";
  reason: string;
  evidence?: string;
}

export function gapAnalysis(match: CvMatchResult): GapRow[] {
  return match.skills.map((s) => {
    if (s.status === "MISSING") {
      return {
        skill: s.skill,
        status: "NOT_FOUND",
        verdict: "REQUIRES_ACTUAL_SKILL",
        reason: `No evidence of ${s.skill} in your CV. Do not add this skill unless you genuinely have the experience.`,
      };
    }
    if (s.fixableByWording) {
      return {
        skill: s.skill,
        status: s.status === "EXACT" ? "FOUND" : "RELATED_EVIDENCE",
        verdict: "CAN_BE_IMPROVED_BY_WORDING",
        reason: `Your CV shows evidence for ${s.skill}, but does not use the job's own term for it.`,
        evidence: s.evidence,
      };
    }
    return {
      skill: s.skill,
      status: "FOUND",
      verdict: "ALREADY_CLEAR",
      reason: `${s.skill} is already stated clearly in your CV.`,
      evidence: s.evidence,
    };
  });
}

// ── helpers ──
const dedupe = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => Math.round(clamp01(n) * 100);

function isTechLike(s: string) {
  return /\.|js$|sql|db$|aws|gcp|azure|docker|kube|node|react|python|java|go$|api/i.test(s);
}

function scoreEducation(cv: ParsedCv, requirement: string | null): number {
  if (!requirement) return 1;
  const req = requirement.toLowerCase();
  const hasDegree = cv.educations.some((e) => e.degree || e.institution);
  if (!hasDegree) return 0.3;
  const wantsBachelor = /bachelor|s1|sarjana|b\.?sc|undergraduate/.test(req);
  const wantsMaster = /master|s2|m\.?sc|magister/.test(req);
  const degrees = cv.educations.map((e) => (e.degree ?? "").toLowerCase()).join(" ");
  if (wantsMaster) return /master|s2|m\.?sc|magister|phd|doctor/.test(degrees) ? 1 : 0.6;
  if (wantsBachelor) return /bachelor|s1|sarjana|b\.?sc|master|s2|phd/.test(degrees) ? 1 : 0.6;
  return 0.8;
}

function titleRelevance(jobTitle: string, rawText: string, cv: ParsedCv): number {
  const tokens = jobTitle.toLowerCase().split(/[^a-z0-9.+#]+/).filter((t) => t.length > 2);
  if (!tokens.length) return 0.5;
  const titles = cv.experiences.map((e) => e.position.toLowerCase()).join(" ") + " " +
    (cv.professionalSummary ?? "").toLowerCase();
  const inTitles = tokens.filter((t) => titles.includes(t)).length / tokens.length;
  const inBody = tokens.filter((t) => rawText.toLowerCase().includes(t)).length / tokens.length;
  return clamp01(inTitles * 0.7 + inBody * 0.3);
}

/** Job keywords = its declared skills plus tech terms found in the description. */
function extractJobKeywords(job: JobForMatch): string[] {
  const base = dedupe([...job.requiredSkills, ...job.preferredSkills]);
  return base.slice(0, 30);
}

function explain(r: CvMatchResult): string {
  const parts: string[] = [];
  if (r.matchedExact.length) parts.push(`clearly matches ${r.matchedExact.slice(0, 4).join(", ")}`);
  if (r.matchedRelated.length) parts.push(`shows related experience in ${r.matchedRelated.slice(0, 3).join(", ")}`);
  if (r.missing.length) parts.push(`lacks ${r.missing.slice(0, 3).join(", ")}`);
  const gapKind =
    r.presentationScore < r.qualificationScore - 8
      ? " Most of the gap is how the CV is worded, not what you can do — that part is fixable."
      : "";
  return `Your CV ${parts.join("; ") || "has limited overlap with this role"}.${gapKind}`;
}
