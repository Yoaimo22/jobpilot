/**
 * AnalyticsService (§8, §12, §13) — every number is computed from the DB.
 * Nothing is fabricated: insights are only emitted when the underlying data
 * actually supports them.
 */
import { prisma } from "@/lib/prisma";
import { startOfDay, startOfWeek, startOfMonth, format, subDays } from "date-fns";

const APPLIED_STATUSES = [
  "APPLIED",
  "VIEWED",
  "RECRUITER_CONTACTED",
  "INTERVIEW",
  "TECHNICAL_TEST",
  "OFFERING",
  "ACCEPTED",
  "REJECTED",
] as const;

export async function getDashboardStats(userId: string) {
  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);

  // Reduced from 14 separate round-trips to 6. Each query crosses the network,
  // so on a serverless host far from the database the count matters a lot.
  const [jobsDiscovered, jobsMatched, highMatch, statusGroups, appliedDates, rule, followUpsDue] =
    await Promise.all([
      prisma.job.count({ where: { userId } }),
      prisma.job.count({ where: { userId, matchScore: { gte: 70 } } }),
      prisma.job.count({ where: { userId, matchScore: { gte: 90 } } }),
      // One query replaces six per-status counts.
      prisma.application.groupBy({
        by: ["status"],
        where: { userId },
        _count: { _all: true },
      }),
      // One query replaces the three date-window counts.
      prisma.application.findMany({
        where: { userId, appliedAt: { not: null } },
        select: { appliedAt: true },
      }),
      prisma.automationRule.findUnique({ where: { userId } }),
      prisma.followUpReminder.count({
        where: { userId, done: false, dueDate: { lte: now } },
      }),
    ]);

  const byStatus = new Map<string, number>(
    statusGroups.map((g) => [g.status as string, g._count._all])
  );
  const countOf = (...statuses: string[]) =>
    statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0);

  const totalApplications = statusGroups.reduce((sum, g) => sum + g._count._all, 0);

  const appliedToday = appliedDates.filter((a) => a.appliedAt! >= dayStart).length;
  const appliedWeek = appliedDates.filter((a) => a.appliedAt! >= weekStart).length;
  const appliedMonth = appliedDates.filter((a) => a.appliedAt! >= monthStart).length;

  return {
    jobsDiscovered,
    jobsMatched,
    highMatchJobs: highMatch,
    totalApplications,
    appliedToday,
    appliedWeek,
    appliedMonth,
    interviews: countOf("INTERVIEW"),
    techTests: countOf("TECHNICAL_TEST"),
    offers: countOf("OFFERING", "ACCEPTED"),
    rejections: countOf("REJECTED"),
    pending: countOf("PREPARING", "READY_TO_APPLY", "AWAITING_REVIEW", "REQUIRES_USER_INPUT"),
    followUpsDue,
    dailyLimit: rule?.maxApplicationsPerDay ?? 10,
  };
}

export async function getAnalytics(userId: string) {
  const apps = await prisma.application.findMany({
    where: { userId },
    select: {
      status: true,
      matchScore: true,
      appliedAt: true,
      createdAt: true,
      company: { select: { name: true, industry: true } },
      job: { select: { title: true, location: true, source: { select: { name: true } } } },
    },
  });

  const total = apps.length;
  const applied = apps.filter((a) => (APPLIED_STATUSES as readonly string[]).includes(a.status));
  const interviews = apps.filter((a) => a.status === "INTERVIEW").length;
  const offers = apps.filter((a) => ["OFFERING", "ACCEPTED"].includes(a.status)).length;
  const responded = apps.filter((a) =>
    ["VIEWED", "RECRUITER_CONTACTED", "INTERVIEW", "TECHNICAL_TEST", "OFFERING", "ACCEPTED", "REJECTED"].includes(
      a.status
    )
  ).length;

  // Time series — last 30 days by day
  const perDay = seriesByDay(apps.map((a) => a.appliedAt ?? a.createdAt), 30);

  const byPlatform = groupCount(apps.map((a) => a.job?.source?.name ?? "Manual"));
  const byCompany = groupCount(apps.map((a) => a.company?.name ?? "Unknown"));
  const byPosition = groupCount(apps.map((a) => a.job?.title ?? "Unknown"));
  const byLocation = groupCount(apps.map((a) => a.job?.location ?? "Unknown"));
  const byIndustry = groupCount(apps.map((a) => a.company?.industry ?? "Unknown"));
  const byStatus = groupCount(apps.map((a) => a.status));
  const scoreBuckets = matchScoreBuckets(apps.map((a) => a.matchScore));

  const appliedCount = applied.length || 0;
  const interviewConversion = appliedCount ? (interviews / appliedCount) * 100 : 0;
  const offerConversion = appliedCount ? (offers / appliedCount) * 100 : 0;
  const responseRate = appliedCount ? (responded / appliedCount) * 100 : 0;

  return {
    total,
    applied: appliedCount,
    interviews,
    offers,
    perDay,
    byPlatform,
    byCompany,
    byPosition,
    byLocation,
    byIndustry,
    byStatus,
    scoreBuckets,
    interviewConversion: round(interviewConversion),
    offerConversion: round(offerConversion),
    responseRate: round(responseRate),
    insights: buildInsights({ apps, byIndustry, interviews, appliedCount }),
  };
}

