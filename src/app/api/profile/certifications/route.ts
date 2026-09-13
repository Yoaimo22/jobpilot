import { prisma } from "@/lib/prisma";
import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { certificationSchema } from "@/lib/validators";
import { ensureProfileId } from "@/modules/profile/service";

export async function GET() {
  try {
    const userId = await requireUserId();
    const profileId = await ensureProfileId(userId);
    const items = await prisma.certification.findMany({
      where: { profileId },
      orderBy: { issueDate: "desc" },
    });
    return ok(items);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const profileId = await ensureProfileId(userId);
    const data = certificationSchema.parse(await req.json());
    const item = await prisma.certification.create({
      data: {
        profileId,
        name: data.name,
        issuer: data.issuer || null,
        issueDate: data.issueDate ? new Date(data.issueDate) : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        credentialId: data.credentialId || null,
        url: data.url || null,
      },
    });
    return ok(item);
  } catch (err) {
    return toErrorResponse(err);
  }
}
