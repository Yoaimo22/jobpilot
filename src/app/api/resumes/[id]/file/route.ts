import { prisma } from "@/lib/prisma";
import { requireUserId, fail, toErrorResponse } from "@/lib/api";
import { readFile } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const resume = await prisma.resume.findFirst({ where: { id, userId } });
    if (!resume) return fail("Resume not found", 404);
    const buffer = await readFile(resume.filePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": resume.mimeType,
        "Content-Disposition": `inline; filename="${resume.fileName}"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
