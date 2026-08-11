// Anthropic Messages API client shared by the AI routes.
//
// The base URL is configurable so the same code runs against api.anthropic.com
// or an Anthropic-compatible gateway. Defaults target Zeabur AI Hub, which is
// what this deployment uses.
//
// JSON comes back through a forced tool call rather than output_config.format.
// Zeabur proxies Claude via Vertex AI, whose organization policy blocks the
// structured_outputs feature: output_config is dropped without an error (the
// model just answers in prose) and strict tool use is rejected outright with
// `constraints/vertexai.allowedPartnerModelFeatures`. A non-strict tool with a
// forced tool_choice is unaffected, returns an already-parsed object, and still
// lets the schema's own bounds guide the model.

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

/** The input of the forced tool call. Prose or a refusal yields null. */
export function extractClaudeToolInput(value: unknown, toolName: string): unknown {
  if (!value || typeof value !== "object") return null;
  const content = (value as Record<string, unknown>).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const part = block as Record<string, unknown>;
    if (part.type === "tool_use" && part.name === toolName && part.input && typeof part.input === "object") {
      return part.input;
    }
  }
  return null;
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
  | { ok: true; data: unknown }
  | { ok: false; status: number };

/**
 * Sends one request and returns the tool call's arguments. `status` on failure
 * is the upstream HTTP status, or 502 when the reply arrived without a usable
 * tool call — callers map it to their own wording.
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
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: "user", content: request.content }],
      // No `strict: true` — Vertex rejects it as a structured_outputs feature.
      tools: [{
        name: request.schemaName,
        description: "以指定結構輸出結果。這是唯一的回覆方式，不要改用文字回答。",
        input_schema: request.schema,
      }],
      tool_choice: { type: "tool", name: request.schemaName },
    }),
    signal: request.signal,
  });
  if (!response.ok) return { ok: false, status: response.status };

  const body = await response.json() as Record<string, unknown>;
  // A refusal, or a reply truncated before the tool call closed, leaves nothing
  // usable — `max_tokens` would otherwise surface as a half-built object.
  if (body.stop_reason === "refusal" || body.stop_reason === "max_tokens") return { ok: false, status: 502 };
  const data = extractClaudeToolInput(body, request.schemaName);
  return data ? { ok: true, data } : { ok: false, status: 502 };
}
