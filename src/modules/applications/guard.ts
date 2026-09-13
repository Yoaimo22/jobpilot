/**
 * ApplicationGuard — enforces all safety checks BEFORE an application is
 * created or submitted. Runs at the service layer so the UI cannot bypass it
 * (spec §5, §14, §15, §16, §31).
 *
 * Returns a structured verdict; callers decide how to surface blocks/warnings.
 */
import { prisma } from "@/lib/prisma";
import { startOfDay, startOfWeek, subDays } from "date-fns";

export interface GuardCheck {
  key: string;
  label: string;
  passed: boolean;
  severity: "block" | "warn" | "info";
  detail: string;
}

export interface GuardResult {
  allowed: boolean; // false if any hard block failed
  hasWarnings: boolean;
  checks: GuardCheck[];
  duplicate?: { applicationId: string; appliedAt: Date | null };
}

interface GuardContext {
  userId: string;
  jobId: string;
}

export async function runApplicationGuard(
  ctx: GuardContext
): Promise<GuardResult> {
  const { userId, jobId } = ctx;

  const [job, rule, defaultResume] = await Promise.all([
    prisma.job.findFirst({
      where: { id: jobId, userId },
      include: { company: true },
    }),
    prisma.automationRule.findUnique({ where: { userId } }),
    prisma.resume.findFirst({ where: { userId, isDefault: true } }),
  ]);

  const checks: GuardCheck[] = [];

  if (!job) {
    return {
      allowed: false,
      hasWarnings: false,
      checks: [
        {
          key: "job_exists",
          label: "Job exists",
          passed: false,
          severity: "block",
          detail: "Job not found or not owned by you.",
        },
      ],
    };
  }

  const minScore = rule?.minMatchScore ?? 85;
  const now = new Date();

  // 1 & 3 & 4: Already applied? (unique by userId+jobId, but also check URL/externalId)
  const existing = await prisma.application.findFirst({
    where: {
      userId,
      OR: [
        { jobId },
        job.originalUrl ? { job: { originalUrl: job.originalUrl } } : { id: "___never" },
        job.externalId && job.sourceId
          ? { job: { externalId: job.externalId, sourceId: job.sourceId } }
          : { id: "___never" },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  checks.push({
    key: "not_duplicate",
    label: "Not already applied (Job ID / URL)",
    passed: !existing,
    severity: "block",
    detail: existing
      ? `Already applied on ${existing.appliedAt?.toDateString() ?? existing.createdAt.toDateString()}.`
      : "No prior application found.",
  });

  // 2: Company applied too many times recently?
  let companyWarn = false;
  if (job.companyId && rule) {
    const windowStart = subDays(now, rule.companyWindowDays);
    const companyCount = await prisma.application.count({
      where: {
        userId,
        companyId: job.companyId,
        createdAt: { gte: windowStart },
      },
    });
    companyWarn = companyCount >= rule.maxApplicationsPerCompany;
    checks.push({
      key: "company_limit",
      label: "Company application frequency",
      passed: !companyWarn,
      severity: "warn",
      detail: companyWarn
        ? `You have already applied to ${job.company?.name ?? "this company"} ${companyCount} time(s) in the last ${rule.companyWindowDays} days.`
        : `${companyCount} application(s) to this company recently.`,
    });
  }

  // 5: Meets minimum match score?
  const score = job.matchScore ?? null;
  const meetsScore = score != null ? score >= minScore : true;
  checks.push({
    key: "min_score",
    label: `Meets minimum match score (${minScore}%)`,
    passed: meetsScore,
    severity: score == null ? "info" : "block",
    detail:
      score == null
        ? "Match score not yet computed — compute it before auto-apply."
        : `Match score ${score}% vs threshold ${minScore}%.`,
  });

  // 6: Blacklisted company?
  const excludedCompanies = (rule?.excludedCompanies ?? []).map((c) => c.toLowerCase());
  const companyBlacklisted =
    !!job.company && excludedCompanies.includes(job.company.name.toLowerCase());
  checks.push({
    key: "company_blacklist",
    label: "Company not blacklisted",
    passed: !companyBlacklisted,
    severity: "block",
    detail: companyBlacklisted
      ? `${job.company?.name} is on your excluded-companies list.`
      : "Company is allowed.",
  });

  // 7: Blacklisted keyword in title/description?
  const excludedKeywords = (rule?.excludedKeywords ?? []).map((k) => k.toLowerCase());
  const haystack = `${job.title} ${job.description ?? ""}`.toLowerCase();
  const hitKeyword = excludedKeywords.find((k) => k && haystack.includes(k));
  checks.push({
    key: "keyword_blacklist",
    label: "No blacklisted keywords",
    passed: !hitKeyword,
    severity: "block",
    detail: hitKeyword
      ? `Contains excluded keyword "${hitKeyword}".`
      : "No excluded keywords found.",
  });

  // 8: Salary meets minimum?
  const minSalary = rule?.minSalary ?? null;
  const jobHigh = job.salaryMax ?? job.salaryMin ?? null;
  const salaryOk = minSalary == null || jobHigh == null || jobHigh >= minSalary;
  checks.push({
    key: "salary_min",
    label: "Salary meets minimum",
    passed: salaryOk,
    severity: minSalary == null || jobHigh == null ? "info" : "warn",
    detail:
      minSalary == null
        ? "No minimum salary set."
        : jobHigh == null
          ? "Job has no salary data."
          : `Job up to ${jobHigh.toLocaleString()} vs minimum ${minSalary.toLocaleString()}.`,
  });

  // 9: A suitable CV available?
  const hasResume = !!defaultResume;
  checks.push({
    key: "cv_available",
    label: "CV available",
    passed: hasResume,
    severity: "block",
    detail: hasResume
      ? `Default CV: ${defaultResume?.name}.`
      : "No default CV uploaded. Upload one in CV Manager.",
  });

  // Daily limit (§16)
  if (rule) {
    const dayStart = startOfDay(now);
    const appliedToday = await prisma.application.count({
      where: { userId, appliedAt: { gte: dayStart } },
    });
    const dayOk = appliedToday < rule.maxApplicationsPerDay;
    checks.push({
      key: "daily_limit",
      label: `Daily limit (${rule.maxApplicationsPerDay}/day)`,
      passed: dayOk,
      severity: "block",
      detail: `${appliedToday}/${rule.maxApplicationsPerDay} applied today.`,
    });

    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const appliedThisWeek = await prisma.application.count({
      where: { userId, appliedAt: { gte: weekStart } },
    });
    const weekOk = appliedThisWeek < rule.maxApplicationsPerWeek;
    checks.push({
      key: "weekly_limit",
      label: `Weekly limit (${rule.maxApplicationsPerWeek}/week)`,
      passed: weekOk,
      severity: "block",
      detail: `${appliedThisWeek}/${rule.maxApplicationsPerWeek} applied this week.`,
    });
  }

  const blocks = checks.filter((c) => c.severity === "block" && !c.passed);
  const warnings = checks.filter((c) => c.severity === "warn" && !c.passed);

  return {
    allowed: blocks.length === 0,
    hasWarnings: warnings.length > 0,
    checks,
    duplicate: existing
      ? { applicationId: existing.id, appliedAt: existing.appliedAt }
      : undefined,
  };
}
