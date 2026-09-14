/**
 * Recommendation engine (spec §8, §9, §14, §15, §16, §27, §39).
 *
 * Produces several wording options per sentence — never a single "Optimize"
 * action. Works fully offline with deterministic templates; when an LLM is
 * configured it adds phrasing variety, but EVERY option (template or model)
 * still passes through the truthfulness judge before it can be offered.
 */
import { mentions, computeYearsFromCv, type ParsedCv } from "./parser";
import { judge, validateSuggestion, type RecommendationType } from "./truthfulness";
import type { Evidence } from "./skill-graph";

export type RecommendationMode = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";

export interface RewriteOption {
  label: string; // "ATS Optimized" | "Professional" | "Concise"
  text: string;
  type: RecommendationType;
  reason: string;
  evidence: string[];
  relatedSkills: string[];
  unsupportedSkills: string[];
  confidence: number;
  estimatedImpact: number;
}

export interface RecommendationItem {
  section: string;
  originalText: string;
  problems: string[];
  options: RewriteOption[];
}

/** Weak verbs → professional replacements (spec §16). */
const VERB_MAP: { from: RegExp; to: string }[] = [
  { from: /^\s*responsible for\s+(developing|creating|building|making)\s+/i, to: "Developed " },
  { from: /^\s*responsible for\s+(maintaining|managing)\s+/i, to: "Maintained " },
  { from: /^\s*responsible for\s+/i, to: "Managed " },
  { from: /^\s*worked on\s+/i, to: "Developed " },
  { from: /^\s*helped\s+(to\s+)?(develop|build|create)\s+/i, to: "Contributed to developing " },
  { from: /^\s*helped\s+(with\s+)?/i, to: "Supported " },
  { from: /^\s*made\s+/i, to: "Built " },
  { from: /^\s*created\s+/i, to: "Developed " },
  { from: /^\s*did\s+/i, to: "Performed " },
  { from: /^\s*handled\s+/i, to: "Managed " },
  { from: /^\s*involved in\s+/i, to: "Contributed to " },
  { from: /^\s*participated in\s+/i, to: "Contributed to " },
];

/**
 * Interchangeable professional verbs. Swapping one for another changes register
 * only — it asserts nothing new — so these safely produce distinct options (§9).
 */
const VERB_SYNONYMS: Record<string, string[]> = {
  developed: ["Built", "Implemented"],
  built: ["Developed", "Implemented"],
  maintained: ["Managed", "Administered"],
  managed: ["Maintained", "Oversaw"],
  implemented: ["Developed", "Delivered"],
  designed: ["Architected", "Structured"],
  supported: ["Assisted with", "Contributed to"],
  performed: ["Carried out", "Executed"],
  "contributed to": ["Assisted in", "Supported"],
  integrated: ["Connected", "Wired up"],
  configured: ["Set up", "Provisioned"],
  optimised: ["Improved", "Tuned"],
  optimized: ["Improved", "Tuned"],
};

/** Swap the leading verb for a synonym, leaving the rest of the sentence intact. */
function swapLeadVerb(text: string, index: number): string | null {
  const trimmed = text.trim();
  for (const [verb, alts] of Object.entries(VERB_SYNONYMS)) {
    const re = new RegExp(`^${verb}\\b`, "i");
    if (!re.test(trimmed)) continue;
    const alt = alts[index % alts.length];
    if (!alt) return null;
    return trimmed.replace(re, alt);
  }
  return null;
}

/** Terminology the CV can be aligned to, when evidence already supports it. */
const TERM_UPGRADES: { when: RegExp; from: RegExp; to: string; needs: string }[] = [
  { when: /\bapi\b/i, from: /\bAPI(s)?\b/g, to: "RESTful API$1", needs: "REST API" },
  { when: /\bdatabase\b/i, from: /\bdatabase\b/gi, to: "relational database", needs: "Relational Database" },
  { when: /\bwebsite\b/i, from: /\bwebsite\b/gi, to: "web application", needs: "Web Development" },
  { when: /\bfront ?end\b/i, from: /\bfront ?end\b/gi, to: "frontend", needs: "Frontend Development" },
];

const WEAK_START = /^(responsible for|worked on|helped|made|created|did|handled|involved in|participated in)/i;

/** Diagnose what is wrong with a bullet (spec §8). */
export function diagnose(text: string, jobSkills: string[], rawText: string): string[] {
  const problems: string[] = [];
  const words = text.trim().split(/\s+/).length;
  if (words < 8) problems.push("Too short — does not explain purpose or context.");
  if (WEAK_START.test(text.trim())) problems.push("Starts with a weak phrase instead of an action verb.");
  if (!/\b(developed|built|designed|implemented|maintained|integrated|configured|optimi[sz]ed|migrated|automated|led|delivered)\b/i.test(text))
    problems.push("Missing a strong professional action verb.");
  if (!/\b(using|with|via|through|based on)\b/i.test(text) && words < 20)
    problems.push("Does not state the technologies used.");

  // Terminology the job asks for, that this sentence proves but does not name.
  const provable = jobSkills.filter((s) => !mentions(text, s) && mentions(rawText, s) === false);
  if (provable.length === 0) {
    const near = jobSkills.filter((s) => !mentions(text, s));
    if (near.length) problems.push(`Job terminology not used here: ${near.slice(0, 3).join(", ")}.`);
  }
  if (!problems.length) problems.push("Acceptable, but wording can be tightened.");
  return problems;
}

