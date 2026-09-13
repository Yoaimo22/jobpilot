import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { runDiscovery } from "@/modules/jobs/discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Run a discovery cycle for the signed-in user, now. */
export async function POST() {
  try {
    const userId = await requireUserId();
    const report = await runDiscovery(userId);
    return ok(report);
  } catch (err) {
    return toErrorResponse(err);
  }
}
