# JobPilot — Job Application Management & Automation System

A production-ready, modular web app to **discover, match, prepare, track, and analyze** job applications — with strong safety guardrails so automation never spams, duplicates, or fabricates.

This repository is a **working vertical slice of all six phases** of the specification: every feature area has a real database model, API, business logic, and wired-up UI. It is not a mockup — all data shown is read from PostgreSQL.

---

## Project Overview

| Phase | Area | Status in this slice |
|-------|------|----------------------|
| 1 | Auth, Profile, Skills, CV Manager, Preferences, DB | ✅ Working |
| 2 | Jobs (import), Companies, Job Matching engine | ✅ Working |
| 3 | Applications, Duplicate detection, Timeline/audit, Queue (guard) | ✅ Working |
| 4 | Analytics, Company stats, Conversion metrics, Insights | ✅ Working |
| 5 | Job Provider adapter interface, semi-automated apply | ✅ Interface + Manual provider |
| 6 | Automation rules, Notifications, Follow-ups, CV/Cover-letter intelligence | ✅ Working |

### What is intentionally *not* automated (by design & ToS)
- **No scraping** of LinkedIn/Indeed/Jobstreet/etc. Third-party providers are scaffolded behind the `JobProvider` interface with `supportsApplication = false`. They activate only when an **official API** adapter is added.
- **No auto-submission** unless a provider explicitly permits it. Default mode is **Review Before Apply**.
- **No CAPTCHA/anti-bot/rate-limit bypass.**
- **No fabricated data** — cover letters only use skills the user actually has; insights are computed from real DB rows.

---

## Architecture

Modular, service-layer-first. Safety rules live in **services**, so no UI path can bypass them.

```
src/
  app/                    # Next.js App Router (pages + API routes)
    api/                  # REST-style route handlers ({ success, data } envelope)
    dashboard/            # Authenticated app pages (11 sections)
    login, register       # Auth pages
  components/             # UI primitives (shadcn-style) + shared widgets
  lib/                    # prisma, auth, api helpers, storage, validators, utils
  modules/                # Business logic (the "services")
    matching/             # JobMatchingService — transparent 0-100 scorer
    jobs/                 # JobProvider interface + JobService
    applications/         # ApplicationGuard (9 checks) + ApplicationService + cover-letter/CV
    analytics/            # AnalyticsService (all figures from DB)
    notifications/        # Notification + audit-event helpers
    resumes/              # CV text extraction
prisma/
  schema.prisma          # 24 tables, normalized, indexed, unique constraints
  seed.ts                # Dev-only demo data
tests/                   # Vitest unit tests for critical logic
```

### Key design points
- **Authorization:** every query is scoped by `userId`; API routes call `requireUserId()`. Unauth API → 401; unauth `/dashboard` → redirect.
- **Duplicate prevention (§14):** unique constraint `Application(userId, jobId)` **plus** service-layer checks on job URL / external id.
- **Limit enforcement (§15/§16):** daily/weekly/per-company limits enforced in `ApplicationGuard`, not the UI.
- **Match transparency (§4):** every score comes with a per-dimension breakdown and matched/missing skills.
- **Audit log (§26):** every status change writes an `ApplicationEvent`.

---

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** + shadcn-style components + **Recharts**
- **PostgreSQL** + **Prisma**
- **NextAuth (Auth.js) v5** — credentials provider, JWT sessions, bcrypt hashing
- **Zod** validation everywhere
- **Vitest** for tests

---

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ running locally (or a hosted URL — Supabase / Neon)

---

## Installation

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` avoids a known npm arborist peer-resolution bug on some setups.

## Environment variables

Copy `.env.example` to `.env` and fill in:

```
DATABASE_URL   # postgresql://user:pass@localhost:5432/jobpilot?schema=public
AUTH_SECRET    # openssl rand -base64 32
NEXTAUTH_URL   # http://localhost:3000
STORAGE_DIR    # ./storage/private  (private CV storage)
LLM_API_BASE / LLM_API_KEY / LLM_MODEL   # optional; cover letters work without it
REDIS_URL      # optional; automation runs synchronously if unset
```

Never commit real secrets — `.env` is git-ignored.

## Database setup, migration & seed

```bash
npm run db:generate     # generate Prisma client
npm run db:push         # create tables (or: npm run db:migrate for migrations)
npm run db:seed         # optional demo data (DEV ONLY)
```

Demo login after seeding: **demo@jobpilot.dev / password123**

## Development

```bash
npm run dev             # http://localhost:3000
```

## Production build

```bash
npm run build
npm run start
```

## Testing

```bash
npm test                # Vitest — match engine, cover letter, CV recommendation
npm run type-check      # tsc --noEmit
npm run lint            # eslint
```

---

## Deployment

- **App:** Vercel (or any Node host). Set all env vars in the platform.
- **Database:** Supabase / Neon / managed PostgreSQL.
- **Storage:** local disk is fine for dev; for production, swap `src/lib/storage.ts` for S3-compatible storage (Supabase Storage / S3) and keep CVs **private**.
- **Redis (optional):** Upstash, only if you enable background automation queues.

---

## Security considerations

- Passwords hashed with bcrypt; sessions are JWT with `AUTH_SECRET`.
- No third-party platform passwords stored — prefer OAuth / official APIs.
- All user data scoped by `userId`; CV files served through an auth-checked route, never from `public/`.
- Input validated with Zod on every write.
- Unique constraints + service-layer checks prevent duplicate jobs/applications.
- Privacy: **Settings → Delete My Data** removes all user rows and private files.
- Secrets are env-only and never sent to the frontend.

> Note: `pdf-parse` / `multer` pull in some transitively-flagged dev dependencies. They are used only server-side for CV parsing/upload; review before production or replace with a maintained parser.

---

## Extending: adding a real job source

Implement the `JobProvider` interface in `src/modules/jobs/providers.ts`:

```ts
class MyOfficialApiProvider extends JobProvider {
  readonly key = "myapi";
  readonly name = "My API";
  readonly supportsApplication = true; // only if the API officially allows it
  async searchJobs(params) { /* call official API */ }
  // ...
}
```

Register it in the `providers` map. Matching, guard, dedup, limits, and UI all work unchanged.