/** Apply verb upgrade and sentence tidy-up. Adds no new claims. */
function professionalize(text: string): string {
  let out = text.trim().replace(/^[-•·●*]\s*/, "");
  for (const v of VERB_MAP) {
    if (v.from.test(out)) { out = out.replace(v.from, v.to); break; }
  }
  out = out.charAt(0).toUpperCase() + out.slice(1);
  return out.replace(/\s+/g, " ").replace(/\.?$/, ".");
}

/** Align terminology only where the evidence set already supports the term. */
function alignTerminology(text: string, evidence: Evidence[]): string {
  const owned = new Set(evidence.map((e) => e.skill.toLowerCase()));
  let out = text;
  for (const u of TERM_UPGRADES) {
    if (u.when.test(out) && owned.has(u.needs.toLowerCase())) {
      out = out.replace(u.from, u.to);
    }
  }
  return out.replace(/\s+/g, " ");
}

function concise(text: string): string {
  return professionalize(text)
    .replace(/\b(in order to|so as to)\b/gi, "to")
    .replace(/\b(various|several|multiple)\s+/gi, "")
    .replace(/\bthat (are|is|were|was)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface BuildOptionsCtx {
  rawText: string;
  evidence: Evidence[];
  verified: Map<string, "YES" | "NO" | "NOT_SURE">;
  jobSkills: string[];
  mode: RecommendationMode;
}

/**
 * Build the option set for one sentence. Each candidate is judged; anything
 * judged NOT_ALLOWED is dropped rather than shown as usable.
 */
export function buildOptions(original: string, ctx: BuildOptionsCtx): RewriteOption[] {
  const base = professionalize(original);
  const candidates: { label: string; text: string }[] = [];

  // Conservative mode = wording only, no terminology alignment.
  if (ctx.mode === "CONSERVATIVE") {
    candidates.push({ label: "Professional", text: base });
    candidates.push({ label: "Concise", text: concise(original) });
  } else {
    const aligned = alignTerminology(base, ctx.evidence);
    candidates.push({ label: "ATS Optimized", text: aligned });
    candidates.push({ label: "Professional", text: base });
    candidates.push({ label: "Concise", text: concise(original) });

    if (ctx.mode === "AGGRESSIVE") {
      // Surface a competency the CV proves but this sentence omits.
      const provenTerm = ctx.jobSkills.find((s) => {
        const ev = ctx.evidence.find((e) => e.skill.toLowerCase() === s.toLowerCase());
        return ev && (ev.kind === "DIRECT_SKILL" || ev.kind === "RELATED_COMPETENCY") && !mentions(base, s);
      });
      if (provenTerm) {
        candidates.push({
          label: "Keyword Aligned",
          text: base.replace(/\.$/, "") + `, applying ${provenTerm}.`,
        });
      }
    }
  }

  // Verb-synonym variants guarantee the user gets real choices even when the
  // sentence needs no terminology change (spec §9 requires several options).
  for (let i = 0; i < 2; i++) {
    const swapped = swapLeadVerb(base, i);
    if (swapped) candidates.push({ label: i === 0 ? "Alternative Wording" : "Alternative Wording 2", text: swapped });
  }

  const seen = new Set<string>();
  const options: RewriteOption[] = [];

  for (const c of candidates) {
    const text = c.text.trim();
    if (!text || text.toLowerCase() === original.trim().toLowerCase()) continue;
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());

    const verdict = judge({
      originalText: original,
      recommendedText: text,
      rawText: ctx.rawText,
      evidence: ctx.evidence,
      verified: ctx.verified,
    });

    // Never offer a fabricating option.
    if (verdict.type === "NOT_ALLOWED") continue;

    options.push({
      label: c.label,
      text,
      type: verdict.type,
      reason: verdict.reason,
      evidence: verdict.supported.map((s) => s.quote),
      relatedSkills: verdict.supported.map((s) => s.skill),
      unsupportedSkills: verdict.unsupported,
      confidence: verdict.confidence,
      estimatedImpact: estimateImpact(original, text, ctx.jobSkills),
    });
  }

  return options;
}

/** Estimated ATS impact: how many job terms the rewrite newly surfaces (§23). */
function estimateImpact(before: string, after: string, jobSkills: string[]): number {
  let gained = 0;
  for (const s of jobSkills) {
    if (!mentions(before, s) && mentions(after, s)) gained += 1;
  }
  const lengthBonus = after.split(/\s+/).length > before.split(/\s+/).length + 3 ? 1 : 0;
  return Math.min(gained * 3 + lengthBonus, 12);
}

/**
 * Professional summary generator (spec §14). Years of experience are only
 * stated when they can be COMPUTED from the CV's own dates.
 */
export function buildSummaryOptions(
  cv: ParsedCv,
  topSkills: string[],
  targetTitle: string | null
): string[] {
  const years = computeYearsFromCv(cv);
  const skills = topSkills.slice(0, 5);
  if (!skills.length) return [];

  const role = targetTitle || cv.experiences[0]?.position || "Software Engineer";
  const skillPhrase = skills.length > 1
    ? `${skills.slice(0, -1).join(", ")}, and ${skills[skills.length - 1]}`
    : skills[0];

  // Only mention a year count when it is derived from real dates.
  const yearClause = years && years > 0 ? ` with ${years} year${years > 1 ? "s" : ""} of experience` : "";

  return [
    `${role}${yearClause} building applications using ${skillPhrase}.`,
    `${role}${yearClause} specialising in ${skills.slice(0, 3).join(", ")}, focused on delivering reliable, maintainable software.`,
    `${role} experienced in ${skillPhrase}${yearClause ? `,${yearClause.replace(" with", " with")}` : ""}.`,
  ];
}

// ─────────────────────────────────────────────────────────────
// AIProvider abstraction (spec §39)
// ─────────────────────────────────────────────────────────────

export interface AIProvider {
  readonly name: string;
  readonly available: boolean;
  /** Must return objects matching suggestionSchema. */
  suggest(prompt: string): Promise<unknown[]>;
}

/** No external calls; the deterministic engine above does the work. */
export class NullAIProvider implements AIProvider {
  readonly name = "deterministic";
  readonly available = false;
  async suggest(): Promise<unknown[]> {
    return [];
  }
}

/** OpenAI-compatible endpoint, configured purely via environment variables. */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";
  constructor(
    private base = process.env.LLM_API_BASE ?? "",
    private key = process.env.LLM_API_KEY ?? "",
    private model = process.env.LLM_MODEL ?? "gpt-4o-mini"
  ) {}

  get available() {
    return Boolean(this.base && this.key);
  }

  async suggest(prompt: string): Promise<unknown[]> {
    if (!this.available) return [];
    const res = await fetch(`${this.base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You rewrite CV sentences. You MUST NOT introduce any skill, technology, metric, " +
              "number, duration, certification, or responsibility that is not present in the " +
              'provided CV text. Reply as JSON: {"suggestions":[{"original_text","recommended_text",' +
              '"type","evidence","related_skills","unsupported_skills","confidence","reason"}]}',
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];
    try {
      const parsed = JSON.parse(content) as { suggestions?: unknown[] };
      return parsed.suggestions ?? [];
    } catch {
      return [];
    }
  }
}

export function getAIProvider(): AIProvider {
  const p = new OpenAICompatibleProvider();
  return p.available ? p : new NullAIProvider();
}

/**
 * Merge LLM suggestions into an option list, re-validating each one locally.
 * A model suggestion that fails validation is discarded, not surfaced.
 */
export async function augmentWithAI(
  original: string,
  existing: RewriteOption[],
  ctx: BuildOptionsCtx
): Promise<RewriteOption[]> {
  const provider = getAIProvider();
  if (!provider.available) return existing;

  const prompt = [
    "CV sentence to improve:", original, "",
    "Target job skills:", ctx.jobSkills.join(", ") || "(none)", "",
    "The full CV text (the ONLY source of truth):", ctx.rawText.slice(0, 4000),
  ].join("\n");

  let raw: unknown[] = [];
  try {
    raw = await provider.suggest(prompt);
  } catch {
    return existing;
  }

  const out = [...existing];
  for (const r of raw.slice(0, 3)) {
    const checked = validateSuggestion(r, {
      rawText: ctx.rawText,
      evidence: ctx.evidence,
      verified: ctx.verified,
    });
    if (!checked.ok) continue;
    if (checked.verdict.type === "NOT_ALLOWED") continue;
    const text = checked.suggestion.recommended_text.trim();
    if (!text || out.some((o) => o.text.toLowerCase() === text.toLowerCase())) continue;

    out.push({
      label: "AI Suggested",
      text,
      type: checked.verdict.type,
      reason: checked.verdict.reason,
      evidence: checked.verdict.supported.map((s) => s.quote),
      relatedSkills: checked.verdict.supported.map((s) => s.skill),
      unsupportedSkills: checked.verdict.unsupported,
      confidence: checked.verdict.confidence,
      estimatedImpact: estimateImpact(original, text, ctx.jobSkills),
    });
  }
  return out;
}
