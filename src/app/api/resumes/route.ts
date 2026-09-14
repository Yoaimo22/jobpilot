import { prisma } from "@/lib/prisma";
import { ok, fail, requireUserId, toErrorResponse } from "@/lib/api";
import { saveFile } from "@/lib/storage";
import { tryExtractPdfText } from "@/lib/pdf-text";
import { extractFromText } from "@/modules/resumes/extract";
import { notify } from "@/modules/notifications/service";

export async function GET() {
  try {
    const userId = await requireUserId();
    const resumes = await prisma.resume.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return ok(resumes);
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string | null)?.trim();
    const makeDefault = formData.get("isDefault") === "true";

    if (!file) return fail("No file uploaded", 400);
    if (file.type !== "application/pdf") return fail("Only PDF files are allowed", 415);
    if (file.size > 10 * 1024 * 1024) return fail("File too large (max 10MB)", 413);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { relativePath } = await saveFile(userId, file.name, buffer);

    // Extract text (best-effort; failure does not block upload)
    let extracted = {
      skills: [] as string[], frameworks: [] as string[], languages: [] as string[],
      tools: [] as string[], experience: "", education: "", certifications: [] as string[],
    };
    try {
      const text = await tryExtractPdfText(buffer);
      if (text) extracted = extractFromText(text);
    } catch (e) {
      console.warn("PDF extraction failed:", e);
    }

    const existingCount = await prisma.resume.count({ where: { userId } });
    const isDefault = makeDefault || existingCount === 0;
    if (isDefault) {
      await prisma.resume.updateMany({ where: { userId }, data: { isDefault: false } });
    }

    const resume = await prisma.resume.create({
      data: {
        userId,
        name: name || file.name.replace(/\.pdf$/i, ""),
        fileName: file.name,
        filePath: relativePath,
        fileSize: file.size,
        mimeType: file.type,
        isDefault,
        extractedSkills: extracted.skills,
        extractedFrameworks: extracted.frameworks,
        extractedLanguages: extracted.languages,
        extractedTools: extracted.tools,
        extractedExperience: extracted.experience,
        extractedEducation: extracted.education,
        extractedCertifications: extracted.certifications,
      },
    });

    return ok(resume);
  } catch (err) {
    return toErrorResponse(err);
  }
}
