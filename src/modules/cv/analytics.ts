/**
 * CV performance analytics (spec §38 Phase 6 — analytics + historical performance).
 *
 * Every figure here is aggregated from stored rows: CvJobMatch, CvEvidence,
 * CvAnalysis, CvRecommendation, CvVersion, and Application. Nothing is
 * estimated or invented, and an insight is only emitted when the underlying
 * data actually supports it.
 */
import { prisma } from "@/lib/prisma";

export interface PerCvRow {
  resumeId: string;
  name: string;
  isDefault: boolean;
  parsedAt: Date | null;
  matchCount: number;
  avgOverall: number | null;
  avgQualification: number | null;
  avgPresentation: number | null;
  bestOverall: number | null;
  bestJobTitle: string | null;
  bestJobId: string | null;
  /** Evidence composition — what the CV proves, and how strongly. */
  direct: number;
  related: number;
  inferred: number;
  sectionScores: Record<string, number>;
  overallCvScore: number | null;
  /** Real application outcomes for applications that used this CV. */
  applications: number;
  interviews: number;
  offers: number;
  responses: number;
}

export interface CvAnalyticsResult {
  hasData: boolean;
  perCv: PerCvRow[];
  recommendations: {
    total: number;
    accepted: number;
    rejected: number;
    pending: number;
    blocked: number;
    byType: { name: string; value: number }[];
    acceptanceRate: number;
    avgImpactAccepted: number;
  };
  versions: {
    total: number;
    withScores: number;
    avgGain: number | null;
    bestGain: number | null;
    byTemplate: { name: string; value: number }[];
    timeline: { name: string; before: number; after: number }[];
  };
  /** Skills required by jobs that the CV genuinely lacks (real gaps). */
  realGaps: { name: string; value: number }[];
  /** Skills the CV proves but never states — fixable by wording. */
  wordingOpportunities: { name: string; value: number }[];
  presentationGap: {
    avgQualification: number | null;
    avgPresentation: number | null;
    /** Positive = presentation lags behind ability. */
    gap: number | null;
  };
  insights: string[];
}

const INTERVIEW_STATES = ["INTERVIEW", "TECHNICAL_TEST", "OFFERING", "ACCEPTED"];
const OFFER_STATES = ["OFFERING", "ACCEPTED"];
const RESPONSE_STATES = [
  "VIEWED", "RECRUITER_CONTACTED", "INTERVIEW", "TECHNICAL_TEST",
  "OFFERING", "ACCEPTED", "REJECTED",
];

