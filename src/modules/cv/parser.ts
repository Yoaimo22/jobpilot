/**
 * Structured CV parser (spec §1).
 *
 * Turns raw PDF text into a typed ParsedCv. Everything it emits is traceable to
 * a span of the original text — the parser never invents a field. Anything it
 * cannot find is left null/empty so the UI can ask the user to correct it
 * rather than the system guessing.
 */
import { z } from "zod";

export const parsedExperienceSchema = z.object({
  company: z.string(),
  position: z.string(),
  period: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  current: z.boolean().default(false),
  responsibilities: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  raw: z.string(),
});

export const parsedEducationSchema = z.object({
  institution: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  period: z.string().nullable(),
  raw: z.string(),
});

export const parsedProjectSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  technologies: z.array(z.string()).default([]),
  raw: z.string(),
});

export const parsedCvSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  links: z.array(z.string()).default([]),
  professionalSummary: z.string().nullable(),
  experiences: z.array(parsedExperienceSchema).default([]),
  educations: z.array(parsedEducationSchema).default([]),
  certifications: z.array(z.string()).default([]),
  projects: z.array(parsedProjectSchema).default([]),
  hardSkills: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  programmingLanguages: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  libraries: z.array(z.string()).default([]),
  databases: z.array(z.string()).default([]),
  cloudPlatforms: z.array(z.string()).default([]),
  devopsTools: z.array(z.string()).default([]),
  testingTools: z.array(z.string()).default([]),
  pmTools: z.array(z.string()).default([]),
  spokenLanguages: z.array(z.string()).default([]),
  /// Every sentence of the CV, used as the evidence corpus.
  sentences: z.array(z.string()).default([]),
});

export type ParsedCv = z.infer<typeof parsedCvSchema>;
export type ParsedExperience = z.infer<typeof parsedExperienceSchema>;

// ─────────────────────────────────────────────────────────────
// Technology vocabulary, grouped so skills land in the right category (§17).
// Only these categories are asserted; nothing outside the CV text is added.
// ─────────────────────────────────────────────────────────────
export const TECH_TAXONOMY = {
  programmingLanguages: [
    "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust", "PHP", "Ruby",
    "Kotlin", "Swift", "C#", "C++", "C", "Scala", "Dart", "R", "MATLAB", "SQL",
  ],
  frameworks: [
    "React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte", "Node.js", "Express",
    "Express.js", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot",
    "Laravel", "Rails", "Ruby on Rails", "ASP.NET", "Flutter", "React Native",
    "Tailwind", "Tailwind CSS", "Bootstrap",
  ],
  libraries: [
    "Redux", "React Query", "Zustand", "jQuery", "Lodash", "Pandas", "NumPy",
    "TensorFlow", "PyTorch", "scikit-learn", "Prisma", "Sequelize", "TypeORM",
    "Mongoose", "Axios",
  ],
  databases: [
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Oracle", "SQL Server",
    "Elasticsearch", "Cassandra", "DynamoDB", "Firebase", "Supabase", "MariaDB",
  ],
  cloudPlatforms: ["AWS", "GCP", "Google Cloud", "Azure", "Vercel", "Heroku", "DigitalOcean", "Cloudflare"],
  devopsTools: [
    "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "GitHub Actions",
    "GitLab CI", "CircleCI", "Nginx", "Linux", "Bash", "Git", "Helm", "Prometheus", "Grafana",
  ],
  testingTools: ["Jest", "Vitest", "Cypress", "Playwright", "Selenium", "Mocha", "JUnit", "PyTest", "Testing Library"],
  pmTools: ["Jira", "Trello", "Asana", "Notion", "Confluence", "Slack", "Figma", "Linear"],
} as const;

const SOFT_SKILLS = [
  "Communication", "Teamwork", "Leadership", "Problem Solving", "Collaboration",
  "Time Management", "Adaptability", "Critical Thinking", "Mentoring", "Presentation",
];

const SPOKEN_LANGUAGES = [
  "English", "Indonesian", "Bahasa Indonesia", "Mandarin", "Japanese", "Korean",
  "German", "French", "Spanish", "Arabic", "Dutch",
];

const SECTION_HEADINGS: Record<string, string[]> = {
  summary: ["professional summary", "summary", "profile", "about me", "objective", "ringkasan"],
  experience: ["work experience", "professional experience", "experience", "employment", "pengalaman kerja", "pengalaman"],
  education: ["education", "academic", "pendidikan"],
  skills: ["skills", "technical skills", "competencies", "keahlian", "kemampuan"],
  projects: ["projects", "personal projects", "portfolio", "proyek"],
  certifications: ["certifications", "certificates", "licenses", "sertifikasi"],
};

