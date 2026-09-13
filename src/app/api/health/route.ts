import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint — safe to open in a browser.
 *
 * Reports WHICH environment variables are present (never their values) and
 * whether the database is reachable, with a sanitized error message. Used to
 * diagnose deployment problems without exposing credentials.
 */

/** Remove anything credential-shaped from an error message. */
function sanitize(message: string): string {
  return message
    // postgres://user:password@host → postgres://user:***@host
    .replace(/(:\/\/[^:/@\s]+:)[^@\s]+(@)/g, "$1***$2")
    // any long base64/JWT-looking token
    .replace(/eyJ[A-Za-z0-9_.-]{20,}/g, "***jwt***")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "***secret***")
    .replace(/sbp_[A-Za-z0-9]+/g, "***token***")
    .slice(0, 800);
}

/** Report the SHAPE of a connection string without revealing credentials. */
function describeUrl(raw: string | undefined) {
  if (!raw) return { set: false };
  try {
    const u = new URL(raw);
    return {
      set: true,
      protocol: u.protocol.replace(":", ""),
      host: u.hostname,
      port: u.port || "(default)",
      database: u.pathname.replace("/", "") || "(none)",
      hasUser: Boolean(u.username),
      hasPassword: Boolean(u.password),
      // These params matter for Prisma + Supabase pooler
      params: Object.fromEntries(u.searchParams.entries()),
    };
  } catch {
    return { set: true, parseError: "Not a valid URL — check for stray spaces, quotes, or unencoded special characters in the password." };
  }
}

export async function GET() {
  const env = {
    DATABASE_URL: describeUrl(process.env.DATABASE_URL),
    DIRECT_URL: describeUrl(process.env.DIRECT_URL),
    AUTH_SECRET: { set: Boolean(process.env.AUTH_SECRET), length: process.env.AUTH_SECRET?.length ?? 0 },
    NEXTAUTH_URL: { set: Boolean(process.env.NEXTAUTH_URL), value: process.env.NEXTAUTH_URL ?? null },
    SUPABASE_URL: { set: Boolean(process.env.SUPABASE_URL), value: process.env.SUPABASE_URL ?? null },
    SUPABASE_SERVICE_ROLE_KEY: { set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0 },
    SUPABASE_STORAGE_BUCKET: { set: Boolean(process.env.SUPABASE_STORAGE_BUCKET), value: process.env.SUPABASE_STORAGE_BUCKET ?? null },
  };

  // Try to load Prisma and reach the database. Import lazily so a Prisma
  // initialization failure is reported here instead of crashing the route.
  let database: Record<string, unknown> = { status: "not tested" };
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    let userCount: number | string;
    try {
      userCount = await prisma.user.count();
    } catch (e) {
      userCount = `tables missing or unreadable: ${sanitize(e instanceof Error ? e.message : String(e))}`;
    }
    database = { status: "connected", userCount };
  } catch (e) {
    database = {
      status: "FAILED",
      error: sanitize(e instanceof Error ? e.message : String(e)),
      hint: "Common causes: wrong password, missing DIRECT_URL, unencoded special characters in the password, or the wrong port (6543 = transaction pooler for DATABASE_URL, 5432 = session pooler for DIRECT_URL).",
    };
  }

  return NextResponse.json(
    { ok: database.status === "connected", env, database, timestamp: new Date().toISOString() },
    { status: 200 }
  );
}
