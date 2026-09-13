import { prisma } from "@/lib/prisma";

export type NotificationType =
  | "application_submitted"
  | "application_failed"
  | "duplicate"
  | "daily_limit"
  | "new_match"
  | "interview"
  | "follow_up"
  | "cv_missing"
  | "job_expired"
  | "error";

export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  link?: string
) {
  return prisma.notification.create({
    data: { userId, type, title, message, link },
  });
}

/** Record a status/audit event on an application (spec §26). */
export async function recordEvent(
  applicationId: string,
  action: string,
  opts?: {
    oldValue?: string | null;
    newValue?: string | null;
    actor?: "system" | "user";
    metadata?: Record<string, unknown>;
  }
) {
  return prisma.applicationEvent.create({
    data: {
      applicationId,
      action,
      oldValue: opts?.oldValue ?? null,
      newValue: opts?.newValue ?? null,
      actor: opts?.actor ?? "system",
      metadata: opts?.metadata ? (opts.metadata as object) : undefined,
    },
  });
}
