/**
 * JobMatchingService — computes a transparent 0-100 match score between a
 * user's profile/preferences and a job, with a per-dimension breakdown so the
 * UI can explain WHY a job scored what it did (spec §4).
 *
 * All inputs come from the database. Nothing is fabricated.
 */

export interface MatchProfile {
  skills: { name: string; level: string; years: number | null }[];
  totalExperienceYears: number;
  preferredTitles: string[];
  targetLocations: string[];
  workplaceTypes: string[]; // REMOTE / HYBRID / ONSITE
  expectedSalaryMin: number | null;
  targetIndustries: string[];
  seniority: string[];
}

export interface MatchJob {
  title: string;
  requiredSkills: string[];
  preferredSkills: string[];
  experienceYears: number | null;
  location: string | null;
  workplaceType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  industry: string | null;
  seniority: string | null;
}

export interface MatchDimension {
  key: string;
  label: string;
  weight: number;
  score: number; // 0..1
  detail: string;
}

export interface MatchResult {
  score: number; // 0..100
  matchedSkills: string[];
  missingSkills: string[];
  dimensions: MatchDimension[];
  summary: string;
}

const norm = (s: string) => s.trim().toLowerCase();

// Weights sum to 1.0. Skill match dominates, as in the spec's example.
const WEIGHTS = {
  skills: 0.32,
  experience: 0.15,
  title: 0.15,
  location: 0.08,
  remote: 0.07,
  salary: 0.08,
  industry: 0.05,
  preferred: 0.05,
  seniority: 0.05,
};

export function computeMatch(profile: MatchProfile, job: MatchJob): MatchResult {
  const profileSkillSet = new Set(profile.skills.map((s) => norm(s.name)));
  const required = job.requiredSkills.map(norm).filter(Boolean);
  const preferred = job.preferredSkills.map(norm).filter(Boolean);

  const matchedSkills = job.requiredSkills.filter((s) =>
    profileSkillSet.has(norm(s))
  );
  const missingSkills = job.requiredSkills.filter(
    (s) => !profileSkillSet.has(norm(s))
  );

  // 1. Required-skill coverage
  const skillScore = required.length
    ? matchedSkills.length / required.length
    : 0.5; // unknown requirements → neutral

  // 2. Preferred-skill bonus
  const matchedPreferred = preferred.filter((s) => profileSkillSet.has(s));
  const preferredScore = preferred.length
    ? matchedPreferred.length / preferred.length
    : 0.5;

  // 3. Experience match
  let experienceScore = 0.5;
  let expDetail = "No experience requirement listed";
  if (job.experienceYears != null) {
    const ratio = profile.totalExperienceYears / Math.max(job.experienceYears, 1);
    experienceScore = Math.min(ratio, 1);
    expDetail = `${profile.totalExperienceYears}/${job.experienceYears} years`;
  }

  // 4. Title relevance (token overlap with preferred titles)
  const titleScore = titleRelevance(job.title, profile.preferredTitles);

  // 5. Location
  const locationScore = profile.targetLocations.length
    ? profile.targetLocations.some(
        (l) => job.location && norm(job.location).includes(norm(l))
      )
      ? 1
      : 0.2
    : 0.6;

  // 6. Remote preference
  let remoteScore = 0.6;
  if (profile.workplaceTypes.length) {
    remoteScore = profile.workplaceTypes.includes(job.workplaceType) ? 1 : 0.3;
  }

  // 7. Salary
  let salaryScore = 0.6;
  let salaryDetail = "No salary data";
  if (profile.expectedSalaryMin != null && (job.salaryMax || job.salaryMin)) {
    const jobHigh = job.salaryMax ?? job.salaryMin ?? 0;
    salaryScore = jobHigh >= profile.expectedSalaryMin ? 1 : jobHigh / profile.expectedSalaryMin;
    salaryDetail = `Job up to ${jobHigh.toLocaleString()} vs expected ${profile.expectedSalaryMin.toLocaleString()}`;
  }

  // 8. Industry
  const industryScore = profile.targetIndustries.length
    ? profile.targetIndustries.some(
        (i) => job.industry && norm(job.industry).includes(norm(i))
      )
      ? 1
      : 0.3
    : 0.6;

  // 9. Seniority
  const seniorityScore = profile.seniority.length && job.seniority
    ? profile.seniority.map(norm).includes(norm(job.seniority))
      ? 1
      : 0.4
    : 0.6;

  const dimensions: MatchDimension[] = [
    {
      key: "skills",
      label: "Required skills",
      weight: WEIGHTS.skills,
      score: skillScore,
      detail: `${matchedSkills.length}/${required.length || "?"} matched`,
    },
    {
      key: "experience",
      label: "Experience",
      weight: WEIGHTS.experience,
      score: experienceScore,
      detail: expDetail,
    },
    {
      key: "title",
      label: "Title relevance",
      weight: WEIGHTS.title,
      score: titleScore,
      detail: profile.preferredTitles.length
        ? `vs "${profile.preferredTitles.join(", ")}"`
        : "No preferred titles set",
    },
    {
      key: "location",
      label: "Location",
      weight: WEIGHTS.location,
      score: locationScore,
      detail: job.location ?? "—",
    },
    {
      key: "remote",
      label: "Workplace type",
      weight: WEIGHTS.remote,
      score: remoteScore,
      detail: job.workplaceType,
    },
    {
      key: "salary",
      label: "Salary",
      weight: WEIGHTS.salary,
      score: salaryScore,
      detail: salaryDetail,
    },
    {
      key: "industry",
      label: "Industry",
      weight: WEIGHTS.industry,
      score: industryScore,
      detail: job.industry ?? "—",
    },
    {
      key: "preferred",
      label: "Preferred skills",
      weight: WEIGHTS.preferred,
      score: preferredScore,
      detail: `${matchedPreferred.length}/${preferred.length || "?"} matched`,
    },
    {
      key: "seniority",
      label: "Seniority",
      weight: WEIGHTS.seniority,
      score: seniorityScore,
      detail: job.seniority ?? "—",
    },
  ];

  const weighted = dimensions.reduce((sum, d) => sum + d.weight * d.score, 0);
  const score = Math.round(Math.max(0, Math.min(1, weighted)) * 100);

  const summary = buildSummary(score, matchedSkills, missingSkills);

  return { score, matchedSkills, missingSkills, dimensions, summary };
}

function titleRelevance(jobTitle: string, preferred: string[]): number {
  if (!preferred.length) return 0.5;
  const jobTokens = new Set(norm(jobTitle).split(/[^a-z0-9]+/).filter(Boolean));
  let best = 0;
  for (const t of preferred) {
    const tokens = norm(t).split(/[^a-z0-9]+/).filter(Boolean);
    if (!tokens.length) continue;
    const overlap = tokens.filter((tok) => jobTokens.has(tok)).length;
    best = Math.max(best, overlap / tokens.length);
  }
  return best;
}

function buildSummary(
  score: number,
  matched: string[],
  missing: string[]
): string {
  const parts: string[] = [];
  if (matched.length) parts.push(`Strong on ${matched.slice(0, 3).join(", ")}`);
  if (missing.length) parts.push(`missing ${missing.slice(0, 3).join(", ")}`);
  const band = score >= 90 ? "Excellent" : score >= 80 ? "Strong" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Weak";
  return `${band} match (${score}%). ${parts.join("; ") || "Limited data — add skills & preferences for a sharper score."}`;
}
