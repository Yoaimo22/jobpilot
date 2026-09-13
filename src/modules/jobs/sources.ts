/**
 * Job source fetchers — OFFICIAL / PUBLIC APIs ONLY.
 *
 * Every source here publishes a documented public JSON endpoint intended for
 * programmatic consumption. There is deliberately NO scraping, no headless
 * browser, and no LinkedIn / Indeed / Jobstreet / Glints adapter: those
 * platforms' Terms of Service prohibit automated access, and attempting it
 * risks the user's account (spec §3, §31).
 *
 * Each fetcher returns NormalizedJob[] and must never throw — errors are
 * returned so one bad source cannot abort a discovery run.
 */
import type { NormalizedJob } from "@/modules/jobs/providers";

export interface FetchResult {
  jobs: NormalizedJob[];
  error?: string;
}

const UA = "JobPilot/1.0 (personal job-application tracker)";
const TIMEOUT_MS = 12_000;

async function getJson<T>(url: string): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const stripHtml = (s: string | null | undefined) =>
  (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Pull likely skill tokens out of a description, for match scoring. */
const SKILL_VOCAB = [
  "javascript", "typescript", "python", "java", "go", "golang", "rust", "php", "ruby",
  "kotlin", "swift", "c#", "sql", "react", "next.js", "vue", "angular", "svelte",
  "node.js", "express", "nestjs", "django", "flask", "fastapi", "spring", "laravel",
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "docker", "kubernetes",
  "aws", "gcp", "azure", "terraform", "graphql", "kafka", "spark", "airflow", "tailwind",
];
function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const found = SKILL_VOCAB.filter((s) =>
    new RegExp(`(^|[^a-z0-9.+#])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9.+#]|$)`).test(lower)
  );
  return found.map((s) => (s === "c#" ? "C#" : s.charAt(0).toUpperCase() + s.slice(1)));
}

function inferWorkplace(text: string): NormalizedJob["workplaceType"] {
  const t = text.toLowerCase();
  if (t.includes("remote")) return "REMOTE";
  if (t.includes("hybrid")) return "HYBRID";
  if (t.includes("on-site") || t.includes("onsite")) return "ONSITE";
  return "UNKNOWN";
}

// ─────────────────────────────────────────────────────────────
// Remotive — https://remotive.com/api/remote-jobs  (public, no key)
// ─────────────────────────────────────────────────────────────
interface RemotiveJob {
  id: number; url: string; title: string; company_name: string;
  company_logo?: string; category?: string; job_type?: string;
  candidate_required_location?: string; salary?: string;
  description?: string; publication_date?: string;
}

