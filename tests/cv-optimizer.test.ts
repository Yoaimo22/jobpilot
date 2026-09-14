import { describe, it, expect } from "vitest";
import { parseCvText, computeYearsFromCv } from "@/modules/cv/parser";
import { buildEvidence, classifySkill, ownedSkills, categorizeSkills } from "@/modules/cv/skill-graph";
import { judge, validateSuggestion } from "@/modules/cv/truthfulness";
import { buildOptions, buildSummaryOptions } from "@/modules/cv/recommender";
import { matchCvToJob, gapAnalysis } from "@/modules/cv/matcher";

const CV_TEXT = `
Budi Santoso
budi@example.com | +62 812 3456 7890

PROFESSIONAL SUMMARY
Backend engineer focused on building web services.

WORK EXPERIENCE
Backend Engineer - PT Contoh Teknologi
Jan 2022 - Present
- Developed REST API using Node.js and PostgreSQL.
- Responsible for maintaining server deployment scripts.
- Reduced query processing time by 30%.

Junior Developer - PT Awal
Jan 2020 - Dec 2021
- Helped build internal dashboard using React.

EDUCATION
Bachelor of Computer Science - Universitas Contoh
2016 - 2020

SKILLS
JavaScript, TypeScript, Node.js, PostgreSQL, React, Git, Docker
`;

const parsed = parseCvText(CV_TEXT);
const evidence = buildEvidence(parsed, CV_TEXT);
const noVerified = new Map<string, "YES" | "NO" | "NOT_SURE">();

describe("CV parser", () => {
  it("extracts contact details and name", () => {
    expect(parsed.email).toBe("budi@example.com");
    expect(parsed.name).toBeTruthy();
  });

  it("extracts experiences with bullets", () => {
    expect(parsed.experiences.length).toBeGreaterThanOrEqual(1);
    const bullets = parsed.experiences.flatMap((e) => [...e.responsibilities, ...e.achievements]);
    expect(bullets.some((b) => /REST API/i.test(b))).toBe(true);
  });

  it("separates achievements (with metrics) from responsibilities", () => {
    const achievements = parsed.experiences.flatMap((e) => e.achievements);
    expect(achievements.some((a) => /30%/.test(a))).toBe(true);
  });

  it("detects technologies present in the CV only", () => {
    expect(parsed.programmingLanguages).toContain("JavaScript");
    expect(parsed.databases).toContain("PostgreSQL");
    // Never invented:
    expect(parsed.databases).not.toContain("MongoDB");
    expect(parsed.devopsTools).not.toContain("Kubernetes");
  });

  it("computes years of experience from real dates, never invents them", () => {
    const years = computeYearsFromCv(parsed);
    expect(years).not.toBeNull();
    expect(years!).toBeGreaterThan(0);

    const empty = parseCvText("John Doe\nSKILLS\nExcel");
    expect(computeYearsFromCv(empty)).toBeNull();
  });
});

describe("Evidence system", () => {
  it("attaches a verbatim CV quote to every direct skill", () => {
    const node = evidence.find((e) => e.skill === "Node.js");
    expect(node).toBeDefined();
    expect(node!.kind).toBe("DIRECT_SKILL");
    expect(CV_TEXT).toContain(node!.quote.slice(0, 25));
  });

  it("derives broader competencies from a direct skill, sharing its evidence", () => {
    const backend = evidence.find((e) => e.skill === "Backend Development");
    expect(backend).toBeDefined();
    expect(backend!.kind).toBe("RELATED_COMPETENCY");
    expect(backend!.quote.length).toBeGreaterThan(0);
  });

  it("never infers a sibling technology the CV does not mention", () => {
    const skills = ownedSkills(evidence).map((s) => s.toLowerCase());
    // React is present, so Vue/Angular must NOT be inferred
    expect(skills).toContain("react");
    expect(skills).not.toContain("vue");
    expect(skills).not.toContain("angular");
    // PostgreSQL is present, so MongoDB must NOT be inferred
    expect(skills).not.toContain("mongodb");
    expect(skills).not.toContain("kubernetes");
    expect(skills).not.toContain("kafka");
  });

  it("classifies an absent skill as missing", () => {
    expect(classifySkill("Kubernetes", evidence, noVerified).kind).toBe("MISSING_SKILL");
  });

  it("honours a user's NO answer over any inference", () => {
    const verified = new Map<string, "YES" | "NO" | "NOT_SURE">([["docker", "NO"]]);
    expect(classifySkill("Docker", evidence, verified).kind).toBe("MISSING_SKILL");
  });

  it("groups skills without adding new ones", () => {
    const cats = categorizeSkills(["JavaScript", "React", "Node.js", "PostgreSQL", "Git"]);
    const flat = Object.values(cats).flat();
    expect(flat).toHaveLength(5);
    expect(cats.Languages).toContain("JavaScript");
    expect(cats.Database).toContain("PostgreSQL");
  });
});

