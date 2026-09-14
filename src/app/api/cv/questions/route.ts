import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Skills the CV only HINTS at, which the user has not yet answered (spec §11).
 *
 * These are exactly the competencies the system refuses to use until the human
 * confirms them, so surfacing them is what unblocks honest optimisation.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const resumeId = searchParams.get("resumeId");
    if (!resumeId) return fail("Missing resumeId", 400);

    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, userId },
      include: { evidence: { where: { kind: "INFERRED_COMPETENCY" }, orderBy: { confidence: "desc" } } },
    });
    if (!resume) return fail("CV not found", 404);

    const answered = new Set(
      (await prisma.userVerifiedSkill.findMany({ where: { userId }, select: { skill: true } }))
        .map((v) => v.skill.toLowerCase())
    );

    const questions = resume.evidence
      .filter((e) => !answered.has(e.skill.toLowerCase()))
      .map((e) => ({
        skill: e.skill,
        quote: e.quote,
        confidence: e.confidence,
        question: `Kami menemukan pengalaman yang mungkin melibatkan ${e.skill}, tetapi ${e.skill} tidak disebutkan secara eksplisit di CV Anda. Apakah Anda benar-benar punya pengalaman memakai ${e.skill}?`,
      }));

    // Also surface REQUIRES_CONFIRMATION suggestions waiting on the same answer.
    const pendingRecs = await prisma.cvRecommendation.findMany({
      where: { resumeId, recommendationType: "REQUIRES_CONFIRMATION", status: "PENDING" },
      select: { relatedSkills: true },
    });
    const extra = [...new Set(pendingRecs.flatMap((r) => r.relatedSkills))]
      .filter((s) => !answered.has(s.toLowerCase()) && !questions.some((q) => q.skill.toLowerCase() === s.toLowerCase()))
      .map((s) => ({
        skill: s,
        quote: "Muncul dari rekomendasi yang menunggu konfirmasi.",
        confidence: 0.5,
        question: `Apakah Anda punya pengalaman nyata memakai ${s}?`,
      }));

    return ok([...questions, ...extra]);
  } catch (err) {
    return toErrorResponse(err);
  }
}
