/**
 * Skill Relationship Engine + Evidence System (spec §2, §3).
 *
 * Two hard rules encoded here:
 *
 *  1. A competency may only be claimed if a sentence in the CV proves it. Every
 *     claim carries the verbatim quote it came from.
 *  2. Relationships only ever go from a concrete technology to a BROADER
 *     competency it genuinely implies (React → Frontend Development). They never
 *     go sideways to a sibling technology (React ↛ Vue), because using one tool
 *     is not evidence of using another.
 */
import { mentions, TECH_TAXONOMY, type ParsedCv } from "./parser";

export type EvidenceKind =
  | "DIRECT_SKILL"
  | "RELATED_COMPETENCY"
  | "INFERRED_COMPETENCY"
  | "MISSING_SKILL";

export interface Evidence {
  skill: string;
  kind: EvidenceKind;
  quote: string;
  section?: string;
  confidence: number; // 0..1
}

/**
 * technology → broader competencies it legitimately demonstrates.
 * Deliberately NO sibling entries: nothing here maps React to Vue, Node to
 * Django, or Postgres to Mongo.
 */
const IMPLIES: Record<string, string[]> = {
  // Frontend
  react: ["Frontend Development", "Web Development", "Component-Based UI Development", "JavaScript Development"],
  "next.js": ["Frontend Development", "Web Development", "Server-Side Rendering", "React Development"],
  vue: ["Frontend Development", "Web Development", "Component-Based UI Development"],
  angular: ["Frontend Development", "Web Development", "Component-Based UI Development"],
  svelte: ["Frontend Development", "Web Development", "Component-Based UI Development"],
  "tailwind css": ["UI Styling", "Responsive Web Design"],
  tailwind: ["UI Styling", "Responsive Web Design"],
  // Backend
  "node.js": ["Backend Development", "Server-Side JavaScript", "API Development"],
  express: ["Backend Development", "REST API Development", "Server-Side JavaScript"],
  "express.js": ["Backend Development", "REST API Development", "Server-Side JavaScript"],
  nestjs: ["Backend Development", "REST API Development", "Server-Side JavaScript"],
  django: ["Backend Development", "Web Development", "Python Development"],
  flask: ["Backend Development", "API Development", "Python Development"],
  fastapi: ["Backend Development", "REST API Development", "Python Development"],
  spring: ["Backend Development", "API Development", "Java Development"],
  "spring boot": ["Backend Development", "REST API Development", "Java Development"],
  laravel: ["Backend Development", "Web Development", "PHP Development"],
  rails: ["Backend Development", "Web Development", "Ruby Development"],
  // API concepts
  "rest api": ["REST API Development", "API Development", "Backend Development", "RESTful Services"],
  restful: ["REST API Development", "API Development", "RESTful Services"],
  api: ["API Development"],
  graphql: ["API Development", "Schema Design"],
  grpc: ["API Development", "Service Communication"],
  // Databases
  postgresql: ["Relational Database", "Database Integration", "SQL"],
  mysql: ["Relational Database", "Database Integration", "SQL"],
  "sql server": ["Relational Database", "Database Integration", "SQL"],
  oracle: ["Relational Database", "Database Integration", "SQL"],
  sqlite: ["Relational Database", "Database Integration", "SQL"],
  mariadb: ["Relational Database", "Database Integration", "SQL"],
  mongodb: ["NoSQL Database", "Database Integration"],
  dynamodb: ["NoSQL Database", "Database Integration"],
  cassandra: ["NoSQL Database", "Database Integration"],
  redis: ["Caching", "In-Memory Data Store"],
  elasticsearch: ["Search Infrastructure", "Data Indexing"],
  prisma: ["ORM", "Database Integration"],
  sequelize: ["ORM", "Database Integration"],
  typeorm: ["ORM", "Database Integration"],
  mongoose: ["ODM", "Database Integration"],
  // Cloud / DevOps
  aws: ["Cloud Computing", "Cloud Deployment"],
  gcp: ["Cloud Computing", "Cloud Deployment"],
  "google cloud": ["Cloud Computing", "Cloud Deployment"],
  azure: ["Cloud Computing", "Cloud Deployment"],
  vercel: ["Cloud Deployment"],
  heroku: ["Cloud Deployment"],
  docker: ["Containerization", "Application Deployment"],
  kubernetes: ["Container Orchestration", "Infrastructure Management"],
  terraform: ["Infrastructure as Code", "Infrastructure Management"],
  ansible: ["Configuration Management", "Infrastructure Automation"],
  jenkins: ["CI/CD", "Build Automation"],
  "github actions": ["CI/CD", "Build Automation"],
  "gitlab ci": ["CI/CD", "Build Automation"],
  circleci: ["CI/CD", "Build Automation"],
  nginx: ["Web Server Configuration", "Reverse Proxy"],
  linux: ["Linux Administration"],
  git: ["Version Control"],
  kafka: ["Event Streaming", "Message Queue"],
  rabbitmq: ["Message Queue"],
  // Testing
  jest: ["Automated Testing", "Unit Testing"],
  vitest: ["Automated Testing", "Unit Testing"],
  pytest: ["Automated Testing", "Unit Testing"],
  junit: ["Automated Testing", "Unit Testing"],
  mocha: ["Automated Testing", "Unit Testing"],
  cypress: ["Automated Testing", "End-to-End Testing"],
  playwright: ["Automated Testing", "End-to-End Testing"],
  selenium: ["Automated Testing", "End-to-End Testing"],
  // Languages
  typescript: ["Type-Safe Development", "JavaScript Development"],
  javascript: ["JavaScript Development", "Web Development"],
  python: ["Python Development"],
  java: ["Java Development"],
  go: ["Go Development"],
  sql: ["SQL", "Database Querying"],
};

