/**
 * CVTruthfulnessService (spec §10, §31, §34).
 *
 * The anti-hallucination layer. Every proposed CV change — whether written by a
 * deterministic template or returned by an LLM — is passed through here BEFORE
 * it can be shown as applicable. Prompt instructions are not trusted; claims are
 * verified against the original CV text, the evidence set, and the user's own
 * confirmations.
 *
 * A recommendation classified NOT_ALLOWED can never be applied to a CV.
 */
import { z } from "zod";
import { mentions } from "./parser";
import type { Evidence } from "./skill-graph";

export type RecommendationType =
  | "SAFE_REWRITE"
  | "RELATED_SKILL"
  | "REQUIRES_CONFIRMATION"
  | "NOT_ALLOWED";

/** Structured AI/engine output contract (spec §30). */
export const suggestionSchema = z.object({
  original_text: z.string(),
  recommended_text: z.string(),
  type: z.enum(["SAFE_REWRITE", "RELATED_SKILL", "REQUIRES_CONFIRMATION", "NOT_ALLOWED"]),
  evidence: z.array(z.string()).default([]),
  related_skills: z.array(z.string()).default([]),
  unsupported_skills: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export interface VerdictInput {
  originalText: string;
  recommendedText: string;
  /** Full raw CV text — the corpus of truth. */
  rawText: string;
  evidence: Evidence[];
  verified: Map<string, "YES" | "NO" | "NOT_SURE">;
}

export interface Verdict {
  type: RecommendationType;
  reason: string;
  /** Claims introduced by the rewrite that the CV does not support. */
  unsupported: string[];
  /** Claims introduced that ARE supported, with the quote proving each. */
  supported: { skill: string; quote: string }[];
  /** Skills that need the user to confirm before use. */
  needsConfirmation: string[];
  confidence: number;
}

/**
 * Vocabulary of claims we police. A rewrite introducing any of these terms must
 * justify it from evidence.
 */
const CLAIMABLE_TERMS = [
  // technologies
  "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "PHP", "Ruby", "Kotlin", "Swift", "C#", "C++",
  "React", "Next.js", "Vue", "Angular", "Svelte", "Node.js", "Express", "Express.js", "NestJS",
  "Django", "Flask", "FastAPI", "Spring", "Spring Boot", "Laravel", "Rails",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "DynamoDB", "Cassandra", "Oracle",
  "AWS", "GCP", "Google Cloud", "Azure", "Vercel", "Heroku",
  "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "GitHub Actions", "Nginx", "Linux",
  "Kafka", "RabbitMQ", "GraphQL", "gRPC", "REST API", "RESTful",
  "Jest", "Cypress", "Playwright", "Selenium", "JUnit", "PyTest",
  // competencies
  "Microservices", "Microservices Architecture", "Backend Development", "Frontend Development",
  "Full Stack Development", "API Development", "REST API Development", "Team Leadership",
  "Mentoring", "CI/CD", "Containerization", "Container Orchestration", "Infrastructure as Code",
  "Cloud Computing", "Performance Optimization", "Automated Testing", "Agile Methodology",
  "Machine Learning", "Data Engineering", "DevOps",
];

/** Fabrication patterns that are never acceptable regardless of evidence. */
const FABRICATION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(\d+(?:\.\d+)?)\s*%/g, label: "a percentage metric" },
  { pattern: /\b(?:increased|reduced|improved|decreased|boosted|cut|saved)\s+[^.]{0,40}?\bby\s+\d+/gi, label: "a quantified impact claim" },
  { pattern: /\b\d+\+?\s*(?:years?|yrs?)\b/gi, label: "a years-of-experience claim" },
  { pattern: /\b(?:led|managed|supervised)\s+(?:a\s+)?(?:team\s+of\s+)?\d+\b/gi, label: "a team-size claim" },
  { pattern: /\b(?:million|thousand|billion|[0-9,]{4,})\s*(?:users?|requests?|transactions?|records?)\b/gi, label: "a scale claim" },
  { pattern: /\bcertified\b|\bcertification\b/gi, label: "a certification claim" },
];

/**
 * Equivalent phrasings of the same competency. Rewording "REST API" as
 * "RESTful API" is a style change, not a new claim, so aliases must resolve to
 * one another. These are strict synonyms only — never near-neighbours (Docker
 * and Kubernetes are NOT aliases).
 */
const ALIAS_GROUPS: string[][] = [
  ["REST API", "RESTful", "RESTful API", "REST APIs", "RESTful APIs", "REST"],
  ["Node.js", "NodeJS", "Node"],
  ["Express", "Express.js", "ExpressJS"],
  ["PostgreSQL", "Postgres"],
  ["Next.js", "NextJS"],
  ["GCP", "Google Cloud", "Google Cloud Platform"],
  ["CI/CD", "Continuous Integration", "Continuous Delivery", "Continuous Deployment"],
  ["Microservices", "Microservices Architecture", "Microservice"],
  ["JavaScript", "JS"],
  ["TypeScript", "TS"],
  ["Kubernetes", "K8s"],
  ["Automated Testing", "Unit Testing", "Test Automation"],
];

const ALIAS_INDEX = new Map<string, string[]>();
for (const group of ALIAS_GROUPS) {
  for (const term of group) ALIAS_INDEX.set(term.toLowerCase(), group);
}

/** All strings that mean the same thing as `term`, including itself. */
function aliasesOf(term: string): string[] {
  return ALIAS_INDEX.get(term.toLowerCase()) ?? [term];
}

