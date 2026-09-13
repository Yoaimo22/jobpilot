/**
 * JobDiscoveryService — the automation loop (spec §3, §4, §15, §31).
 *
 * One run: fetch from every enabled source → drop duplicates → score against
 * the user's profile → apply the automation rules → optionally PREPARE an
 * application for high scorers → notify.
 *
 * IMPORTANT: this never SUBMITS an application. Preparation stops at
 * READY_TO_APPLY so the user approves the send themselves. Automated
 * submission to platforms whose ToS forbids it is deliberately not implemented.
 */
import { prisma } from "@/lib/prisma";
import { fetchSource } from "@/modules/jobs/sources";
import { computeMatch } from "@/modules/matching/match-engine";
import { buildMatchProfile } from "@/modules/jobs/service";
import { createApplication } from "@/modules/applications/service";
import { notify } from "@/modules/notifications/service";
import type { NormalizedJob } from "@/modules/jobs/providers";
import { KNOWN_SOURCES } from "@/modules/jobs/providers";

export interface DiscoveryReport {
  sourcesRun: number;
  fetched: number;
  imported: number;
  duplicates: number;
  filtered: number;
  prepared: number;
  highMatches: number;
  errors: { source: string; error: string }[];
  topJobs: { title: string; company: string; score: number }[];
}

const norm = (s: string) => s.trim().toLowerCase();