describe("Truthfulness guard — the core safety rule", () => {
  const base = { rawText: CV_TEXT, evidence, verified: noVerified };

  it("allows a pure wording improvement", () => {
    const v = judge({
      ...base,
      originalText: "Developed REST API using Node.js and PostgreSQL.",
      recommendedText: "Developed and maintained RESTful backend APIs using Node.js and PostgreSQL.",
    });
    expect(["SAFE_REWRITE", "RELATED_SKILL"]).toContain(v.type);
    expect(v.unsupported).toHaveLength(0);
  });

  it("BLOCKS a rewrite that invents technologies", () => {
    const v = judge({
      ...base,
      originalText: "Developed REST API using Node.js and PostgreSQL.",
      recommendedText: "Built highly scalable microservices using Kubernetes, Kafka and AWS.",
    });
    expect(v.type).toBe("NOT_ALLOWED");
    expect(v.unsupported.join(" ")).toMatch(/Kubernetes|Kafka|AWS/);
  });

  it("BLOCKS an invented performance metric", () => {
    const v = judge({
      ...base,
      originalText: "Developed REST API using Node.js.",
      recommendedText: "Developed REST API using Node.js, improving performance by 50%.",
    });
    expect(v.type).toBe("NOT_ALLOWED");
  });

  it("permits a metric that genuinely appears in the CV", () => {
    const v = judge({
      ...base,
      originalText: "Reduced query processing time by 30%.",
      recommendedText: "Optimised database queries, reducing processing time by 30%.",
    });
    expect(v.type).not.toBe("NOT_ALLOWED");
  });

  it("BLOCKS an invented years-of-experience claim", () => {
    const v = judge({
      ...base,
      originalText: "Backend engineer focused on building web services.",
      recommendedText: "Backend engineer with 10 years of experience building web services.",
    });
    expect(v.type).toBe("NOT_ALLOWED");
  });

  it("BLOCKS an invented certification", () => {
    const v = judge({
      ...base,
      originalText: "Developed REST API using Node.js.",
      recommendedText: "AWS certified engineer who developed REST API using Node.js.",
    });
    expect(v.type).toBe("NOT_ALLOWED");
  });

  it("allows surfacing a competency the CV already proves", () => {
    const v = judge({
      ...base,
      originalText: "Developed REST API using Node.js and PostgreSQL.",
      recommendedText: "Backend Development: developed REST API using Node.js and PostgreSQL.",
    });
    expect(v.type).toBe("RELATED_SKILL");
    expect(v.supported.some((s) => s.skill === "Backend Development")).toBe(true);
  });

  it("overrides an LLM that mislabels its own fabrication as safe", () => {
    const checked = validateSuggestion(
      {
        original_text: "Developed REST API using Node.js.",
        recommended_text: "Architected Kubernetes-based microservices on AWS.",
        type: "SAFE_REWRITE", // the model lies
        evidence: ["Developed REST API using Node.js."],
        related_skills: [],
        unsupported_skills: [],
        confidence: 0.99,
        reason: "totally fine",
      },
      base
    );
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      expect(checked.suggestion.type).toBe("NOT_ALLOWED");
      expect(checked.verdict.unsupported.length).toBeGreaterThan(0);
    }
  });

  it("rejects malformed AI output instead of trusting it", () => {
    const checked = validateSuggestion({ nonsense: true }, base);
    expect(checked.ok).toBe(false);
  });
});

