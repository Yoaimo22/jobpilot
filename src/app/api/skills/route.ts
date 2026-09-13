import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { skillSchema } from "@/lib/validators";

export async function GET() {
  try {
    const userId = await requireUserId();
    const skills = await prisma.userSkill.findMany({
      where: { userId },
      include: { skill: true },
      orderBy: { skill: { name: "asc" } },
    });
    return ok(
      skills.map((s) => ({
        id: s.id,
        name: s.skill.name,
        category: s.skill.category,
        level: s.level,
        years: s.years,
      }))
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const data = skillSchema.parse(await req.json());
    const name = data.name.trim();

    const skill = await prisma.skill.upsert({
      where: { name },
      create: { name, category: data.category ?? null },
      update: {},
    });

    const userSkill = await prisma.userSkill.upsert({
      where: { userId_skillId: { userId, skillId: skill.id } },
      create: { userId, skillId: skill.id, level: data.level, years: data.years ?? null },
      update: { level: data.level, years: data.years ?? null },
      include: { skill: true },
    });

    return ok({
      id: userSkill.id,
      name: userSkill.skill.name,
      level: userSkill.level,
      years: userSkill.years,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
