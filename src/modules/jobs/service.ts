/**
 * JobService — create/import a job (upserting company + skills), and compute
 * its match score against the user's profile using the match engine.
 */
import { prisma } from "@/lib/prisma";
import type { JobInput } from "@/lib/validators";
import { computeMatch, type MatchProfile } from "@/modules/matching/match-engine";

/** Build the user's MatchProfile from the DB (profile + skills + prefs). */
export async function buildMatchProfile(userId: string): Promise<MatchProfile> {
  const [skills, pref, profile] = await Promise.all([
    prisma.userSkill.findMany({ where: { userId }, include: { skill: true } }),
    prisma.jobPreference.findUnique({ where: { userId } }),
    prisma.profile.findUnique({ where: { userId }, include: { experiences: true } }),
  ]);

  // Total experience = sum of experience durations in years (rough), fallback max skill years.
  let totalYears = 0;
  for (const e of profile?.experiences ?? []) {
    if (e.startDate) {
      const end = e.endDate ?? new Date();
      totalYears += Math.max(0, (end.getTime() - e.startDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
    }
  }
  if (totalYears === 0) {
    totalYears = Math.max(0, ...skills.map((s) => s.years ?? 0), 0);
  }

  return {
    skills: skills.map((s) => ({ name: s.skill.name, level: s.level, years: s.years })),
    totalExperienceYears: Math.round(totalYears * 10) / 10,
    preferredTitles: pref?.targetJobTitles ?? [],
    targetLocations: pref?.targetLocations ?? [],
    workplaceTypes: pref?.workplaceTypes ?? [],
    expectedSalaryMin: pref?.expectedSalaryMin ?? null,
    targetIndustries: pref?.targetIndustries ?? [],
    seniority: pref?.seniority ?? [],
  };
}

export async function createJob(userId: string, data: JobInput) {
  // Upsert company (scoped to user)
  const company = await prisma.company.upsert({
    where: { userId_name: { userId, name: data.companyName } },
    create: {
      userId,
      name: data.companyName,
      website: data.companyWebsite || null,
    },
    update: data.companyWebsite ? { website: data.companyWebsite } : {},
  });

  // Resolve source
  const source = await prisma.jobSource.findUnique({ where: { key: data.sourceKey } });

  // Compute match
  const matchProfile = await buildMatchProfile(userId);
  const match = computeMatch(matchProfile, {
    title: data.title,
    requiredSkills: data.requiredSkills,
    preferredSkills: data.preferredSkills,
    experienceYears: data.experienceYears ?? null,
    location: data.location ?? null,
    workplaceType: data.workplaceType,
    salaryMin: data.salaryMin ?? null,
    salaryMax: data.salaryMax ?? null,
    industry: data.industry ?? null,
    seniority: data.seniority ?? null,
  });

  const job = await prisma.job.create({
    data: {
      userId,
      companyId: company.id,
      sourceId: source?.id ?? null,
      externalId: data.externalId || null,
      title: data.title,
      location: data.location || null,
      workplaceType: data.workplaceType,
      employmentType: data.employmentType,
      salaryMin: data.salaryMin ?? null,
      salaryMax: data.salaryMax ?? null,
      currency: data.currency,
      description: data.description || null,
      requirements: data.requirements || null,
      preferredSkills: data.preferredSkills,
      experienceYears: data.experienceYears ?? null,
      educationRequirement: data.educationRequirement || null,
      originalUrl: data.originalUrl || null,
      seniority: data.seniority || null,
      industry: data.industry || null,
      easyApply: data.easyApply,
      recruiterName: data.recruiterName || null,
      datePosted: data.datePosted ? new Date(data.datePosted) : null,
      applicationDeadline: data.applicationDeadline ? new Date(data.applicationDeadline) : null,
      matchScore: match.score,
      matchReasons: match as unknown as object,
    },
  });

  // Attach required skills (upsert into Skill table)
  for (const skillName of data.requiredSkills) {
    const name = skillName.trim();
    if (!name) continue;
    const skill = await prisma.skill.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await prisma.jobSkill.upsert({
      where: { jobId_skillId: { jobId: job.id, skillId: skill.id } },
      create: { jobId: job.id, skillId: skill.id, required: true },
      update: {},
    });
  }

  return { job, match };
}

/** Recompute match for an existing job (e.g. after profile changes). */
export async function recomputeMatch(userId: string, jobId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
  if (!job) return null;
  const requiredSkills = (
    await prisma.jobSkill.findMany({ where: { jobId }, include: { skill: true } })
  ).map((s) => s.skill.name);

  const matchProfile = await buildMatchProfile(userId);
  const match = computeMatch(matchProfile, {
    title: job.title,
    requiredSkills,
    preferredSkills: job.preferredSkills,
    experienceYears: job.experienceYears,
    location: job.location,
    workplaceType: job.workplaceType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    industry: job.industry,
    seniority: job.seniority,
  });

  await prisma.job.update({
    where: { id: jobId },
    data: { matchScore: match.score, matchReasons: match as unknown as object },
  });
  return match;
}
