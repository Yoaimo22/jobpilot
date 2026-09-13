import { describe, it, expect } from "vitest";
import { computeMatch, type MatchProfile } from "@/modules/matching/match-engine";

const profile: MatchProfile = {
  skills: [
    { name: "Node.js", level: "ADVANCED", years: 4 },
    { name: "PostgreSQL", level: "ADVANCED", years: 4 },
    { name: "Docker", level: "INTERMEDIATE", years: 2 },
    { name: "AWS", level: "INTERMEDIATE", years: 2 },
  ],
  totalExperienceYears: 4,
  preferredTitles: ["Backend Engineer"],
  targetLocations: ["Jakarta"],
  workplaceTypes: ["REMOTE"],
  expectedSalaryMin: 15000000,
  targetIndustries: ["Technology"],
  seniority: ["SENIOR"],
};

describe("computeMatch", () => {
  it("returns a score in 0..100", () => {
    const r = computeMatch(profile, {
      title: "Backend Engineer", requiredSkills: ["Node.js", "PostgreSQL"], preferredSkills: [],
      experienceYears: 3, location: "Jakarta", workplaceType: "REMOTE",
      salaryMin: 16000000, salaryMax: 20000000, industry: "Technology", seniority: "SENIOR",
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("identifies matched and missing skills", () => {
    const r = computeMatch(profile, {
      title: "Backend Engineer", requiredSkills: ["Node.js", "PostgreSQL", "Kubernetes"], preferredSkills: [],
      experienceYears: 3, location: "Jakarta", workplaceType: "REMOTE",
      salaryMin: 16000000, salaryMax: 20000000, industry: "Technology", seniority: "SENIOR",
    });
    expect(r.matchedSkills).toContain("Node.js");
    expect(r.matchedSkills).toContain("PostgreSQL");
    expect(r.missingSkills).toContain("Kubernetes");
  });

  it("scores a perfect fit higher than a poor fit", () => {
    const good = computeMatch(profile, {
      title: "Backend Engineer", requiredSkills: ["Node.js", "PostgreSQL"], preferredSkills: ["Docker"],
      experienceYears: 3, location: "Jakarta", workplaceType: "REMOTE",
      salaryMin: 16000000, salaryMax: 20000000, industry: "Technology", seniority: "SENIOR",
    });
    const poor = computeMatch(profile, {
      title: "Marketing Manager", requiredSkills: ["Photoshop", "SEO", "Copywriting"], preferredSkills: [],
      experienceYears: 8, location: "Bandung", workplaceType: "ONSITE",
      salaryMin: 5000000, salaryMax: 7000000, industry: "Retail", seniority: "LEAD",
    });
    expect(good.score).toBeGreaterThan(poor.score);
  });

  it("is case-insensitive on skill matching", () => {
    const r = computeMatch(profile, {
      title: "Engineer", requiredSkills: ["node.js", "POSTGRESQL"], preferredSkills: [],
      experienceYears: 3, location: null, workplaceType: "REMOTE",
      salaryMin: null, salaryMax: null, industry: null, seniority: null,
    });
    expect(r.matchedSkills.length).toBe(2);
  });
});
