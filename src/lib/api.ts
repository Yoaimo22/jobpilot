import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";

/** Standard success envelope: { success: true, data }. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

/** Standard error envelope: { success: false, error }. */
export function fail(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

/**
 * Resolve the authenticated user id, or throw a Response to short-circuit.
 * Every API route calls this so queries are always scoped by userId.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw fail("Unauthorized", 401);
  }
  return session.user.id;
}

/** Wrap a route handler with auth + uniform error handling. */
export function route<T>(
  handler: (userId: string) => Promise<NextResponse<T>>
) {
  return async () => {
    try {
      const userId = await requireUserId();
      return await handler(userId);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof NextResponse) return err;
  // requireUserId throws a Response (NextResponse) on 401
  if (err && typeof err === "object" && "status" in err && "json" in err) {
    return err as NextResponse;
  }
  if (err instanceof ZodError) {
    return fail("Validation failed", 422, { issues: err.flatten() });
  }
  const message =
    err instanceof Error ? err.message : "Internal server error";
  // Unique-constraint violation from Prisma
  if (message.includes("Unique constraint")) {
    return fail("This record already exists.", 409);
  }
  console.error("[API error]", err);
  return fail("Internal server error", 500);
}
