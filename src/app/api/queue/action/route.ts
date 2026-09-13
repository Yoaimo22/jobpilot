import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { updateStatus } from "@/modules/applications/service";
import { runApplicationGuard } from "@/modules/applications/guard";
import { z } from "zod";

const schema = z.object({
  applicationIds: z.array(z.string()).min(1),
  action: z.enum(["approve", "reject", "skip"]),
});

/**
 * Queue actions (§35). approve = mark APPLIED (re-runs the guard first, so a
 * duplicate/limit/blacklist that appeared since preparation still blocks it —
 * the guard is authoritative, the UI cannot force past it here). reject =
 * WITHDRAWN. skip = back to INTERESTED (out of the active queue).
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { applicationIds, action } = schema.parse(await req.json());

    const results: { id: string; ok: boolean; reason?: string }[] = [];

    for (const id of applicationIds) {
      const app = await prisma.application.findFirst({ where: { id, userId }, select: { jobId: true } });
      if (!app) { results.push({ id, ok: false, reason: "Not found" }); continue; }

      if (action === "reject") {
        await updateStatus(userId, id, "WITHDRAWN");
        results.push({ id, ok: true });
        continue;
      }
      if (action === "skip") {
        await updateStatus(userId, id, "INTERESTED");
        results.push({ id, ok: true });
        continue;
      }

      // approve → re-validate with the guard (authoritative)
      const guard = await runApplicationGuard({ userId, jobId: app.jobId });
      if (!guard.allowed) {
        const block = guard.checks.find((c) => c.severity === "block" && !c.passed);
        results.push({ id, ok: false, reason: block?.label ?? "Blocked by guard" });
        continue;
      }
      await updateStatus(userId, id, "APPLIED");
      results.push({ id, ok: true });
    }

    const approved = results.filter((r) => r.ok).length;
    const blocked = results.filter((r) => !r.ok);
    return ok({ approved, blocked });
  } catch (err) {
    return toErrorResponse(err);
  }
}
