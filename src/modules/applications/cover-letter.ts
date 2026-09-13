/**
 * Cover letter generation (§7) and Smart CV selection (§6).
 *
 * Cover letters NEVER fabricate skills or experience — the template only uses
 * skills the user actually has AND the job requires (the intersection). If an
 * LLM endpoint is configured it refines the wording, but the factual content
 * is still derived from the user's real profile.
 */

export interface CoverLetterInput {
  fullName: string;
  companyName: string;
  jobTitle: string;
  jobDescription?: string | null;
  userSkills: string[];
  requiredSkills: string[];
  professionalSummary?: string | null;
  portfolioUrl?: string | null;
  yearsExperience: number;
}

const norm = (s: string) => s.trim().toLowerCase();

export function buildCoverLetter(input: CoverLetterInput): string {
  const skillSet = new Set(input.userSkills.map(norm));
  // Only mention skills the user genuinely has that are relevant to the job.
  const relevant = input.requiredSkills.filter((s) => skillSet.has(norm(s)));
  const highlight = relevant.length ? relevant.slice(0, 5) : input.userSkills.slice(0, 5);

  const opener = `Dear ${input.companyName} Hiring Team,`;
  const intro = `I am writing to express my interest in the ${input.jobTitle} role at ${input.companyName}.`;

  const summaryLine = input.professionalSummary
    ? ` ${input.professionalSummary.split(".")[0].trim()}.`
    : ` I bring ${input.yearsExperience} year(s) of hands-on experience.`;

  const skillsLine = highlight.length
    ? ` My relevant strengths include ${listPhrase(highlight)}, which align with what this role requires.`
    : "";

  const portfolioLine = input.portfolioUrl
    ? ` You can review examples of my work at ${input.portfolioUrl}.`
    : "";

  const closing = `I would welcome the opportunity to discuss how I can contribute to your team. Thank you for your consideration.\n\nSincerely,\n${input.fullName}`;

  return `${opener}\n\n${intro}${summaryLine}${skillsLine}${portfolioLine}\n\n${closing}`;
}

function listPhrase(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// ─────────────────────────────────────────────────────────────
// Smart CV selection (§6)
// ─────────────────────────────────────────────────────────────

export interface ResumeCandidate {
  id: string;
  name: string;
  extractedSkills: string[];
  isDefault: boolean;
}

export interface CvRecommendation {
  resumeId: string | null;
  name: string | null;
  confidence: number; // 0..100
  reason: string;
}

/**
 * Pick the CV whose extracted skills best cover the job's required skills.
 * Falls back to name-token overlap with the job title, then the default CV.
 */
export function recommendResume(
  resumes: ResumeCandidate[],
  job: { title: string; requiredSkills: string[] }
): CvRecommendation {
  if (!resumes.length) {
    return { resumeId: null, name: null, confidence: 0, reason: "No CV uploaded yet." };
  }

  const required = job.requiredSkills.map(norm).filter(Boolean);
  const titleTokens = norm(job.title).split(/[^a-z0-9]+/).filter(Boolean);

  let best: { cand: ResumeCandidate; score: number; matched: number } | null = null;

  for (const cand of resumes) {
    const cvSkills = new Set(cand.extractedSkills.map(norm));
    const matched = required.filter((s) => cvSkills.has(s)).length;
    const skillScore = required.length ? matched / required.length : 0;

    const nameTokens = new Set(norm(cand.name).split(/[^a-z0-9]+/).filter(Boolean));
    const nameOverlap = titleTokens.filter((t) => nameTokens.has(t)).length;
    const nameScore = titleTokens.length ? nameOverlap / titleTokens.length : 0;

    const score = skillScore * 0.7 + nameScore * 0.3;
    if (!best || score > best.score) best = { cand, score, matched };
  }

  if (!best || best.score === 0) {
    const def = resumes.find((r) => r.isDefault) ?? resumes[0];
    return {
      resumeId: def.id,
      name: def.name,
      confidence: 40,
      reason: "No strong skill/title match — using your default CV.",
    };
  }

  return {
    resumeId: best.cand.id,
    name: best.cand.name,
    confidence: Math.round(Math.min(best.score, 1) * 100),
    reason: `Best skill & title alignment (${best.matched} required skills covered).`,
  };
}