/** Return the verbatim CV line containing `term`, for use as evidence. */
function findSentence(rawText: string, term: string): string {
  const line = rawText
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .find((l) => l.length > 5 && mentions(l, term));
  return line ?? `"${term}" appears in your CV`;
}

/**
 * Judge a proposed rewrite. Returns the strictest applicable classification.
 */
export function judge(input: VerdictInput): Verdict {
  const { originalText, recommendedText, rawText, evidence, verified } = input;

  const before = originalText.toLowerCase();
  const evidenceBySkill = new Map(evidence.map((e) => [e.skill.toLowerCase(), e]));

  const supported: { skill: string; quote: string }[] = [];
  const unsupported: string[] = [];
  const needsConfirmation: string[] = [];

  // 1. Which claimable terms does the rewrite ADD that the original lacked?
  for (const term of CLAIMABLE_TERMS) {
    const inNew = mentions(recommendedText, term);
    if (!inNew) continue;
    const aliases = aliasesOf(term);
    // Already present in the original (in any equivalent phrasing) → not a new claim.
    if (aliases.some((a) => mentions(before, a))) continue;

    const answer = aliases.map((a) => verified.get(a.toLowerCase())).find(Boolean);
    if (answer === "NO") {
      unsupported.push(term);
      continue;
    }
    if (answer === "YES") {
      supported.push({ skill: term, quote: "Confirmed by you" });
      continue;
    }

    // Evidence for any equivalent phrasing counts.
    const ev = aliases.map((a) => evidenceBySkill.get(a.toLowerCase())).find(Boolean);
    if (!ev) {
      // Last resort: the CV text itself states an equivalent phrasing.
      const alias = aliases.find((a) => mentions(rawText, a));
      if (alias) {
        supported.push({ skill: term, quote: findSentence(rawText, alias) });
        continue;
      }
      // Not proven anywhere in the CV → fabrication.
      unsupported.push(term);
      continue;
    }
    if (ev.kind === "DIRECT_SKILL" || ev.kind === "RELATED_COMPETENCY") {
      supported.push({ skill: term, quote: ev.quote });
    } else {
      // Inferred only — ask the user before using it (§11).
      needsConfirmation.push(term);
    }
  }

  // 2. Fabricated numbers / metrics / durations that were not in the CV at all.
  const fabricated: string[] = [];
  for (const { pattern, label } of FABRICATION_PATTERNS) {
    const matches = recommendedText.match(pattern) ?? [];
    for (const m of matches) {
      // Allowed only if the same figure already appears somewhere in the CV.
      if (!rawText.toLowerCase().includes(m.toLowerCase().trim())) {
        fabricated.push(`${label} ("${m.trim()}")`);
      }
    }
  }

  // 3. Decide, strictest first.
  if (fabricated.length) {
    return {
      type: "NOT_ALLOWED",
      reason: `The suggestion introduces ${fabricated[0]} that does not appear in your CV. Numbers and achievements are never invented.`,
      unsupported: [...unsupported, ...fabricated],
      supported,
      needsConfirmation,
      confidence: 1,
    };
  }
  if (unsupported.length) {
    return {
      type: "NOT_ALLOWED",
      reason: `The suggestion claims ${unsupported.join(", ")}, which your CV does not evidence. This will not be added.`,
      unsupported,
      supported,
      needsConfirmation,
      confidence: 1,
    };
  }
  if (needsConfirmation.length) {
    return {
      type: "REQUIRES_CONFIRMATION",
      reason: `Your CV hints at ${needsConfirmation.join(", ")} but does not state it. Confirm you have this experience before it is used.`,
      unsupported,
      supported,
      needsConfirmation,
      confidence: 0.6,
    };
  }
  if (supported.length) {
    return {
      type: "RELATED_SKILL",
      reason: `Adds ${supported.map((s) => s.skill).join(", ")}, each backed by wording already in your CV.`,
      unsupported,
      supported,
      needsConfirmation,
      confidence: 0.9,
    };
  }
  return {
    type: "SAFE_REWRITE",
    reason: "Improves professional wording while preserving the original meaning. No new claims introduced.",
    unsupported: [],
    supported: [],
    needsConfirmation: [],
    confidence: 0.98,
  };
}

/**
 * Validate an LLM's structured output. Never trust the model's own `type`:
 * re-judge it locally and override.
 */
export function validateSuggestion(
  raw: unknown,
  ctx: { rawText: string; evidence: Evidence[]; verified: Map<string, "YES" | "NO" | "NOT_SURE"> }
): { ok: true; suggestion: Suggestion; verdict: Verdict } | { ok: false; error: string } {
  const parsed = suggestionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `Malformed AI output: ${parsed.error.issues[0]?.message ?? "schema mismatch"}` };
  }
  const s = parsed.data;

  const verdict = judge({
    originalText: s.original_text,
    recommendedText: s.recommended_text,
    rawText: ctx.rawText,
    evidence: ctx.evidence,
    verified: ctx.verified,
  });

  // The locally-computed verdict is authoritative.
  return {
    ok: true,
    suggestion: { ...s, type: verdict.type, unsupported_skills: verdict.unsupported },
    verdict,
  };
}

/** Human-facing label for a verdict (spec §34). */
export const VERDICT_LABEL: Record<RecommendationType, string> = {
  SAFE_REWRITE: "SAFE REWRITE",
  RELATED_SKILL: "RELATED TO EXISTING EXPERIENCE",
  REQUIRES_CONFIRMATION: "NEEDS YOUR CONFIRMATION",
  NOT_ALLOWED: "DO NOT ADD — ACTUAL SKILL GAP",
};
