import { describe, it, expect } from "vitest";
import { FREE_PROVIDERS, resolveProviders, aiStatus } from "@/modules/cv/ai-providers";
import { parseCvText } from "@/modules/cv/parser";
import { buildEvidence } from "@/modules/cv/skill-graph";
import { validateSuggestion } from "@/modules/cv/truthfulness";
import { augmentWithAI, isAiEnabled, buildOptions } from "@/modules/cv/recommender";

const CV_TEXT = `
Budi Santoso
WORK EXPERIENCE
Backend Engineer - PT Contoh
Jan 2022 - Present
- Developed REST API using Node.js and PostgreSQL.
SKILLS
JavaScript, Node.js, PostgreSQL
`;
const parsed = parseCvText(CV_TEXT);
const evidence = buildEvidence(parsed, CV_TEXT);
const verified = new Map<string, "YES" | "NO" | "NOT_SURE">();

describe("Free AI provider registry", () => {
  it("only lists OpenAI-compatible endpoints with a key env var", () => {
    expect(FREE_PROVIDERS.length).toBeGreaterThan(0);
    for (const p of FREE_PROVIDERS) {
      expect(p.baseUrl).toMatch(/^https:\/\//);
      expect(p.baseUrl).not.toMatch(/\/$/); // no trailing slash
      expect(p.keyEnv).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(p.defaultModel.length).toBeGreaterThan(0);
    }
  });

  it("puts the most generous free tier first", () => {
    expect(FREE_PROVIDERS[0].id).toBe("groq");
    expect(FREE_PROVIDERS[0].freeRpm).toBeGreaterThanOrEqual(FREE_PROVIDERS[2].freeRpm);
  });

  it("resolves no providers when no keys are set", () => {
    // The test environment has no provider keys configured.
    expect(resolveProviders().length).toBe(0);
    expect(isAiEnabled()).toBe(false);
  });

  it("reports status without ever exposing key values", () => {
    const s = aiStatus();
    expect(s.active).toBe(false);
    const serialized = JSON.stringify(s);
    expect(serialized).not.toMatch(/sk-|gsk_|AIza/); // no key-shaped strings
    expect(s.available.length).toBe(FREE_PROVIDERS.length);
    for (const a of s.available) expect(a.configured).toBe(false);
  });
});

describe("AI suggestions are still policed locally", () => {
  const ctx = {
    rawText: CV_TEXT,
    evidence,
    verified,
    jobSkills: ["Node.js", "PostgreSQL", "Kubernetes"],
    mode: "BALANCED" as const,
  };

  it("returns deterministic options unchanged when no AI is configured", async () => {
    const base = buildOptions("Developed REST API using Node.js and PostgreSQL.", ctx);
    const out = await augmentWithAI("Developed REST API using Node.js and PostgreSQL.", base, ctx);
    expect(out).toEqual(base);
  });

  it("rejects a fabricating AI suggestion even when the model calls it safe", () => {
    const checked = validateSuggestion(
      {
        original_text: "Developed REST API using Node.js and PostgreSQL.",
        recommended_text: "Architected Kubernetes microservices on AWS at scale.",
        type: "SAFE_REWRITE",
        evidence: [],
        related_skills: [],
        unsupported_skills: [],
        confidence: 0.99,
        reason: "looks fine",
      },
      { rawText: CV_TEXT, evidence, verified }
    );
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.suggestion.type).toBe("NOT_ALLOWED");
  });

  it("accepts an AI suggestion that only rewords proven content", () => {
    const checked = validateSuggestion(
      {
        original_text: "Developed REST API using Node.js and PostgreSQL.",
        recommended_text: "Built and maintained RESTful APIs with Node.js and PostgreSQL.",
        type: "SAFE_REWRITE",
        evidence: ["Developed REST API using Node.js and PostgreSQL."],
        related_skills: [],
        unsupported_skills: [],
        confidence: 0.9,
        reason: "wording",
      },
      { rawText: CV_TEXT, evidence, verified }
    );
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.suggestion.type).not.toBe("NOT_ALLOWED");
  });

  it("rejects malformed AI output rather than trusting it", () => {
    const checked = validateSuggestion({ garbage: 1 }, { rawText: CV_TEXT, evidence, verified });
    expect(checked.ok).toBe(false);
  });
});
