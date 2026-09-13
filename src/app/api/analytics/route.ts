import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { getAnalytics } from "@/modules/analytics/service";

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await getAnalytics(userId));
  } catch (err) {
    return toErrorResponse(err);
  }
}