export async function fetchRemotive(keywords: string[]): Promise<FetchResult> {
  try {
    const search = keywords[0] ? `&search=${encodeURIComponent(keywords[0])}` : "";
    const data = await getJson<{ jobs: RemotiveJob[] }>(
      `https://remotive.com/api/remote-jobs?limit=40${search}`
    );
    const jobs = (data.jobs ?? []).map<NormalizedJob>((j) => {
      const desc = stripHtml(j.description);
      return {
        externalId: String(j.id),
        title: j.title,
        companyName: j.company_name,
        location: j.candidate_required_location || "Remote",
        workplaceType: "REMOTE",
        employmentType:
          j.job_type === "full_time" ? "FULL_TIME"
          : j.job_type === "part_time" ? "PART_TIME"
          : j.job_type === "contract" ? "CONTRACT"
          : j.job_type === "internship" ? "INTERNSHIP"
          : "UNKNOWN",
        description: desc.slice(0, 8000),
        requiredSkills: extractSkills(`${j.title} ${desc}`),
        preferredSkills: [],
        originalUrl: j.url,
        datePosted: j.publication_date ?? null,
        industry: j.category ?? null,
      };
    });
    return { jobs };
  } catch (e) {
    return { jobs: [], error: e instanceof Error ? e.message : "Remotive fetch failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// Arbeitnow — https://www.arbeitnow.com/api/job-board-api (public, no key)
// ─────────────────────────────────────────────────────────────
interface ArbeitnowJob {
  slug: string; company_name: string; title: string; description?: string;
  remote?: boolean; url: string; tags?: string[]; job_types?: string[];
  location?: string; created_at?: number;
}

export async function fetchArbeitnow(): Promise<FetchResult> {
  try {
    const data = await getJson<{ data: ArbeitnowJob[] }>(
      "https://www.arbeitnow.com/api/job-board-api"
    );
    const jobs = (data.data ?? []).slice(0, 40).map<NormalizedJob>((j) => {
      const desc = stripHtml(j.description);
      return {
        externalId: j.slug,
        title: j.title,
        companyName: j.company_name,
        location: j.location ?? null,
        workplaceType: j.remote ? "REMOTE" : inferWorkplace(`${j.location ?? ""} ${desc}`),
        employmentType: j.job_types?.includes("full-time") ? "FULL_TIME" : "UNKNOWN",
        description: desc.slice(0, 8000),
        requiredSkills: extractSkills(`${j.title} ${desc} ${(j.tags ?? []).join(" ")}`),
        preferredSkills: [],
        originalUrl: j.url,
        datePosted: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
      };
    });
    return { jobs };
  } catch (e) {
    return { jobs: [], error: e instanceof Error ? e.message : "Arbeitnow fetch failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// Greenhouse job boards — https://boards-api.greenhouse.io/v1/boards/{token}/jobs
// Public board API, designed for embedding. No key required.
// ─────────────────────────────────────────────────────────────
interface GhJob {
  id: number; title: string; absolute_url: string; updated_at?: string;
  location?: { name?: string }; content?: string;
  metadata?: unknown;
}

export async function fetchGreenhouse(boardToken: string): Promise<FetchResult> {
  try {
    const data = await getJson<{ jobs: GhJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`
    );
    const jobs = (data.jobs ?? []).slice(0, 40).map<NormalizedJob>((j) => {
      const desc = stripHtml(decodeHtml(j.content ?? ""));
      const loc = j.location?.name ?? null;
      return {
        externalId: String(j.id),
        title: j.title,
        companyName: boardToken,
        location: loc,
        workplaceType: inferWorkplace(`${loc ?? ""} ${desc}`),
        description: desc.slice(0, 8000),
        requiredSkills: extractSkills(`${j.title} ${desc}`),
        preferredSkills: [],
        originalUrl: j.absolute_url,
        datePosted: j.updated_at ?? null,
      };
    });
    return { jobs };
  } catch (e) {
    return { jobs: [], error: e instanceof Error ? e.message : "Greenhouse fetch failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// Lever postings — https://api.lever.co/v0/postings/{company}?mode=json
// Public postings API. No key required.
// ─────────────────────────────────────────────────────────────
interface LeverJob {
  id: string; text: string; hostedUrl: string; createdAt?: number;
  categories?: { location?: string; team?: string; commitment?: string };
  descriptionPlain?: string;
}

export async function fetchLever(company: string): Promise<FetchResult> {
  try {
    const data = await getJson<LeverJob[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`
    );
    const jobs = (data ?? []).slice(0, 40).map<NormalizedJob>((j) => {
      const desc = stripHtml(j.descriptionPlain ?? "");
      const loc = j.categories?.location ?? null;
      return {
        externalId: j.id,
        title: j.text,
        companyName: company,
        location: loc,
        workplaceType: inferWorkplace(`${loc ?? ""} ${desc}`),
        employmentType: j.categories?.commitment?.toLowerCase().includes("full") ? "FULL_TIME" : "UNKNOWN",
        description: desc.slice(0, 8000),
        requiredSkills: extractSkills(`${j.text} ${desc}`),
        preferredSkills: [],
        originalUrl: j.hostedUrl,
        datePosted: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        industry: j.categories?.team ?? null,
      };
    });
    return { jobs };
  } catch (e) {
    return { jobs: [], error: e instanceof Error ? e.message : "Lever fetch failed" };
  }
}

function decodeHtml(s: string) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

/** Dispatch by source kind. */
export async function fetchSource(
  kind: string,
  identifier: string,
  keywords: string[]
): Promise<FetchResult> {
  switch (kind) {
    case "remotive": return fetchRemotive(keywords);
    case "arbeitnow": return fetchArbeitnow();
    case "greenhouse": return fetchGreenhouse(identifier);
    case "lever": return fetchLever(identifier);
    default: return { jobs: [], error: `Unknown source kind: ${kind}` };
  }
}
