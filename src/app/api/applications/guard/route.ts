import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { runApplicationGuard } from "@/modules/applications/guard";
import { z } from "zod";

const schema = z.object({ jobId: z.string() });

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { jobId } = schema.parse(await req.json());
    const guard = await runApplicationGuard({ userId, jobId });
    return ok(guard);
  } catch (err) {
    return toErrorResponse(err);
  }
}
