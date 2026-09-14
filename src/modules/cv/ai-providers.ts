/**
 * Free-tier AI provider registry with failover (spec §39).
 *
 * Design rules:
 *  - Every provider here has a PERMANENT free tier (no trial credit, no card).
 *  - All are OpenAI-compatible, so one client speaks to all of them.
 *  - Providers are tried in order; a rate limit (429) or any failure moves on to
 *    the next. When every provider is exhausted the caller falls back to the
 *    deterministic engine, so the feature degrades instead of breaking.
 *  - An LLM only ever ADDS phrasing options. Scoring, gap detection, and the
 *    truthfulness verdict stay in local code — a model is never trusted to
 *    decide what the user is allowed to claim.
 */

export interface ProviderConfig {
  id: string;
  name: string;
  /** OpenAI-compatible base URL (no trailing slash). */
  baseUrl: string;
  /** Env var holding the key. */
  keyEnv: string;
  /** Env var that may override the model. */
  modelEnv: string;
  defaultModel: string;
  /** Requests per minute on the free tier, for the UI to explain limits. */
  freeRpm: number;
  supportsJsonMode: boolean;
  signupUrl: string;
}

/**
 * Ordered by free-tier generosity and speed. Groq first: highest free rate
 * limit and the fastest inference of the group.
 */
export const FREE_PROVIDERS: ProviderConfig[] = [
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
    freeRpm: 30,
    supportsJsonMode: true,
    signupUrl: "https://console.groq.com/keys",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    modelEnv: "CEREBRAS_MODEL",
    defaultModel: "llama-3.3-70b",
    freeRpm: 30,
    supportsJsonMode: true,
    signupUrl: "https://cloud.cerebras.ai",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.0-flash",
    freeRpm: 15,
    supportsJsonMode: true,
    signupUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    defaultModel: "mistral-small-latest",
    freeRpm: 5,
    supportsJsonMode: true,
    signupUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    freeRpm: 20,
    supportsJsonMode: false,
    signupUrl: "https://openrouter.ai/keys",
  },
];

export interface ResolvedProvider extends ProviderConfig {
  apiKey: string;
  model: string;
}

/** Providers that actually have a key set, in failover order. */
export function resolveProviders(): ResolvedProvider[] {
  const out: ResolvedProvider[] = [];

  for (const p of FREE_PROVIDERS) {
    const apiKey = process.env[p.keyEnv];
    if (!apiKey) continue;
    out.push({ ...p, apiKey, model: process.env[p.modelEnv] || p.defaultModel });
  }

  // Generic escape hatch: any other OpenAI-compatible endpoint.
  const genericBase = process.env.LLM_API_BASE;
  const genericKey = process.env.LLM_API_KEY;
  if (genericBase && genericKey) {
    out.push({
      id: "custom",
      name: "Custom endpoint",
      baseUrl: genericBase.replace(/\/$/, ""),
      keyEnv: "LLM_API_KEY",
      modelEnv: "LLM_MODEL",
      defaultModel: process.env.LLM_MODEL || "gpt-4o-mini",
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      apiKey: genericKey,
      freeRpm: 0,
      supportsJsonMode: true,
      signupUrl: "",
    });
  }

  return out;
}

export interface CallResult {
  ok: boolean;
  provider?: string;
  model?: string;
  /** Raw suggestion objects for local validation. */
  suggestions: unknown[];
  /** Why each attempted provider failed, for diagnostics. */
  errors: { provider: string; error: string }[];
}

const TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT =
  "You rewrite CV sentences to be more professional and ATS-friendly. " +
  "ABSOLUTE RULE: never introduce any skill, technology, tool, metric, number, " +
  "duration, certification, employer, or responsibility that is not already " +
  "present in the provided CV text. Rephrase only what is there. " +
  'Reply with JSON only: {"suggestions":[{"original_text":"...",' +
  '"recommended_text":"...","type":"SAFE_REWRITE","evidence":["..."],' +
  '"related_skills":[],"unsupported_skills":[],"confidence":0.9,"reason":"..."}]}';

/**
 * Ask each configured provider in turn until one returns usable suggestions.
 * Never throws — a total failure returns ok:false and the caller continues
 * with deterministic options only.
 */
export async function callWithFailover(userPrompt: string, maxSuggestions = 3): Promise<CallResult> {
  const providers = resolveProviders();
  const errors: { provider: string; error: string }[] = [];

  if (!providers.length) {
    return { ok: false, suggestions: [], errors: [{ provider: "none", error: "No AI provider configured" }] };
  }

  for (const p of providers) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const body: Record<string, unknown> = {
        model: p.model,
        temperature: 0.3,
        max_tokens: 900,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      };
      if (p.supportsJsonMode) body.response_format = { type: "json_object" };

      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        errors.push({
          provider: p.name,
          error:
            res.status === 429 ? "Rate limit / quota reached — trying next provider"
            : res.status === 401 ? "API key rejected"
            : res.status === 404 ? `Model "${p.model}" not available`
            : `HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        });
        continue;
      }

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        errors.push({ provider: p.name, error: "Empty response" });
        continue;
      }

      const suggestions = parseSuggestions(content);
      if (!suggestions.length) {
        errors.push({ provider: p.name, error: "Response contained no usable suggestions" });
        continue;
      }

      return { ok: true, provider: p.name, model: p.model, suggestions: suggestions.slice(0, maxSuggestions), errors };
    } catch (e) {
      errors.push({
        provider: p.name,
        error: e instanceof Error && e.name === "AbortError" ? "Timed out" : e instanceof Error ? e.message : "Request failed",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, suggestions: [], errors };
}

/**
 * Pull the suggestion array out of a model reply. Tolerates providers without
 * JSON mode by locating the first JSON object or array in the text.
 */
function parseSuggestions(content: string): unknown[] {
  const attempt = (raw: string): unknown[] | null => {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.suggestions)) return obj.suggestions;
        // A single suggestion object returned bare.
        if (typeof obj.recommended_text === "string") return [obj];
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = attempt(content.trim());
  if (direct) return direct;

  // Strip markdown fences, then try the first balanced object/array.
  const unfenced = content.replace(/```(?:json)?/gi, "").trim();
  const fromUnfenced = attempt(unfenced);
  if (fromUnfenced) return fromUnfenced;

  const start = unfenced.search(/[[{]/);
  if (start >= 0) {
    for (let end = unfenced.length; end > start; end--) {
      const slice = unfenced.slice(start, end);
      const parsed = attempt(slice);
      if (parsed) return parsed;
    }
  }
  return [];
}

/** Status summary for the UI — never exposes key values. */
export function aiStatus() {
  const providers = resolveProviders();
  return {
    active: providers.length > 0,
    count: providers.length,
    providers: providers.map((p) => ({
      id: p.id,
      name: p.name,
      model: p.model,
      freeRpm: p.freeRpm,
    })),
    available: FREE_PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      keyEnv: p.keyEnv,
      defaultModel: p.defaultModel,
      freeRpm: p.freeRpm,
      signupUrl: p.signupUrl,
      configured: Boolean(process.env[p.keyEnv]),
    })),
  };
}
