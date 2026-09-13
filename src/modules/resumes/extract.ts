/**
 * ResumeService — extract structured hints from CV text (§2). This is a
 * heuristic keyword extractor; results are ALWAYS presented for manual
 * correction by the user (never treated as ground truth).
 */

const KNOWN_SKILLS = [
  "javascript", "typescript", "python", "java", "go", "golang", "rust", "c++", "c#",
  "php", "ruby", "kotlin", "swift", "scala", "sql",
  "react", "next.js", "nextjs", "vue", "angular", "svelte", "node.js", "nodejs",
  "express", "nestjs", "django", "flask", "fastapi", "spring", "laravel", "rails",
  "postgresql", "postgres", "mysql", "mongodb", "redis", "elasticsearch",
  "docker", "kubernetes", "aws", "gcp", "azure", "terraform", "ansible",
  "graphql", "rest", "grpc", "kafka", "rabbitmq", "prisma", "tailwind",
  "git", "ci/cd", "jenkins", "github actions", "linux",
];

const FRAMEWORKS = new Set([
  "react", "next.js", "nextjs", "vue", "angular", "svelte", "express", "nestjs",
  "django", "flask", "fastapi", "spring", "laravel", "rails", "tailwind",
]);
const LANGUAGES = new Set([
  "javascript", "typescript", "python", "java", "go", "golang", "rust", "c++",
  "c#", "php", "ruby", "kotlin", "swift", "scala", "sql",
]);
const TOOLS = new Set([
  "docker", "kubernetes", "aws", "gcp", "azure", "terraform", "ansible", "git",
  "jenkins", "github actions", "redis", "kafka", "rabbitmq", "linux",
]);

export interface ExtractedResume {
  skills: string[];
  frameworks: string[];
  languages: string[];
  tools: string[];
  experience: string;
  education: string;
  certifications: string[];
}

export function extractFromText(text: string): ExtractedResume {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const s of KNOWN_SKILLS) {
    const boundary = new RegExp(`(^|[^a-z0-9.+#])${escapeRegex(s)}([^a-z0-9.+#]|$)`, "i");
    if (boundary.test(lower)) found.add(s);
  }

  const canonical = (s: string) =>
    s === "nextjs" ? "next.js" : s === "nodejs" ? "node.js" : s === "golang" ? "go" : s === "postgres" ? "postgresql" : s;

  const skills = [...found].map(canonical);
  const frameworks = skills.filter((s) => FRAMEWORKS.has(s) || FRAMEWORKS.has(s.replace(".", "")));
  const languages = skills.filter((s) => LANGUAGES.has(s));
  const tools = skills.filter((s) => TOOLS.has(s));

  const experience = sliceSection(text, ["experience", "work history", "employment"]);
  const education = sliceSection(text, ["education", "academic"]);
  const certifications = sliceSection(text, ["certification", "certificate", "license"])
    .split(/\n|•|-/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && l.length < 120)
    .slice(0, 8);

  return {
    skills: dedupe(skills.map(title)),
    frameworks: dedupe(frameworks.map(title)),
    languages: dedupe(languages.map(title)),
    tools: dedupe(tools.map(title)),
    experience: experience.slice(0, 2000),
    education: education.slice(0, 1000),
    certifications,
  };
}

function sliceSection(text: string, headings: string[]): string {
  const lower = text.toLowerCase();
  for (const h of headings) {
    const idx = lower.indexOf(h);
    if (idx >= 0) return text.slice(idx, idx + 1200);
  }
  return "";
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dedupe = (arr: string[]) => [...new Set(arr)];
const title = (s: string) =>
  s === "next.js" || s === "node.js" || s === "ci/cd" ? s : s.charAt(0).toUpperCase() + s.slice(1);