/** Escape a literal for safe use inside a RegExp. */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-token match that tolerates the dots/pluses in tech names. */
export function mentions(text: string, term: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9.+#])${esc(term)}([^A-Za-z0-9.+#]|$)`, "i").test(text);
}

/** Split text into usable sentences / bullet lines. */
export function toSentences(text: string): string[] {
  return text
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z])|•|·|●/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12 && s.length <= 400);
}

/** Slice the text into labelled sections using common CV headings. */
export function splitSections(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/);
  const found: { idx: number; key: string }[] = [];

  lines.forEach((line, i) => {
    const clean = line.replace(/[^a-zA-Z\s]/g, " ").trim().toLowerCase();
    if (!clean || clean.length > 40) return;
    for (const [key, headings] of Object.entries(SECTION_HEADINGS)) {
      if (headings.some((h) => clean === h || clean.startsWith(h))) {
        found.push({ idx: i, key });
        return;
      }
    }
  });

  const out: Record<string, string> = {};
  found.forEach((f, n) => {
    const end = n + 1 < found.length ? found[n + 1].idx : lines.length;
    out[f.key] = (out[f.key] ?? "") + lines.slice(f.idx + 1, end).join("\n");
  });
  return out;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const PHONE_RE = /(\+?\d[\d\s()-]{7,}\d)/;
const URL_RE = /https?:\/\/[^\s)]+|(?:www\.|linkedin\.com|github\.com)[^\s)]+/gi;
const DATE_RANGE_RE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4}|\d{1,2}\/\d{4})\s*(?:-|–|—|to|s\/d|sampai)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}|\d{4}|\d{1,2}\/\d{4}|present|current|sekarang|now)/i;

/** Collect vocabulary terms actually present in the text. */
function pick(text: string, vocab: readonly string[]): string[] {
  const hits = vocab.filter((t) => mentions(text, t));
  // Prefer the longer alias when both matched (Express.js over Express).
  return hits.filter((h) => !hits.some((o) => o !== h && o.toLowerCase().startsWith(h.toLowerCase()) && o.length > h.length));
}

