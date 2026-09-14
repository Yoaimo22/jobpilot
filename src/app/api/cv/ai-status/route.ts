import { ok, requireUserId, toErrorResponse } from "@/lib/api";
import { aiStatus, callWithFailover } from "@/modules/cv/ai-providers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Which free-tier AI providers are configured. Never returns key values —
 * only whether each env var is set.
 */
export async function GET() {
  try {
    await requireUserId();
    return ok(aiStatus());
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Live connection test. Sends one tiny rewrite request so the user can confirm
 * the key and model actually work, and see which provider answered.
 */
export async function POST() {
  try {
    await requireUserId();
    const status = aiStatus();
    if (!status.active) {
      return ok({
        tested: false,
        message: "Belum ada penyedia AI yang dikonfigurasi. Tambahkan salah satu API key di Environment Variables.",
        status,
      });
    }

    const prompt = [
      "Rewrite this CV sentence. Return 1 alternative.",
      "",
      "SENTENCE: Responsible for developing API using Node.js.",
      "",
      "TARGET JOB SKILLS: Node.js, REST API",
      "",
      "FULL CV TEXT — the ONLY source of truth. Do not use anything absent from it:",
      "Backend Engineer. Responsible for developing API using Node.js. Skills: Node.js, PostgreSQL.",
    ].join("\n");

    const result = await callWithFailover(prompt, 1);

    return ok({
      tested: true,
      success: result.ok,
      provider: result.provider ?? null,
      model: result.model ?? null,
      sample: result.ok
        ? (result.suggestions[0] as { recommended_text?: string } | undefined)?.recommended_text ?? null
        : null,
      errors: result.errors,
      status,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
