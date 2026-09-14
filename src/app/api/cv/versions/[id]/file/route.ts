import { prisma } from "@/lib/prisma";
import { requireUserId, fail, toErrorResponse } from "@/lib/api";
import { readFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Download a generated CV version (auth-scoped, private storage). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const version = await prisma.cvVersion.findFirst({ where: { id, userId } });
    if (!version?.filePath) return fail("CV version file not found", 404);

    const buffer = await readFile(version.filePath);
    const safeName = version.label.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60) || "cv";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}.pdf"`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