describe("Recommendation options", () => {
  const ctx = {
    rawText: CV_TEXT,
    evidence,
    verified: noVerified,
    jobSkills: ["Node.js", "PostgreSQL", "REST API", "Kubernetes"],
    mode: "BALANCED" as const,
  };

  it("offers several distinct options, none of them fabricating", () => {
    const options = buildOptions("Responsible for maintaining server deployment scripts.", ctx);
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const o of options) {
      expect(o.type).not.toBe("NOT_ALLOWED");
      expect(o.text).not.toMatch(/Kubernetes/i);
    }
  });

  it("replaces a weak opener with an action verb", () => {
    const options = buildOptions("Responsible for maintaining server deployment scripts.", ctx);
    expect(options.some((o) => /^Maintained/i.test(o.text))).toBe(true);
  });

  it("never puts a job skill the CV lacks into any option", () => {
    const options = buildOptions("Helped build internal dashboard using React.", ctx);
    expect(options.every((o) => !/Kubernetes/i.test(o.text))).toBe(true);
  });

  it("builds a summary without inventing a year count when dates are absent", () => {
    const noDates = parseCvText("Jane\nSKILLS\nReact, Node.js");
    const summaries = buildSummaryOptions(noDates, ["React", "Node.js"], "Frontend Engineer");
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries.every((s) => !/\d+\s*year/i.test(s))).toBe(true);
  });

  it("never borrows an unearned seniority from the target job title", () => {
    // The CV says "Backend Engineer"; the vacancy says "Senior Backend Engineer".
    const summaries = buildSummaryOptions(parsed, ["Node.js", "PostgreSQL"], "Senior Backend Engineer");
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      expect(s).not.toMatch(/\bSenior\b/i);
    }
    // It should use the user's own title instead.
    expect(summaries.some((s) => /Backend Engineer/i.test(s))).toBe(true);
  });

  it("adopts the target title when the CV fully supports it", () => {
    const summaries = buildSummaryOptions(parsed, ["Node.js"], "Backend Engineer");
    expect(summaries.some((s) => /Backend Engineer/i.test(s))).toBe(true);
  });

  it("states a year count only when derivable from CV dates", () => {
    const summaries = buildSummaryOptions(parsed, ["Node.js"], null);
    // CV_TEXT has Jan 2020 - Dec 2021 and Jan 2022 - Present, so years exist.
    expect(summaries.some((s) => /\d+\s*years?\s*of experience/i.test(s))).toBe(true);
  });
});

describe("CV ↔ job matching", () => {
  const job = {
    title: "Backend Engineer",
    requiredSkills: ["Node.js", "PostgreSQL", "REST API", "Kubernetes"],
    preferredSkills: ["Docker"],
    description: "Backend role building APIs.",
    experienceYears: 3,
    educationRequirement: "Bachelor",
    industry: null,
    location: "Jakarta",
    workplaceType: "ONSITE",
  };

  const result = matchCvToJob(parsed, CV_TEXT, evidence, noVerified, job, computeYearsFromCv(parsed));

  it("scores within range and marks owned skills as matched", () => {
    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.matchedExact).toContain("Node.js");
    expect(result.matchedExact).toContain("PostgreSQL");
  });

  it("reports a genuinely absent skill as missing", () => {
    expect(result.missing).toContain("Kubernetes");
  });

  it("separates qualification from presentation", () => {
    expect(result.qualificationScore).toBeGreaterThan(0);
    expect(result.presentationScore).toBeGreaterThan(0);
    expect(result.qualificationScore).not.toBeNaN();
  });

  it("labels a real gap as needing an actual skill, not a wording fix", () => {
    const gaps = gapAnalysis(result);
    const k8s = gaps.find((g) => g.skill === "Kubernetes");
    expect(k8s?.verdict).toBe("REQUIRES_ACTUAL_SKILL");
    expect(k8s?.reason).toMatch(/do not add/i);
  });

  it("keeps ATS 'missing but proven' separate from 'missing for real'", () => {
    expect(result.ats.missingActual).toContain("Kubernetes");
    expect(result.ats.missingButProven).not.toContain("Kubernetes");
  });
});