/**
 * Phrases that hint at a competency without naming a tool. Confidence stays
 * low, so these surface as INFERRED and route to user confirmation (§11).
 */
const PHRASE_HINTS: { pattern: RegExp; skill: string; confidence: number }[] = [
  { pattern: /\bdeploy(ed|ing|ment)?\b/i, skill: "Application Deployment", confidence: 0.6 },
  { pattern: /\bci\/cd|continuous (integration|delivery|deployment)\b/i, skill: "CI/CD", confidence: 0.7 },
  { pattern: /\bcode review(s|ed|ing)?\b/i, skill: "Code Review", confidence: 0.75 },
  { pattern: /\bmentor(ed|ing|ship)?|coach(ed|ing)?\b/i, skill: "Mentoring", confidence: 0.7 },
  { pattern: /\blead(ing)?\s+(a\s+)?(team|squad|group)|team lead\b/i, skill: "Team Leadership", confidence: 0.7 },
  { pattern: /\bagile|scrum|sprint(s)?\b/i, skill: "Agile Methodology", confidence: 0.7 },
  { pattern: /\boptimi[sz](ed|ing|ation)\b.*\b(performance|query|speed|latency)\b/i, skill: "Performance Optimization", confidence: 0.65 },
  { pattern: /\bmicroservice(s)?\b/i, skill: "Microservices Architecture", confidence: 0.75 },
  { pattern: /\bunit test(s|ing)?|integration test(s|ing)?\b/i, skill: "Automated Testing", confidence: 0.7 },
  { pattern: /\bdebug(ged|ging)?|troubleshoot(ing|ed)?\b/i, skill: "Debugging", confidence: 0.6 },
  { pattern: /\bdocument(ed|ation|ing)\b/i, skill: "Technical Documentation", confidence: 0.6 },
  { pattern: /\bstakeholder|client(s)?\s+(meeting|communication)\b/i, skill: "Stakeholder Communication", confidence: 0.6 },
];

const ALL_TECH: string[] = [
  ...TECH_TAXONOMY.programmingLanguages, ...TECH_TAXONOMY.frameworks,
  ...TECH_TAXONOMY.libraries, ...TECH_TAXONOMY.databases,
  ...TECH_TAXONOMY.cloudPlatforms, ...TECH_TAXONOMY.devopsTools,
  ...TECH_TAXONOMY.testingTools, ...TECH_TAXONOMY.pmTools,
];

const EXTRA_CONCEPTS = ["REST API", "RESTful", "GraphQL", "gRPC", "Microservices", "Kafka", "RabbitMQ"];

/**
 * Build the evidence set for a CV. Direct skills come with the sentence that
 * names them; related competencies inherit that same quote, because the quote
 * is what justifies them.
 */