export function parseCvText(text: string): ParsedCv {
  const normalized = text.replace(/\r/g, "");
  const sections = splitSections(normalized);
  const sentences = toSentences(normalized);

  const email = normalized.match(EMAIL_RE)?.[0] ?? null;
  const phone = normalized.match(PHONE_RE)?.[0]?.trim() ?? null;
  const links = [...new Set(normalized.match(URL_RE) ?? [])].slice(0, 8);

  // Name heuristic: first short line that is not contact data.
  let name: string | null = null;
  for (const line of normalized.split("\n").slice(0, 8)) {
    const l = line.trim();
    if (!l || l.length > 60) continue;
    if (EMAIL_RE.test(l) || PHONE_RE.test(l) || /https?:/i.test(l)) continue;
    if (/^[A-Za-z][A-Za-z.'\- ]{2,}$/.test(l) && l.split(/\s+/).length <= 5) { name = l; break; }
  }

  const experienceText = sections.experience ?? "";
  const experiences = parseExperiences(experienceText);
  const educations = parseEducations(sections.education ?? "");
  const projects = parseProjects(sections.projects ?? "");

  const certifications = (sections.certifications ?? "")
    .split(/\n|•|·/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 3 && s.length < 140)
    .slice(0, 12);

  return parsedCvSchema.parse({
    name,
    email,
    phone,
    location: null,
    links,
    professionalSummary: (sections.summary ?? "").replace(/\s+/g, " ").trim() || null,
    experiences,
    educations,
    certifications,
    projects,
    programmingLanguages: pick(normalized, TECH_TAXONOMY.programmingLanguages),
    frameworks: pick(normalized, TECH_TAXONOMY.frameworks),
    libraries: pick(normalized, TECH_TAXONOMY.libraries),
    databases: pick(normalized, TECH_TAXONOMY.databases),
    cloudPlatforms: pick(normalized, TECH_TAXONOMY.cloudPlatforms),
    devopsTools: pick(normalized, TECH_TAXONOMY.devopsTools),
    testingTools: pick(normalized, TECH_TAXONOMY.testingTools),
    pmTools: pick(normalized, TECH_TAXONOMY.pmTools),
    softSkills: pick(normalized, SOFT_SKILLS),
    spokenLanguages: pick(normalized, SPOKEN_LANGUAGES),
    hardSkills: [
      ...pick(normalized, TECH_TAXONOMY.programmingLanguages),
      ...pick(normalized, TECH_TAXONOMY.frameworks),
      ...pick(normalized, TECH_TAXONOMY.databases),
      ...pick(normalized, TECH_TAXONOMY.cloudPlatforms),
      ...pick(normalized, TECH_TAXONOMY.devopsTools),
    ],
    sentences,
  });
}

function parseExperiences(text: string): unknown[] {
  if (!text.trim()) return [];
  // A new entry starts on a line carrying a date range.
  const lines = text.split("\n").map((l) => l.trim());
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (DATE_RANGE_RE.test(line) && current.length) { blocks.push(current); current = [line]; }
    else current.push(line);
  }
  if (current.length) blocks.push(current);

  return blocks
    .map((block) => {
      const raw = block.filter(Boolean).join("\n");
      if (raw.length < 8) return null;
      const dateMatch = raw.match(DATE_RANGE_RE);
      const header = block.find((l) => l && !/^[-•·]/.test(l)) ?? "";
      const headerNoDate = header.replace(DATE_RANGE_RE, "").replace(/[|,–—-]\s*$/, "").trim();
      const parts = headerNoDate.split(/\s+(?:at|@|-|–|—|\|)\s+/i);
      const bullets = block
        .filter((l) => /^[-•·●*]/.test(l))
        .map((l) => l.replace(/^[-•·●*]\s*/, "").trim())
        .filter(Boolean);
      const isAchievement = (b: string) => /\d+\s*%|\bby \d+|\breduced\b|\bincreased\b|\bimproved\b|\bsaved\b/i.test(b);

      return {
        position: parts[0]?.trim() || headerNoDate || "Unknown position",
        company: parts[1]?.trim() || "Unknown company",
        period: dateMatch ? dateMatch[0] : null,
        startDate: dateMatch ? dateMatch[1] : null,
        endDate: dateMatch ? dateMatch[2] : null,
        current: dateMatch ? /present|current|sekarang|now/i.test(dateMatch[2]) : false,
        responsibilities: bullets.filter((b) => !isAchievement(b)),
        achievements: bullets.filter(isAchievement),
        raw,
      };
    })
    .filter(Boolean) as unknown[];
}

function parseEducations(text: string): unknown[] {
  if (!text.trim()) return [];
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const raw = block.replace(/\s+/g, " ").trim();
      if (raw.length < 6) return null;
      const dateMatch = raw.match(DATE_RANGE_RE);
      const degreeMatch = raw.match(/\b(Bachelor|Master|Doctor|PhD|S1|S2|S3|Diploma|Associate|B\.?Sc|M\.?Sc|B\.?A|M\.?A)\b[^,;\n]*/i);
      return {
        institution: raw.split(/[,;|]/)[0].replace(DATE_RANGE_RE, "").trim() || "Unknown institution",
        degree: degreeMatch?.[0]?.trim() ?? null,
        field: raw.match(/\b(?:in|of)\s+([A-Z][A-Za-z\s]{3,40})/)?.[1]?.trim() ?? null,
        period: dateMatch?.[0] ?? null,
        raw,
      };
    })
    .filter(Boolean) as unknown[];
}

function parseProjects(text: string): unknown[] {
  if (!text.trim()) return [];
  const allTech = [
    ...TECH_TAXONOMY.programmingLanguages, ...TECH_TAXONOMY.frameworks,
    ...TECH_TAXONOMY.databases, ...TECH_TAXONOMY.devopsTools, ...TECH_TAXONOMY.cloudPlatforms,
  ];
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const raw = block.replace(/\s+/g, " ").trim();
      if (raw.length < 10) return null;
      return {
        name: raw.split(/[.\-–—:]/)[0].trim().slice(0, 80) || "Project",
        description: raw,
        technologies: allTech.filter((t) => mentions(raw, t)),
        raw,
      };
    })
    .filter(Boolean) as unknown[];
}

/** Years of experience computed from parsed date ranges — never invented (§14). */
export function computeYearsFromCv(cv: ParsedCv): number | null {
  const years: number[] = [];
  for (const e of cv.experiences) {
    const s = e.startDate ? yearOf(e.startDate) : null;
    const en = e.endDate ? (/present|current|sekarang|now/i.test(e.endDate) ? new Date().getFullYear() : yearOf(e.endDate)) : null;
    if (s && en && en >= s) years.push(en - s);
  }
  if (!years.length) return null;
  const total = years.reduce((a, b) => a + b, 0);
  return total > 0 ? total : null;
}

function yearOf(s: string): number | null {
  const m = s.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}
