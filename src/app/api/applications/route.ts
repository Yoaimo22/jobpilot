import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { createApplication } from "@/modules/applications/service";
import { z } from "zod";

export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim();

    const apps = await prisma.application.findMany({
      where: {
        userId,
        ...(status ? { status: status as never } : {}),
        ...(q
          ? {
              OR: [
                { job: { title: { contains: q, mode: "insensitive" } } },
                { company: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        job: { select: { title: true, location: true, originalUrl: true, source: { select: { name: true } } } },
        company: { select: { name: true, logoUrl: true } },
        resume: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return ok(apps);
  } catch (err) {
    return toErrorResponse(err);
  }
}

const createSchema = z.object({
  jobId: z.string(),
  force: z.boolean().optional(),
  resumeId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { jobId, force, resumeId } = createSchema.parse(await req.json());
    const result = await createApplication(userId, jobId, { force, resumeId });
    if (!result.created) {
      return fail(result.reason ?? "Blocked", result.reason === "duplicate" ? 409 : 422, {
        guard: result.guard,
        applicationId: result.applicationId,
      });
    }
    return ok(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
