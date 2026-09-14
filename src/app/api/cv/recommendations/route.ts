import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { generateRecommendations } from "@/modules/cv/service";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const genSchema = z.object({
  resumeId: z.string(),
  jobId: z.string(),
  mode: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]).default("BALANCED"),
});

/** Generate recommendations. They are stored PENDING; nothing is applied (§28). */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { resumeId, jobId, mode } = genSchema.parse(await req.json());
    const result = await generateRecommendations(userId, resumeId, jobId, mode);
    return ok(result);
  } catch (err) {
    if (err instanceof Error && /not been analysed|not found/i.test(err.message)) {
      return fail(err.message, 422);
    }
    return toErrorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const resumeId = searchParams.get("resumeId");
    const jobId = searchParams.get("jobId");
    if (!resumeId) return fail("Missing resumeId", 400);

    // ownership check
    const owns = await prisma.resume.findFirst({ where: { id: resumeId, userId }, select: { id: true } });
    if (!owns) return fail("CV not found", 404);

    const rows = await prisma.cvRecommendation.findMany({
      where: { resumeId, ...(jobId ? { jobId } : {}) },
      orderBy: [{ section: "asc" }, { createdAt: "asc" }],
    });
    return ok(rows);
  } catch (err) {
    return toErrorResponse(err);
  }
}

const decideSchema = z.object({
  id: z.string(),
  status: z.enum(["ACCEPTED", "REJECTED", "MODIFIED", "PENDING"]),
  /** Text the user picked from options, or typed themselves. */
  chosenText: z.string().max(4000).optional(),
});

/** Record the user's decision on one recommendation (spec §9, §18, §36). */
export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const { id, status, chosenText } = decideSchema.parse(await req.json());

    const rec = await prisma.cvRecommendation.findFirst({
      where: { id, resume: { userId } },
    });
    if (!rec) return fail("Recommendation not found", 404);

    // A fabricating suggestion can never be accepted (spec §10 hard rule).
    if (status === "ACCEPTED" && rec.recommendationType === "NOT_ALLOWED") {
      return fail(
        "This suggestion is blocked: it claims experience your CV does not evidence. It cannot be applied.",
        422
      );
    }

    const updated = await prisma.cvRecommendation.update({
      where: { id },
      data: { status, userText: chosenText ?? rec.userText },
    });
    return ok(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
