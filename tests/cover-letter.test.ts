import { describe, it, expect } from "vitest";
import { buildCoverLetter, recommendResume } from "@/modules/applications/cover-letter";

describe("buildCoverLetter", () => {
  it("only mentions skills the user actually has", () => {
    const letter = buildCoverLetter({
      fullName: "Jane Doe", companyName: "Acme", jobTitle: "Backend Engineer",
      jobDescription: null, userSkills: ["Node.js", "PostgreSQL"],
      requiredSkills: ["Node.js", "PostgreSQL", "Kubernetes"], // Kubernetes NOT owned
      professionalSummary: "Experienced engineer.", portfolioUrl: null, yearsExperience: 4,
    });
    expect(letter).toContain("Node.js");
    expect(letter).toContain("PostgreSQL");
    // Must NOT claim a skill the user does not have
    expect(letter).not.toContain("Kubernetes");
    expect(letter).toContain("Jane Doe");
    expect(letter).toContain("Acme");
  });

  it("includes portfolio link when provided", () => {
    const letter = buildCoverLetter({
      fullName: "A", companyName: "B", jobTitle: "Dev", jobDescription: null,
      userSkills: ["React"], requiredSkills: ["React"], professionalSummary: null,
      portfolioUrl: "https://portfolio.dev", yearsExperience: 2,
    });
    expect(letter).toContain("https://portfolio.dev");
  });
});

describe("recommendResume", () => {
  const job = { title: "Backend Engineer", requiredSkills: ["Node.js", "PostgreSQL", "AWS"] };

  it("picks the CV with the best skill coverage", () => {
    const rec = recommendResume(
      [
        { id: "1", name: "Frontend CV", extractedSkills: ["React", "CSS"], isDefault: false },
        { id: "2", name: "Backend CV", extractedSkills: ["Node.js", "PostgreSQL", "AWS"], isDefault: false },
      ],
      job
    );
    expect(rec.resumeId).toBe("2");
    expect(rec.confidence).toBeGreaterThan(0);
  });

  it("falls back to default CV when nothing matches", () => {
    const rec = recommendResume(
      [{ id: "d", name: "General CV", extractedSkills: ["Excel"], isDefault: true }],
      job
    );
    expect(rec.resumeId).toBe("d");
  });

  it("returns null when no CV exists", () => {
    const rec = recommendResume([], job);
    expect(rec.resumeId).toBeNull();
    expect(rec.confidence).toBe(0);
  });
});
