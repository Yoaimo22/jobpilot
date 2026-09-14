import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  skill: z.string().min(1).max(120),
  confirmation: z.enum(["YES", "NO", "NOT_SURE"]),
  askedBecause: z.string().max(1000).optional(),
});

/**
 * Record the user's own answer about a hinted skill (spec §11).
 * A NO is binding: the skill is never again presented as owned.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { skill, confirmation, askedBecause } = schema.parse(await req.json());

    const row = await prisma.userVerifiedSkill.upsert({
      where: { userId_skill: { userId, skill } },
      create: { userId, skill, confirmation, askedBecause: askedBecause ?? null },
      update: { confirmation, askedBecause: askedBecause ?? undefined },
    });

    // A NO invalidates any pending suggestion that leans on this skill.
    if (confirmation === "NO") {
      const pending = await prisma.cvRecommendation.findMany({
        where: { resume: { userId }, status: "PENDING" },
        select: { id: true, relatedSkills: true },
      });
      const affected = pending
        .filter((p) => p.relatedSkills.some((s) => s.toLowerCase() === skill.toLowerCase()))
        .map((p) => p.id);
      if (affected.length) {
        await prisma.cvRecommendation.updateMany({
          where: { id: { in: affected } },
          data: { recommendationType: "NOT_ALLOWED", status: "REJECTED" },
        });
      }
    }

    // A YES releases suggestions that were held back purely for confirmation.
    if (confirmation === "YES") {
      const held = await prisma.cvRecommendation.findMany({
        where: { resume: { userId }, recommendationType: "REQUIRES_CONFIRMATION", status: "PENDING" },
        select: { id: true, relatedSkills: true },
      });
      const releasable = held
        .filter((p) => p.relatedSkills.some((s) => s.toLowerCase() === skill.toLowerCase()))
        .map((p) => p.id);
      if (releasable.length) {
        await prisma.cvRecommendation.updateMany({
          where: { id: { in: releasable } },
          data: { recommendationType: "RELATED_SKILL" },
        });
      }
    }

    return ok(row);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const rows = await prisma.userVerifiedSkill.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return ok(rows);
  } catch (err) {
    return toErrorResponse(err);
  }
}
