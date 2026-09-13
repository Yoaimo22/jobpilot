import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { fetchSource } from "@/modules/jobs/sources";
import { z } from "zod";

export const dynamic = "force-dynamic";

const KINDS = ["remotive", "arbeitnow", "greenhouse", "lever"] as const;

export async function GET() {
  try {
    const userId = await requireUserId();
    const sources = await prisma.discoverySource.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return ok(sources);
  } catch (err) {
    return toErrorResponse(err);
  }
}

const createSchema = z.object({
  kind: z.enum(KINDS),
  identifier: z.string().max(120).default(""),
  label: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { kind, identifier, label } = createSchema.parse(await req.json());

    const needsId = kind === "greenhouse" || kind === "lever";
    const id = identifier.trim();
    if (needsId && !id) {
      return fail("This source needs a company board name.", 422);
    }

    // Validate the source actually returns jobs before saving it, so the user
    // finds out immediately instead of after a silent empty run.
    const probe = await fetchSource(kind, id, []);
    if (probe.error) {
      return fail(
        `Could not reach that source: ${probe.error}. Check the company name is exactly as it appears in their careers-page URL.`,
        422
      );
    }

    const source = await prisma.discoverySource.upsert({
      where: { userId_kind_identifier: { userId, kind, identifier: id } },
      create: { userId, kind, identifier: id, label: label || null, lastCount: probe.jobs.length },
      update: { enabled: true, label: label || null, lastCount: probe.jobs.length },
    });

    return ok({ source, foundNow: probe.jobs.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}

const patchSchema = z.object({ id: z.string(), enabled: z.boolean() });

export async function PATCH(req: Request) {
  try {
    const userId = await requireUserId();
    const { id, enabled } = patchSchema.parse(await req.json());
    await prisma.discoverySource.updateMany({ where: { id, userId }, data: { enabled } });
    return ok({ updated: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return fail("Missing id", 400);
    await prisma.discoverySource.deleteMany({ where: { id, userId } });
    return ok({ deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