export async function runDiscovery(userId: string): Promise<DiscoveryReport> {
  const report: DiscoveryReport = {
    sourcesRun: 0, fetched: 0, imported: 0, duplicates: 0,
    filtered: 0, prepared: 0, highMatches: 0, errors: [], topJobs: [],
  };

  const [rule, pref, sources] = await Promise.all([
    prisma.automationRule.upsert({ where: { userId }, create: { userId }, update: {} }),
    prisma.jobPreference.findUnique({ where: { userId } }),
    prisma.discoverySource.findMany({ where: { userId, enabled: true } }),
  ]);

  if (!rule.autoDiscoverEnabled) return report;
  if (!sources.length) return report;

  // Existing accounts predate the API-based sources, so make sure the
  // reference rows exist before we try to attribute jobs to them.
  await prisma.jobSource.createMany({
    data: KNOWN_SOURCES.map((s) => ({ key: s.key, name: s.name, supportsApply: s.supportsApply })),
    skipDuplicates: true,
  });

  const keywords = (pref?.targetJobTitles ?? []).map((t) => t.trim()).filter(Boolean);

  // 1. Fetch every source (in parallel, failures isolated)
  const results = await Promise.all(
    sources.map(async (s) => {
      const r = await fetchSource(s.kind, s.identifier, keywords);
      await prisma.discoverySource.update({
        where: { id: s.id },
        data: {
          lastRunAt: new Date(),
          lastCount: r.jobs.length,
          lastError: r.error ?? null,
        },
      });
      return { source: s, ...r };
    })
  );

  report.sourcesRun = results.length;
  for (const r of results) {
    if (r.error) report.errors.push({ source: `${r.source.kind}:${r.source.identifier || "-"}`, error: r.error });
    report.fetched += r.jobs.length;
  }

  // 2. Existing keys for duplicate detection (spec §14)
  const existing = await prisma.job.findMany({
    where: { userId },
    select: { externalId: true, originalUrl: true, title: true, company: { select: { name: true } } },
  });
  const seenUrls = new Set(existing.map((j) => j.originalUrl).filter(Boolean) as string[]);
  const seenExt = new Set(existing.map((j) => j.externalId).filter(Boolean) as string[]);
  const seenPair = new Set(existing.map((j) => `${norm(j.title)}|${norm(j.company?.name ?? "")}`));

  const matchProfile = await buildMatchProfile(userId);

  const excludedCompanies = rule.excludedCompanies.map(norm);
  const excludedKeywords = rule.excludedKeywords.map(norm);
  const excludedTitles = rule.excludedJobTitles.map(norm);

  const candidates: { job: NormalizedJob; score: number; sourceKind: string }[] = [];

  for (const r of results) {
    for (const j of r.jobs) {
      if (candidates.length + report.imported >= rule.maxJobsPerRun) break;

      // ── duplicate checks ──
      const pairKey = `${norm(j.title)}|${norm(j.companyName)}`;
      if (
        (j.originalUrl && seenUrls.has(j.originalUrl)) ||
        (j.externalId && seenExt.has(j.externalId)) ||
        seenPair.has(pairKey)
      ) {
        report.duplicates += 1;
        continue;
      }

      // ── rule filters (spec §15) ──
      const haystack = norm(`${j.title} ${j.description ?? ""}`);
      if (excludedCompanies.includes(norm(j.companyName))) { report.filtered += 1; continue; }
      if (excludedKeywords.some((k) => k && haystack.includes(k))) { report.filtered += 1; continue; }
      if (excludedTitles.some((t) => t && norm(j.title).includes(t))) { report.filtered += 1; continue; }
      if (rule.remoteOnly && j.workplaceType !== "REMOTE") { report.filtered += 1; continue; }

      // ── score it ──
      const match = computeMatch(matchProfile, {
        title: j.title,
        requiredSkills: j.requiredSkills ?? [],
        preferredSkills: j.preferredSkills ?? [],
        experienceYears: j.experienceYears ?? null,
        location: j.location ?? null,
        workplaceType: j.workplaceType ?? "UNKNOWN",
        salaryMin: j.salaryMin ?? null,
        salaryMax: j.salaryMax ?? null,
        industry: j.industry ?? null,
        seniority: j.seniority ?? null,
      });

      candidates.push({ job: j, score: match.score, sourceKind: r.source.kind });
      seenPair.add(pairKey);
      if (j.originalUrl) seenUrls.add(j.originalUrl);
    }
  }

  // 3. Best first, so the per-run cap keeps the most relevant jobs
  candidates.sort((a, b) => b.score - a.score);

  const sourceRows = await prisma.jobSource.findMany();
  const sourceIdByKey = new Map(sourceRows.map((s) => [s.key, s.id]));

  for (const c of candidates.slice(0, rule.maxJobsPerRun)) {
    const j = c.job;
    try {
      const company = await prisma.company.upsert({
        where: { userId_name: { userId, name: j.companyName } },
        create: { userId, name: j.companyName, website: j.companyWebsite || null },
        update: {},
      });

      const match = computeMatch(matchProfile, {
        title: j.title,
        requiredSkills: j.requiredSkills ?? [],
        preferredSkills: j.preferredSkills ?? [],
        experienceYears: j.experienceYears ?? null,
        location: j.location ?? null,
        workplaceType: j.workplaceType ?? "UNKNOWN",
        salaryMin: j.salaryMin ?? null,
        salaryMax: j.salaryMax ?? null,
        industry: j.industry ?? null,
        seniority: j.seniority ?? null,
      });

      const created = await prisma.job.create({
        data: {
          userId,
          companyId: company.id,
          sourceId: sourceIdByKey.get(c.sourceKind) ?? sourceIdByKey.get("manual") ?? null,
          externalId: j.externalId || null,
          title: j.title,
          location: j.location || null,
          workplaceType: (j.workplaceType ?? "UNKNOWN") as never,
          employmentType: (j.employmentType ?? "UNKNOWN") as never,
          salaryMin: j.salaryMin ?? null,
          salaryMax: j.salaryMax ?? null,
          description: j.description || null,
          preferredSkills: j.preferredSkills ?? [],
          originalUrl: j.originalUrl || null,
          datePosted: j.datePosted ? new Date(j.datePosted) : null,
          industry: j.industry || null,
          matchScore: match.score,
          matchReasons: match as unknown as object,
        },
      });

      // attach required skills
      for (const name of (j.requiredSkills ?? []).slice(0, 15)) {
        const trimmed = name.trim();
        if (!trimmed) continue;
        const skill = await prisma.skill.upsert({
          where: { name: trimmed }, create: { name: trimmed }, update: {},
        });
        await prisma.jobSkill.upsert({
          where: { jobId_skillId: { jobId: created.id, skillId: skill.id } },
          create: { jobId: created.id, skillId: skill.id, required: true },
          update: {},
        });
      }

      report.imported += 1;
      if (match.score >= 90) report.highMatches += 1;
      if (report.topJobs.length < 5) {
        report.topJobs.push({ title: j.title, company: j.companyName, score: match.score });
      }

      // 4. Auto-PREPARE (never submit) when it clears the threshold.
      // createApplication re-runs the full guard: duplicate / blacklist /
      // CV-present / daily+weekly limits all still apply.
      if (rule.autoPrepareEnabled && match.score >= rule.minMatchScore) {
        const res = await createApplication(userId, created.id);
        if (res.created) report.prepared += 1;
      }
    } catch (e) {
      report.errors.push({
        source: c.sourceKind,
        error: e instanceof Error ? e.message.slice(0, 200) : "import failed",
      });
    }
  }

  await prisma.automationRule.update({
    where: { userId },
    data: { lastDiscoveryAt: new Date() },
  });

  await prisma.automationLog.create({
    data: {
      userId,
      action: "discovery_run",
      level: report.errors.length ? "warn" : "info",
      message: `Imported ${report.imported} of ${report.fetched} fetched; ${report.prepared} prepared; ${report.duplicates} duplicates skipped.`,
      metadata: report as unknown as object,
    },
  });

  if (report.imported > 0) {
    await notify(
      userId,
      "new_match",
      `${report.imported} new job(s) found`,
      report.prepared > 0
        ? `${report.prepared} application(s) prepared and waiting for your approval in the queue.`
        : `Found ${report.imported} job(s), ${report.highMatches} scoring 90%+.`,
      report.prepared > 0 ? "/dashboard/queue" : "/dashboard/recommended"
    );
  }

  return report;
}