export async function getCvAnalytics(userId: string): Promise<CvAnalyticsResult> {
  const [resumes, matches, recs, versions, applications] = await Promise.all([
    prisma.resume.findMany({
      where: { userId },
      include: {
        evidence: { select: { kind: true, skill: true } },
        analyses: { select: { section: true, score: true } },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    prisma.cvJobMatch.findMany({
      where: { resume: { userId } },
      include: { job: { select: { id: true, title: true } } },
    }),
    prisma.cvRecommendation.findMany({
      where: { resume: { userId } },
      select: { recommendationType: true, status: true, estimatedImpact: true },
    }),
    prisma.cvVersion.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { label: true, template: true, matchBefore: true, matchAfter: true, createdAt: true },
    }),
    prisma.application.findMany({
      where: { userId, resumeId: { not: null } },
      select: { resumeId: true, status: true },
    }),
  ]);

  // ── per-CV rollup ──
  const perCv: PerCvRow[] = resumes.map((r) => {
    const m = matches.filter((x) => x.resumeId === r.id);
    const apps = applications.filter((a) => a.resumeId === r.id);
    const best = m.reduce<typeof m[number] | null>(
      (acc, cur) => (!acc || cur.overall > acc.overall ? cur : acc),
      null
    );
    const sections: Record<string, number> = {};
    for (const a of r.analyses) sections[a.section] = a.score;

    return {
      resumeId: r.id,
      name: r.name,
      isDefault: r.isDefault,
      parsedAt: r.parsedAt,
      matchCount: m.length,
      avgOverall: m.length ? round(avg(m.map((x) => x.overall))) : null,
      avgQualification: m.length ? round(avg(m.map((x) => x.qualificationScore))) : null,
      avgPresentation: m.length ? round(avg(m.map((x) => x.presentationScore))) : null,
      bestOverall: best?.overall ?? null,
      bestJobTitle: best?.job?.title ?? null,
      bestJobId: best?.job?.id ?? null,
      direct: r.evidence.filter((e) => e.kind === "DIRECT_SKILL").length,
      related: r.evidence.filter((e) => e.kind === "RELATED_COMPETENCY").length,
      inferred: r.evidence.filter((e) => e.kind === "INFERRED_COMPETENCY").length,
      sectionScores: sections,
      overallCvScore: sections.overall ?? null,
      applications: apps.length,
      interviews: apps.filter((a) => INTERVIEW_STATES.includes(a.status)).length,
      offers: apps.filter((a) => OFFER_STATES.includes(a.status)).length,
      responses: apps.filter((a) => RESPONSE_STATES.includes(a.status)).length,
    };
  });

  // ── recommendation honesty metrics ──
  const accepted = recs.filter((r) => r.status === "ACCEPTED" || r.status === "MODIFIED");
  const blocked = recs.filter((r) => r.recommendationType === "NOT_ALLOWED");
  const typeCounts = new Map<string, number>();
  for (const r of recs) typeCounts.set(r.recommendationType, (typeCounts.get(r.recommendationType) ?? 0) + 1);

  const decided = recs.filter((r) => r.status !== "PENDING").length;

  // ── version performance ──
  const scored = versions.filter((v) => v.matchBefore != null && v.matchAfter != null);
  const gains = scored.map((v) => v.matchAfter! - v.matchBefore!);
  const tplCounts = new Map<string, number>();
  for (const v of versions) tplCounts.set(v.template, (tplCounts.get(v.template) ?? 0) + 1);

  // ── aggregate gaps across every computed match ──
  //
  // A gap is only REAL when no CV of the user's proves the skill and the user
  // has not confirmed it. Counting per-CV misses would otherwise report
  // "you lack Node.js" just because a Frontend CV omits it, which is a false
  // claim about the person rather than about one document.
  const provenAnywhere = new Set<string>();
  for (const r of resumes) {
    for (const e of r.evidence) {
      // Only DIRECT and RELATED count as owned; INFERRED is still unconfirmed.
      if (e.kind === "DIRECT_SKILL" || e.kind === "RELATED_COMPETENCY") {
        provenAnywhere.add(e.skill.toLowerCase());
      }
    }
  }
  const confirmedYes = await prisma.userVerifiedSkill.findMany({
    where: { userId, confirmation: "YES" },
    select: { skill: true },
  });
  for (const v of confirmedYes) provenAnywhere.add(v.skill.toLowerCase());

  const gapCounts = new Map<string, number>();
  const wordingCounts = new Map<string, number>();
  for (const m of matches) {
    for (const s of m.missing) {
      if (provenAnywhere.has(s.toLowerCase())) {
        // Proven by another CV → this document just omits it, so it is a
        // wording / CV-choice issue rather than a capability gap.
        wordingCounts.set(s, (wordingCounts.get(s) ?? 0) + 1);
        continue;
      }
      gapCounts.set(s, (gapCounts.get(s) ?? 0) + 1);
    }
    const proven = new Set([...m.matchedExact, ...m.matchedRelated].map((s) => s.toLowerCase()));
    for (const s of m.atsMissing) {
      if (proven.has(s.toLowerCase())) wordingCounts.set(s, (wordingCounts.get(s) ?? 0) + 1);
    }
  }

  const withMatches = perCv.filter((p) => p.matchCount > 0);
  const avgQual = withMatches.length ? round(avg(withMatches.map((p) => p.avgQualification!))) : null;
  const avgPres = withMatches.length ? round(avg(withMatches.map((p) => p.avgPresentation!))) : null;

  const result: CvAnalyticsResult = {
    hasData: matches.length > 0 || recs.length > 0 || versions.length > 0,
    perCv,
    recommendations: {
      total: recs.length,
      accepted: accepted.length,
      rejected: recs.filter((r) => r.status === "REJECTED").length,
      pending: recs.filter((r) => r.status === "PENDING").length,
      blocked: blocked.length,
      byType: [...typeCounts.entries()].map(([name, value]) => ({ name: label(name), value })),
      acceptanceRate: decided ? round((accepted.length / decided) * 100) : 0,
      avgImpactAccepted: accepted.length ? round(avg(accepted.map((r) => r.estimatedImpact))) : 0,
    },
    versions: {
      total: versions.length,
      withScores: scored.length,
      avgGain: gains.length ? round(avg(gains)) : null,
      bestGain: gains.length ? Math.max(...gains) : null,
      byTemplate: [...tplCounts.entries()].map(([name, value]) => ({ name, value })),
      timeline: scored.slice(-12).map((v) => ({
        name: v.label.length > 22 ? v.label.slice(0, 22) + "…" : v.label,
        before: v.matchBefore!,
        after: v.matchAfter!,
      })),
    },
    realGaps: topN(gapCounts, 10),
    wordingOpportunities: topN(wordingCounts, 10),
    presentationGap: {
      avgQualification: avgQual,
      avgPresentation: avgPres,
      gap: avgQual != null && avgPres != null ? round(avgQual - avgPres) : null,
    },
    insights: [],
  };

  result.insights = buildInsights(result);
  return result;
}

function buildInsights(r: CvAnalyticsResult): string[] {
  const out: string[] = [];
  const analysed = r.perCv.filter((p) => p.parsedAt);
  const withMatches = r.perCv.filter((p) => p.matchCount > 0);

  if (!analysed.length) {
    return ["Belum ada CV yang dianalisis. Jalankan AI CV Analysis dulu agar data performa terkumpul."];
  }
  if (!withMatches.length) {
    out.push("CV sudah dianalisis, tetapi belum pernah dicocokkan ke lowongan. Klik “Hitung ulang skor” untuk mengisi data ini.");
  }

  // Best performing CV — only when there is something to compare.
  if (withMatches.length >= 2) {
    const best = [...withMatches].sort((a, b) => (b.avgOverall ?? 0) - (a.avgOverall ?? 0))[0];
    out.push(`CV dengan skor rata-rata tertinggi adalah “${best.name}” (${best.avgOverall}% dari ${best.matchCount} lowongan).`);
  } else if (withMatches.length === 1) {
    const only = withMatches[0];
    out.push(`“${only.name}” rata-rata mencapai ${only.avgOverall}% terhadap ${only.matchCount} lowongan yang dihitung.`);
  }

  // Presentation vs qualification — the core message of the module.
  if (r.presentationGap.gap != null && r.presentationGap.gap >= 8) {
    out.push(
      `Kemampuan Anda (${r.presentationGap.avgQualification}%) lebih tinggi daripada cara CV menyajikannya (${r.presentationGap.avgPresentation}%). Selisih ${r.presentationGap.gap} poin ini bisa diperbaiki lewat kata, tanpa menambah skill baru.`
    );
  } else if (r.presentationGap.gap != null && r.presentationGap.gap <= -5) {
    out.push(
      `CV Anda sudah menyajikan diri lebih kuat (${r.presentationGap.avgPresentation}%) daripada kualifikasi yang terbukti (${r.presentationGap.avgQualification}%). Fokus berikutnya sebaiknya menambah kemampuan nyata, bukan kata.`
    );
  }

  // Honest gap list.
  if (r.realGaps.length) {
    const top = r.realGaps.slice(0, 3).map((g) => `${g.name} (${g.value}x)`).join(", ");
    out.push(`Skill yang paling sering diminta tetapi belum Anda miliki: ${top}. Ini gap nyata — tidak akan ditambahkan ke CV.`);
  }
  if (r.wordingOpportunities.length) {
    const top = r.wordingOpportunities.slice(0, 3).map((g) => g.name).join(", ");
    out.push(`Anda punya bukti untuk ${top}, tetapi CV belum menyebutnya dengan istilah yang dipakai lowongan.`);
  }

  // Guard activity — a trust signal, not a failure.
  if (r.recommendations.blocked > 0) {
    out.push(`Sistem memblokir ${r.recommendations.blocked} rekomendasi karena mengandung klaim tanpa bukti di CV Anda.`);
  }

  // Version effectiveness.
  if (r.versions.withScores >= 1 && r.versions.avgGain != null) {
    out.push(
      r.versions.avgGain > 0
        ? `Rata-rata optimasi menaikkan skor ${r.versions.avgGain} poin (terbaik +${r.versions.bestGain}).`
        : `Versi optimasi belum menaikkan skor secara berarti (${r.versions.avgGain} poin). Coba mode Aggressive ATS atau perbaiki bagian dengan skor terendah.`
    );
  }

  // Real outcomes, only when applications exist.
  const withApps = r.perCv.filter((p) => p.applications > 0);
  if (withApps.length) {
    const bestOutcome = [...withApps].sort((a, b) => b.interviews - a.interviews)[0];
    if (bestOutcome.interviews > 0) {
      out.push(`“${bestOutcome.name}” menghasilkan ${bestOutcome.interviews} panggilan interview dari ${bestOutcome.applications} lamaran.`);
    } else {
      const total = withApps.reduce((s, p) => s + p.applications, 0);
      out.push(`${total} lamaran terkirim, belum ada yang mencapai tahap interview.`);
    }
  }

  // Weakest section across analysed CVs.
  const sectionAvgs = new Map<string, number[]>();
  for (const p of analysed) {
    for (const [sec, sc] of Object.entries(p.sectionScores)) {
      if (sec === "overall") continue;
      sectionAvgs.set(sec, [...(sectionAvgs.get(sec) ?? []), sc]);
    }
  }
  const weakest = [...sectionAvgs.entries()]
    .map(([sec, arr]) => ({ sec, score: avg(arr) }))
    .sort((a, b) => a.score - b.score)[0];
  if (weakest && weakest.score < 70) {
    out.push(`Bagian terlemah CV Anda: ${weakest.sec} (rata-rata ${Math.round(weakest.score)}/100).`);
  }

  return out;
}

/** Recompute and persist matches so the analytics have data to aggregate. */
export async function recomputeAllMatches(userId: string, maxJobs = 25) {
  const { matchResumeToJob } = await import("./service");

  const resumes = await prisma.resume.findMany({
    where: { userId, parsedAt: { not: null } },
    select: { id: true },
  });
  const jobs = await prisma.job.findMany({
    where: { userId },
    orderBy: { matchScore: "desc" },
    take: maxJobs,
    select: { id: true },
  });

  let computed = 0;
  const failures: string[] = [];
  for (const r of resumes) {
    for (const j of jobs) {
      try {
        await matchResumeToJob(userId, r.id, j.id);
        computed += 1;
      } catch (e) {
        failures.push(e instanceof Error ? e.message.slice(0, 120) : "unknown");
      }
    }
  }
  return { resumes: resumes.length, jobs: jobs.length, computed, failures: failures.slice(0, 3) };
}

// ── helpers ──
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Top-N by count, merging case variants. Job feeds spell skills inconsistently
 * ("PostgreSQL" vs "Postgresql"), which would otherwise render as two bars for
 * the same skill. The variant with more capitals wins, since that is usually
 * the correct branding.
 */
function topN(map: Map<string, number>, n: number) {
  const merged = new Map<string, { name: string; value: number }>();
  for (const [name, value] of map) {
    const key = name.toLowerCase();
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { name, value });
      continue;
    }
    const upper = (s: string) => (s.match(/[A-Z]/g) ?? []).length;
    merged.set(key, {
      name: upper(name) > upper(prev.name) ? name : prev.name,
      value: prev.value + value,
    });
  }
  return [...merged.values()].sort((a, b) => b.value - a.value).slice(0, n);
}

function label(type: string) {
  switch (type) {
    case "SAFE_REWRITE": return "Aman (perbaikan kata)";
    case "RELATED_SKILL": return "Terkait pengalaman nyata";
    case "REQUIRES_CONFIRMATION": return "Perlu konfirmasi";
    case "NOT_ALLOWED": return "Diblokir (tanpa bukti)";
    default: return type;
  }
}
