/**
 * JobProvider abstraction (spec §30). Every job source implements this
 * interface so new platforms can be added without touching core logic.
 *
 * IMPORTANT (spec §7 of workflow, §31): providers must NOT scrape or automate
 * in ways that violate a platform's Terms of Service. `supportsApplication`
 * is false unless an OFFICIAL API / permitted method exists. Auto-submission
 * is gated on this flag.
 */

export interface NormalizedJob {
  externalId?: string | null;
  title: string;
  companyName: string;
  companyWebsite?: string | null;
  location?: string | null;
  workplaceType?: "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
  employmentType?:
    | "FULL_TIME"
    | "PART_TIME"
    | "CONTRACT"
    | "INTERNSHIP"
    | "FREELANCE"
    | "UNKNOWN";
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  description?: string | null;
  requirements?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  experienceYears?: number | null;
  educationRequirement?: string | null;
  originalUrl?: string | null;
  datePosted?: string | null;
  applicationDeadline?: string | null;
  easyApply?: boolean;
  recruiterName?: string | null;
  seniority?: string | null;
  industry?: string | null;
}

export interface JobSearchParams {
  query?: string;
  location?: string;
  limit?: number;
}

export interface ApplicationPreparation {
  ready: boolean;
  requiresUserInput: string[]; // screening questions we cannot answer
  note: string;
}

export abstract class JobProvider {
  abstract readonly key: string;
  abstract readonly name: string;
  /** True only when an official API / permitted apply method exists. */
  abstract readonly supportsApplication: boolean;

  /** Search jobs. Manual/import providers may return []. */
  abstract searchJobs(params: JobSearchParams): Promise<NormalizedJob[]>;

  /** Fetch a single job's detail by external id / url. */
  abstract getJobDetail(idOrUrl: string): Promise<NormalizedJob | null>;

  /** Normalize a raw payload into the canonical shape. */
  abstract normalizeJob(raw: unknown): NormalizedJob;

  /**
   * Prepare (never auto-submit unless supportsApplication) an application.
   * Default: semi-automated — prepares, flags questions for user input.
   */
  prepareApplication(): ApplicationPreparation {
    return {
      ready: true,
      requiresUserInput: [],
      note: this.supportsApplication
        ? "Provider supports official application submission."
        : "This source does not permit automated submission. Prepared for manual/assisted apply.",
    };
  }
}

/**
 * ManualProvider — the default. The user imports/pastes a job. No scraping,
 * always ToS-safe. supportsApplication=false → apply is always manual/assisted.
 */
export class ManualProvider extends JobProvider {
  readonly key = "manual";
  readonly name = "Manual / Import";
  readonly supportsApplication = false;

  async searchJobs(): Promise<NormalizedJob[]> {
    return [];
  }
  async getJobDetail(): Promise<NormalizedJob | null> {
    return null;
  }
  normalizeJob(raw: unknown): NormalizedJob {
    const r = raw as Partial<NormalizedJob>;
    return {
      title: r.title ?? "Untitled",
      companyName: r.companyName ?? "Unknown",
      ...r,
    } as NormalizedJob;
  }
}

/**
 * Registry of known sources. Third-party providers (LinkedIn, Indeed, etc.)
 * are declared here as scaffolds with supportsApplication=false and no live
 * scraping — they become active only when an official API adapter is wired in.
 */
export const KNOWN_SOURCES = [
  { key: "manual", name: "Manual / Import", supportsApply: false },
  { key: "linkedin", name: "LinkedIn", supportsApply: false },
  { key: "indeed", name: "Indeed", supportsApply: false },
  { key: "jobstreet", name: "Jobstreet", supportsApply: false },
  { key: "glints", name: "Glints", supportsApply: false },
  { key: "kalibrr", name: "Kalibrr", supportsApply: false },
  { key: "company", name: "Company Career Page", supportsApply: false },
];

const providers = new Map<string, JobProvider>([["manual", new ManualProvider()]]);

export function getProvider(key: string): JobProvider {
  return providers.get(key) ?? providers.get("manual")!;
}
