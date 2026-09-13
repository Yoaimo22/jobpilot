/**
 * ApplicationService — creates an application from a job, but ONLY after the
 * ApplicationGuard clears it. Duplicate/limit/blacklist enforcement lives here
 * at the service layer (spec §5, §14, §31) so no UI path can bypass it.
 */
import { prisma } from "@/lib/prisma";
import { runApplicationGuard, type GuardResult } from "./guard";
import { recommendResume } from "./cover-letter";
import { recordEvent, notify } from "@/modules/notifications/service";

export interface CreateApplicationResult {
  created: boolean;
  applicationId?: string;
  guard: GuardResult;
  reason?: string;
}

/**
 * Prepare an application (status = PREPARING). Blocks that are hard failures
 * prevent creation; warnings do not. Duplicate → not created, returns guard.
 */
export async function createApplication(
  userId: string,
  jobId: string,
  opts?: { force?: boolean; resumeId?: string }
): Promise<CreateApplicationResult> {
  const guard = await runApplicationGuard({ userId, jobId });

  // Duplicate is always a hard stop — never re-create.
  if (guard.duplicate) {
    await notify(
      userId,
      "duplicate",
      "Duplicate application detected",
      `You already have an application for this job.`,
      `/dashboard/applications/${guard.duplicate.applicationId}`
    );
    return {
      created: false,
      guard,
      reason: "duplicate",
      applicationId: guard.duplicate.applicationId,
    };
  }

  // Hard blocks (other than duplicate) prevent creation unless forced past
  // NON-safety warnings. Safety blocks (blacklist, cv, limits) are never forced.
  const unforceable = guard.checks.filter(
    (c) =>
      c.severity === "block" &&
      !c.passed &&
      ["company_blacklist", "keyword_blacklist", "cv_available", "daily_limit", "weekly_limit"].includes(c.key)
  );
  if (unforceable.length && !opts?.force) {
    return { created: false, guard, reason: unforceable[0].detail };
  }
  if (unforceable.length && opts?.force) {
    // Even with force, safety blocks stand.
    return { created: false, guard, reason: `Cannot override: ${unforceable[0].label}` };
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: { jobSkills: { include: { skill: true } } },
  });
  if (!job) return { created: false, guard, reason: "Job not found" };

  // CV recommendation
  const resumes = await prisma.resume.findMany({ where: { userId } });
  const rec = recommendResume(
    resumes.map((r) => ({
      id: r.id,
      name: r.name,
      extractedSkills: r.extractedSkills,
      isDefault: r.isDefault,
    })),
    { title: job.title, requiredSkills: job.jobSkills.map((s) => s.skill.name) }
  );

  const matchReasons = (job.matchReasons as { matchedSkills?: string[]; missingSkills?: string[] } | null) ?? {};

  const app = await prisma.application.create({
    data: {
      userId,
      jobId,
      companyId: job.companyId,
      resumeId: opts?.resumeId ?? rec.resumeId,
      status: "PREPARING",
      matchScore: job.matchScore,
      matchedSkills: matchReasons.matchedSkills ?? [],
      missingSkills: matchReasons.missingSkills ?? [],
    },
  });

  await recordEvent(app.id, "Application prepared", {
    actor: "user",
    newValue: "PREPARING",
    metadata: { recommendedCv: rec.name, cvConfidence: rec.confidence },
  });
  await recordEvent(app.id, "Match score recorded", {
    newValue: String(job.matchScore ?? "n/a"),
  });

  return { created: true, applicationId: app.id, guard };
}

const APPLIED_TERMINAL = new Set(["APPLIED", "VIEWED", "RECRUITER_CONTACTED", "INTERVIEW", "TECHNICAL_TEST", "OFFERING", "ACCEPTED", "REJECTED"]);

/** Update status with audit event + side effects (applied timestamp, follow-up). */
export async function updateStatus(
  userId: string,
  applicationId: string,
  status: string,
  note?: string
) {
  const app = await prisma.application.findFirst({ where: { id: applicationId, userId } });
  if (!app) return null;

  const wasApplied = !!app.appliedAt;
  const nowApplying = status === "APPLIED" && !wasApplied;

  const rule = await prisma.automationRule.findUnique({ where: { userId } });

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: status as never,
      ...(nowApplying ? { appliedAt: new Date() } : {}),
      ...(nowApplying && rule
        ? { followUpDate: new Date(Date.now() + rule.followUpIntervalDays * 86400000) }
        : {}),
    },
  });

  await recordEvent(applicationId, "Status changed", {
    actor: "user",
    oldValue: app.status,
    newValue: status,
    metadata: note ? { note } : undefined,
  });

  // Create follow-up reminder on apply
  if (nowApplying && rule) {
    await prisma.followUpReminder.create({
      data: {
        userId,
        applicationId,
        dueDate: new Date(Date.now() + rule.followUpIntervalDays * 86400000),
      },
    });
    await notify(userId, "application_submitted", "Application submitted", `Marked as applied.`, `/dashboard/applications/${applicationId}`);
  }
  if (status === "INTERVIEW") {
    await notify(userId, "interview", "Interview update", `An application moved to Interview stage.`, `/dashboard/applications/${applicationId}`);
  }

  return updated;
}
