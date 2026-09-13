/**
 * Seed script (development only). Creates a demo user with a profile, skills,
 * a few jobs (scored), and applications so the dashboard is populated.
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { KNOWN_SOURCES } from "../src/modules/jobs/providers";
import { computeMatch } from "../src/modules/matching/match-engine";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@jobpilot.dev";
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.jobSource.createMany({
    data: KNOWN_SOURCES.map((s) => ({ key: s.key, name: s.name, supportsApply: s.supportsApply })),
    skipDuplicates: true,
  });

  // Clean existing demo user for idempotent seeding
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });

  const user = await prisma.user.create({
    data: {
      email, passwordHash, name: "Demo User",
      profile: {
        create: {
          fullName: "Demo User", email, location: "Jakarta, Indonesia",
          professionalSummary: "Backend engineer with 4 years building Node.js and PostgreSQL services.",
          languages: ["English", "Indonesian"],
          experiences: { create: [{ title: "Backend Engineer", company: "Tech Co", startDate: new Date("2022-01-01"), current: true }] },
        },
      },
      jobPreference: {
        create: {
          expectedSalaryMin: 15000000, currency: "IDR",
          targetJobTitles: ["Backend Engineer", "Software Engineer"],
          targetLocations: ["Jakarta", "Remote"], workplaceTypes: ["REMOTE", "HYBRID"],
          seniority: ["MID", "SENIOR"], targetIndustries: ["Technology"],
        },
      },
      automationRule: { create: { minMatchScore: 80, maxApplicationsPerDay: 10 } },
    },
  });

  const skills = ["Node.js", "PostgreSQL", "TypeScript", "Docker", "AWS", "React"];
  for (const name of skills) {
    const skill = await prisma.skill.upsert({ where: { name }, create: { name }, update: {} });
    await prisma.userSkill.create({ data: { userId: user.id, skillId: skill.id, level: "ADVANCED", years: 4 } });
  }

  const manualSource = await prisma.jobSource.findUnique({ where: { key: "manual" } });
  const linkedin = await prisma.jobSource.findUnique({ where: { key: "linkedin" } });

  const jobSpecs = [
    { title: "Senior Backend Engineer", company: "Tokopedia", required: ["Node.js", "PostgreSQL", "AWS", "Docker"], preferred: ["Kubernetes"], salaryMin: 18000000, salaryMax: 25000000, seniority: "Senior", industry: "Technology", workplace: "HYBRID" as const, source: linkedin },
    { title: "Full Stack Engineer", company: "Shopee", required: ["React", "Node.js", "TypeScript"], preferred: ["GraphQL"], salaryMin: 15000000, salaryMax: 22000000, seniority: "Mid", industry: "Technology", workplace: "ONSITE" as const, source: manualSource },
    { title: "Data Engineer", company: "Traveloka", required: ["Python", "SQL", "Spark"], preferred: ["Airflow"], salaryMin: 20000000, salaryMax: 30000000, seniority: "Senior", industry: "Technology", workplace: "REMOTE" as const, source: manualSource },
  ];

  const matchProfile = {
    skills: skills.map((s) => ({ name: s, level: "ADVANCED", years: 4 })),
    totalExperienceYears: 4, preferredTitles: ["Backend Engineer", "Software Engineer"],
    targetLocations: ["Jakarta", "Remote"], workplaceTypes: ["REMOTE", "HYBRID"],
    expectedSalaryMin: 15000000, targetIndustries: ["Technology"], seniority: ["MID", "SENIOR"],
  };

  for (const spec of jobSpecs) {
    const company = await prisma.company.create({
      data: { userId: user.id, name: spec.company, industry: spec.industry, size: "1000+", headquarters: "Jakarta" },
    });
    const match = computeMatch(matchProfile, {
      title: spec.title, requiredSkills: spec.required, preferredSkills: spec.preferred,
      experienceYears: 5, location: "Jakarta", workplaceType: spec.workplace,
      salaryMin: spec.salaryMin, salaryMax: spec.salaryMax, industry: spec.industry, seniority: spec.seniority,
    });
    const job = await prisma.job.create({
      data: {
        userId: user.id, companyId: company.id, sourceId: spec.source?.id,
        title: spec.title, location: "Jakarta", workplaceType: spec.workplace, employmentType: "FULL_TIME",
        salaryMin: spec.salaryMin, salaryMax: spec.salaryMax, currency: "IDR", seniority: spec.seniority,
        industry: spec.industry, preferredSkills: spec.preferred,
        matchScore: match.score, matchReasons: match as unknown as object,
      },
    });
    for (const sn of spec.required) {
      const skill = await prisma.skill.upsert({ where: { name: sn }, create: { name: sn }, update: {} });
      await prisma.jobSkill.create({ data: { jobId: job.id, skillId: skill.id, required: true } });
    }
    // Application for the first job
    if (spec.company === "Tokopedia") {
      const app = await prisma.application.create({
        data: {
          userId: user.id, jobId: job.id, companyId: company.id, status: "INTERVIEW",
          matchScore: match.score, matchedSkills: match.matchedSkills, missingSkills: match.missingSkills,
          appliedAt: new Date(Date.now() - 5 * 86400000),
        },
      });
      await prisma.applicationEvent.createMany({
        data: [
          { applicationId: app.id, action: "Job discovered" },
          { applicationId: app.id, action: "Match score calculated", newValue: String(match.score) },
          { applicationId: app.id, action: "Application submitted", newValue: "APPLIED", actor: "user" },
          { applicationId: app.id, action: "Status changed", oldValue: "APPLIED", newValue: "INTERVIEW", actor: "user" },
        ],
      });
    }
  }

  await prisma.notification.create({
    data: { userId: user.id, type: "new_match", title: "New highly matched job", message: "Senior Backend Engineer at Tokopedia scored high." },
  });

  console.log(`Seeded demo user: ${email} / password123`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
