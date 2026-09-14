import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { parseResume } from "@/modules/cv/service";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({ resumeId: z.string() });

/** Parse + analyse a stored CV (spec §1, §2, §13). */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { resumeId } = schema.parse(await req.json());
    const result = await parseResume(userId, resumeId);
    return ok(result);
  } catch (err) {
    if (err instanceof Error && /PDF|scan|analysed|not found/i.test(err.message)) {
      return fail(err.message, 422);
    }
    return toErrorResponse(err);
  }
}

/** Read the stored analysis without re-parsing. */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const resumeId = searchParams.get("resumeId");
    if (!resumeId) return fail("Missing resumeId", 400);

    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, userId },
      include: { evidence: { orderBy: { confidence: "desc" } }, analyses: true },
    });
    if (!resume) return fail("CV not found", 404);

    return ok({
      resume: {
        id: resume.id, name: resume.name, fileName: resume.fileName,
        parsedAt: resume.parsedAt, isDefault: resume.isDefault,
      },
      parsed: resume.parsedData,
      evidence: resume.evidence,
      sectionScores: resume.analyses,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
