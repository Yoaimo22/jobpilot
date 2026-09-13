import { prisma } from "@/lib/prisma";

/** Return the user's profile id, creating an empty profile if none exists. */
export async function ensureProfileId(userId: string): Promise<string> {
  const existing = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.profile.create({
    data: { userId },
    select: { id: true },
  });
  return created.id;
}