export function buildEvidence(cv: ParsedCv, rawText: string): Evidence[] {
  const corpus = cv.sentences.length ? cv.sentences : [rawText];
  const out = new Map<string, Evidence>();

  const record = (e: Evidence) => {
    const key = e.skill.toLowerCase();
    const prev = out.get(key);
    // Keep the strongest claim per skill.
    if (!prev || rank(e.kind) < rank(prev.kind) || (rank(e.kind) === rank(prev.kind) && e.confidence > prev.confidence)) {
      out.set(key, e);
    }
  };

  // 1. DIRECT — the term literally appears, quote the sentence containing it.
  for (const term of [...ALL_TECH, ...EXTRA_CONCEPTS]) {
    const hit = corpus.find((s) => mentions(s, term));
    if (!hit) continue;
    record({ skill: term, kind: "DIRECT_SKILL", quote: hit, confidence: 0.98, section: sectionOf(cv, hit) });

    // 2. RELATED — broader competencies this term genuinely implies.
    for (const implied of IMPLIES[term.toLowerCase()] ?? []) {
      record({
        skill: implied,
        kind: "RELATED_COMPETENCY",
        quote: hit,
        confidence: 0.85,
        section: sectionOf(cv, hit),
      });
    }
  }

  // 3. INFERRED — phrasing suggests a competency; weaker, needs confirmation.
  for (const hint of PHRASE_HINTS) {
    const hit = corpus.find((s) => hint.pattern.test(s));
    if (!hit) continue;
    record({
      skill: hint.skill,
      kind: "INFERRED_COMPETENCY",
      quote: hit,
      confidence: hint.confidence,
      section: sectionOf(cv, hit),
    });
  }

  return [...out.values()].sort((a, b) => rank(a.kind) - rank(b.kind) || b.confidence - a.confidence);
}

const rank = (k: EvidenceKind) =>
  k === "DIRECT_SKILL" ? 0 : k === "RELATED_COMPETENCY" ? 1 : k === "INFERRED_COMPETENCY" ? 2 : 3;

function sectionOf(cv: ParsedCv, sentence: string): string {
  if (cv.professionalSummary && cv.professionalSummary.includes(sentence.slice(0, 30))) return "summary";
  if (cv.experiences.some((e) => e.raw.includes(sentence.slice(0, 30)))) return "experience";
  if (cv.projects.some((p) => p.raw.includes(sentence.slice(0, 30)))) return "projects";
  if (cv.educations.some((e) => e.raw.includes(sentence.slice(0, 30)))) return "education";
  return "skills";
}

/** Does the CV support this skill at all, and how? */
export function classifySkill(
  skill: string,
  evidence: Evidence[],
  verified: Map<string, "YES" | "NO" | "NOT_SURE">
): { kind: EvidenceKind; quote?: string; confidence: number } {
  const key = skill.toLowerCase();

  // A user's own NO is binding and outranks any inference (§11).
  const answer = verified.get(key);
  if (answer === "NO") return { kind: "MISSING_SKILL", confidence: 1 };
  if (answer === "YES") return { kind: "DIRECT_SKILL", confidence: 1, quote: "Confirmed by you" };

  const hit = evidence.find((e) => e.skill.toLowerCase() === key);
  if (hit) return { kind: hit.kind, quote: hit.quote, confidence: hit.confidence };

  return { kind: "MISSING_SKILL", confidence: 1 };
}

/** Skills the CV proves, as a plain list (direct + related only). */
export function ownedSkills(evidence: Evidence[]): string[] {
  return evidence
    .filter((e) => e.kind === "DIRECT_SKILL" || e.kind === "RELATED_COMPETENCY")
    .map((e) => e.skill);
}

/** Group a flat skill list into the categories from §17. No new skills added. */
export function categorizeSkills(skills: string[]): Record<string, string[]> {
  const has = (vocab: readonly string[], s: string) =>
    vocab.some((v) => v.toLowerCase() === s.toLowerCase());
  const out: Record<string, string[]> = {
    Languages: [], Frontend: [], Backend: [], Database: [],
    Cloud: [], DevOps: [], Testing: [], Tools: [], Other: [],
  };
  const FRONTEND = ["React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte", "Tailwind", "Tailwind CSS", "Bootstrap", "React Native", "Flutter"];
  const BACKEND = ["Node.js", "Express", "Express.js", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", "Laravel", "Rails", "Ruby on Rails", "ASP.NET"];

  for (const s of skills) {
    if (has(TECH_TAXONOMY.programmingLanguages, s)) out.Languages.push(s);
    else if (has(FRONTEND, s)) out.Frontend.push(s);
    else if (has(BACKEND, s)) out.Backend.push(s);
    else if (has(TECH_TAXONOMY.databases, s)) out.Database.push(s);
    else if (has(TECH_TAXONOMY.cloudPlatforms, s)) out.Cloud.push(s);
    else if (has(TECH_TAXONOMY.devopsTools, s)) out.DevOps.push(s);
    else if (has(TECH_TAXONOMY.testingTools, s)) out.Testing.push(s);
    else if (has(TECH_TAXONOMY.pmTools, s) || has(TECH_TAXONOMY.libraries, s)) out.Tools.push(s);
    else out.Other.push(s);
  }
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  return out;
}
