// Anthropic Messages API client shared by the AI routes.
//
// The base URL is configurable so the same code runs against api.anthropic.com
// or an Anthropic-compatible gateway. Defaults target Zeabur AI Hub, which is
// what this deployment uses.

const DEFAULT_BASE_URL = "https://hnd1.aihub.zeabur.ai";
const DEFAULT_MODEL = "claude-haiku-4-5";
const ANTHROPIC_VERSION = "2023-06-01";

export type AiConfig = { apiKey: string; baseUrl: string; model: string };

/** Reads AI_* settings, falling back to the OPENAI_* names the app shipped with. */
export function readAiConfig(
  workerEnv: Record<string, string | undefined>,
  nodeEnv: Record<string, string | undefined>,
): AiConfig | null {
  const pick = (name: string) => workerEnv[name] || nodeEnv[name];
  const apiKey = pick("AI_API_KEY") || pick("OPENAI_API_KEY");
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (pick("AI_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    // Deliberately no OPENAI_MODEL fallback: an inherited OpenAI model name
    // would be sent to Claude and fail on every request.
    model: pick("AI_MODEL") || DEFAULT_MODEL,
  };
}

/**
 * Anthropic structured outputs reject the length and range keywords OpenAI's
 * strict mode accepted, so they are stripped before the schema is sent. Every
 * bound they expressed is re-checked when the response is parsed — see
 * parseAiResponse, parseAiExplanationResponse and parseAiMapDraft — except the
 * minimum suggestion count, which is only requested in the prompt.
 */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum", "multipleOf",
]);

export function toAnthropicSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toAnthropicSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYWORDS.has(key))
      .map(([key, value]) => [key, toAnthropicSchema(value)]),
  );
}

/** The text of the first text block. Anything else (refusal, tool use) yields null. */
export function extractClaudeText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const content = (value as Record<string, unknown>).content;
  if (!Array.isArray(content)) return null;
  const text = content.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const part = block as Record<string, unknown>;
    return part.type === "text" && typeof part.text === "string" && part.text.trim() ? [part.text.trim()] : [];
  }).join("\n");
  return text || null;
}

export type ClaudeRequest = {
  config: AiConfig;
  system: string;
  content: Record<string, unknown>[];
  schema: unknown;
  schemaName: string;
  maxTokens: number;
  signal: AbortSignal;
};

export type ClaudeResult =
  | { ok: true; text: string }
  | { ok: false; status: number };

/**
 * Sends one structured-output request. `status` on failure is the upstream HTTP
 * status, or 502 when the reply arrived but carried no usable JSON — callers
 * map it to their own wording.
 */
export async function requestClaudeJson(request: ClaudeRequest): Promise<ClaudeResult> {
  const response = await fetch(`${request.config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": request.config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: request.config.model,
      // Claude Haiku 4.5 rejects output_config.effort, so only the format is set.
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: "user", content: request.content }],
      output_config: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          schema: toAnthropicSchema(request.schema),
        },
      },
    }),
    signal: request.signal,
  });
  if (!response.ok) return { ok: false, status: response.status };

  const body = await response.json() as Record<string, unknown>;
  // A refusal or a truncated reply both leave the JSON unusable.
  if (body.stop_reason === "refusal" || body.stop_reason === "max_tokens") return { ok: false, status: 502 };
  const text = extractClaudeText(body);
  return text ? { ok: true, text } : { ok: false, status: 502 };
}
