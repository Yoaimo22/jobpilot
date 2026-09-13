import { z } from "zod";

export const profileSchema = z.object({
  fullName: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable().or(z.literal("")),
  portfolioUrl: z.string().url().optional().nullable().or(z.literal("")),
  githubUrl: z.string().url().optional().nullable().or(z.literal("")),
  professionalSummary: z.string().max(4000).optional().nullable(),
  languages: z.array(z.string()).default([]),
});

export const skillSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]).default("INTERMEDIATE"),
  years: z.number().min(0).max(60).optional().nullable(),
  category: z.string().max(50).optional().nullable(),
});

export const jobPreferenceSchema = z.object({
  expectedSalaryMin: z.number().int().min(0).optional().nullable(),
  expectedSalaryMax: z.number().int().min(0).optional().nullable(),
  currency: z.string().default("IDR"),
  employmentTypes: z.array(z.string()).default([]),
  workplaceTypes: z.array(z.string()).default([]),
  targetLocations: z.array(z.string()).default([]),
  targetIndustries: z.array(z.string()).default([]),
  targetJobTitles: z.array(z.string()).default([]),
  seniority: z.array(z.string()).default([]),
  avoidedCompanies: z.array(z.string()).default([]),
  avoidedKeywords: z.array(z.string()).default([]),
  requiredSkills: z.array(z.string()).default([]),
});

export const jobSchema = z.object({
  title: z.string().min(1).max(300),
  companyName: z.string().min(1).max(200),
  companyWebsite: z.string().url().optional().nullable().or(z.literal("")),
  location: z.string().max(200).optional().nullable(),
  workplaceType: z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"]).default("UNKNOWN"),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "FREELANCE", "UNKNOWN"])
    .default("UNKNOWN"),
  salaryMin: z.number().int().min(0).optional().nullable(),
  salaryMax: z.number().int().min(0).optional().nullable(),
  currency: z.string().default("IDR"),
  description: z.string().max(20000).optional().nullable(),
  requirements: z.string().max(20000).optional().nullable(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  experienceYears: z.number().int().min(0).max(60).optional().nullable(),
  educationRequirement: z.string().max(300).optional().nullable(),
  originalUrl: z.string().url().optional().nullable().or(z.literal("")),
  externalId: z.string().max(200).optional().nullable(),
  sourceKey: z.string().default("manual"),
  seniority: z.string().max(50).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  datePosted: z.string().optional().nullable(),
  applicationDeadline: z.string().optional().nullable(),
  easyApply: z.boolean().default(false),
  recruiterName: z.string().max(200).optional().nullable(),
});

export const automationRuleSchema = z.object({
  minMatchScore: z.number().int().min(0).max(100).default(85),
  maxApplicationsPerDay: z.number().int().min(1).max(200).default(10),
  maxApplicationsPerWeek: z.number().int().min(1).max(1000).default(50),
  maxApplicationsPerCompany: z.number().int().min(1).max(100).default(2),
  companyWindowDays: z.number().int().min(1).max(365).default(30),
  minSalary: z.number().int().min(0).optional().nullable(),
  locations: z.array(z.string()).default([]),
  remoteOnly: z.boolean().default(false),
  preferredJobTitles: z.array(z.string()).default([]),
  excludedJobTitles: z.array(z.string()).default([]),
  excludedCompanies: z.array(z.string()).default([]),
  excludedKeywords: z.array(z.string()).default([]),
  applyMode: z.enum(["MANUAL", "ASSISTED", "AUTO"]).default("MANUAL"),
  followUpIntervalDays: z.number().int().min(1).max(365).default(7),
});

export const applicationStatusEnum = z.enum([
  "DISCOVERED",
  "INTERESTED",
  "PREPARING",
  "READY_TO_APPLY",
  "AWAITING_REVIEW",
  "REQUIRES_USER_INPUT",
  "APPLIED",
  "VIEWED",
  "RECRUITER_CONTACTED",
  "INTERVIEW",
  "TECHNICAL_TEST",
  "OFFERING",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "FAILED",
]);

export const noteSchema = z.object({ content: z.string().min(1).max(4000) });

export const experienceSchema = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  current: z.boolean().default(false),
  description: z.string().max(4000).optional().nullable(),
});

export const educationSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().max(200).optional().nullable(),
  field: z.string().max(200).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
});

export const certificationSchema = z.object({
  name: z.string().min(1).max(200),
  issuer: z.string().max(200).optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  credentialId: z.string().max(200).optional().nullable(),
  url: z.string().url().optional().nullable().or(z.literal("")),
});

export const tagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().max(20).default("#6366f1"),
});

export type ProfileInput = z.infer<typeof profileSchema>;
export type SkillInput = z.infer<typeof skillSchema>;
export type JobInput = z.infer<typeof jobSchema>;
export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;
