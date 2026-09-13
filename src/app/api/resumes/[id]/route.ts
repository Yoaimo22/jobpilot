import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { deleteFile } from "@/lib/storage";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isDefault: z.boolean().optional(),
  extractedSkills: z.array(z.string()).optional(),
  extractedFrameworks: z.array(z.string()).optional(),
  extractedLanguages: z.array(z.string()).optional(),
  extractedTools: z.array(z.string()).optional(),
  extractedCertifications: z.array(z.string()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const resume = await prisma.resume.findFirst({ where: { id, userId } });
    if (!resume) return fail("Resume not found", 404);
    const data = patchSchema.parse(await req.json());

    if (data.isDefault) {
      await prisma.resume.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const updated = await prisma.resume.update({ where: { id }, data });
    return ok(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const resume = await prisma.resume.findFirst({ where: { id, userId } });
    if (!resume) return fail("Resume not found", 404);
    await deleteFile(resume.filePath);
    await prisma.resume.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