function buildInsights(ctx: {
  apps: { status: string; matchScore: number | null; job: { title: string | null } | null; company: { industry: string | null } | null }[];
  byIndustry: { name: string; value: number }[];
  interviews: number;
  appliedCount: number;
}): string[] {
  const out: string[] = [];
  const { apps, byIndustry } = ctx;

  // Interview rate by title — only if there is real data
  const titleInterview = new Map<string, { total: number; interviews: number }>();
  for (const a of apps) {
    const t = a.job?.title ?? "Unknown";
    const rec = titleInterview.get(t) ?? { total: 0, interviews: 0 };
    rec.total += 1;
    if (["INTERVIEW", "TECHNICAL_TEST", "OFFERING", "ACCEPTED"].includes(a.status)) rec.interviews += 1;
    titleInterview.set(t, rec);
  }
  const topTitle = [...titleInterview.entries()]
    .filter(([, v]) => v.interviews > 0)
    .sort((a, b) => b[1].interviews / b[1].total - a[1].interviews / a[1].total)[0];
  if (topTitle) {
    out.push(`You receive more interview invitations for ${topTitle[0]} positions.`);
  }

  // High-score interview lift
  const high = apps.filter((a) => (a.matchScore ?? 0) >= 90);
  const highInterviews = high.filter((a) => ["INTERVIEW", "TECHNICAL_TEST", "OFFERING", "ACCEPTED"].includes(a.status)).length;
  if (high.length >= 3 && highInterviews > 0) {
    out.push(`Jobs with match score above 90% led to ${highInterviews} interview(s) out of ${high.length} applications.`);
  }

  // Most-applied industry
  if (byIndustry.length && byIndustry[0].name !== "Unknown") {
    out.push(`Most applications were sent to ${byIndustry[0].name} companies.`);
  }

  if (!out.length) {
    out.push("Not enough data yet — apply to a few jobs to unlock insights.");
  }
  return out;
}

// ── helpers ──
function seriesByDay(dates: Date[], days: number) {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    map.set(format(subDays(new Date(), i), "MMM d"), 0);
  }
  for (const d of dates) {
    const key = format(d, "MMM d");
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

function groupCount(items: string[]) {
  const map = new Map<string, number>();
  for (const it of items) map.set(it, (map.get(it) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

function matchScoreBuckets(scores: (number | null)[]) {
  const buckets = { "0-49": 0, "50-69": 0, "70-79": 0, "80-89": 0, "90-100": 0 };
  for (const s of scores) {
    if (s == null) continue;
    if (s < 50) buckets["0-49"]++;
    else if (s < 70) buckets["50-69"]++;
    else if (s < 80) buckets["70-79"]++;
    else if (s < 90) buckets["80-89"]++;
    else buckets["90-100"]++;
  }
  return Object.entries(buckets).map(([name, value]) => ({ name, value }));
}

const round = (n: number) => Math.round(n * 10) / 10;
