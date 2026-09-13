import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail, toErrorResponse } from "@/lib/api";
import { KNOWN_SOURCES } from "@/modules/jobs/providers";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password } = schema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail("An account with this email already exists.", 409);

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        profile: { create: { fullName: name, email } },
        jobPreference: { create: {} },
        automationRule: { create: {} },
      },
    });

    // Ensure job sources exist (global reference rows)
    await prisma.jobSource.createMany({
      data: KNOWN_SOURCES.map((s) => ({
        key: s.key,
        name: s.name,
        supportsApply: s.supportsApply,
      })),
      skipDuplicates: true,
    });

    return ok({ id: user.id, email: user.email });
  } catch (err) {
    return toErrorResponse(err);
  }
}
