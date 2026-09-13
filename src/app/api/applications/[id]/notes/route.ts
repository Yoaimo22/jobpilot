import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { noteSchema } from "@/lib/validators";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const app = await prisma.application.findFirst({ where: { id, userId } });
    if (!app) return fail("Application not found", 404);
    const { content } = noteSchema.parse(await req.json());
    const note = await prisma.applicationNote.create({
      data: { applicationId: id, content },
    });
    return ok(note);
  } catch (err) {
    return toErrorResponse(err);
  }
}
