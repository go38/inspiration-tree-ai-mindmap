import { env } from "cloudflare:workers";
import { buildAiInput, parseAiResponse, parseAiSuggestRequest } from "../../lib/ai";

export const dynamic = "force-dynamic";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "suggestions"],
  properties: {
    summary: { type: "string" },
    suggestions: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "note", "sourceNodeIds"],
        properties: {
          title: { type: "string" },
          note: { type: "string" },
          sourceNodeIds: { type: "array", items: { type: "integer" } },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseAiSuggestRequest(body);
  if (!parsed) return Response.json({ error: "AI 請求格式不正確，請重新選取節點後再試。" }, { status: 400 });

  const runtime = env as unknown as Record<string, string | undefined>;
  const apiKey = runtime.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "AI 尚未啟用，管理者需先設定 OpenAI API 金鑰。", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: runtime.OPENAI_MODEL || "gpt-5.6-luna",
        instructions: "你是協助使用者整理心智圖的思考夥伴。輸出必須安全、具體、彼此不重複，不得捏造使用者未提供的事實。",
        input: buildAiInput(parsed),
        reasoning: { effort: "low" },
        max_output_tokens: 1400,
        text: { format: { type: "json_schema", name: "mind_map_suggestions", strict: true, schema: RESPONSE_SCHEMA } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status === 401 ? 503 : 502;
      const message = response.status === 429 ? "AI 使用量暫時已達上限，請稍後重試。" : response.status === 401 ? "AI 服務設定無效，請管理者檢查 API 金鑰。" : "AI 服務暫時無法回應，請稍後重試。";
      return Response.json({ error: message }, { status });
    }
    const result = await response.json() as { output_text?: string };
    const json = result.output_text ? JSON.parse(result.output_text) : null;
    const validated = parseAiResponse(json, new Set(parsed.nodes.map((node) => node.id)));
    if (!validated) return Response.json({ error: "AI 回覆格式不完整，請再試一次。" }, { status: 502 });
    return Response.json(validated);
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "AI 回應逾時，請縮小選取範圍後重試。" : "AI 回覆無法解析，請再試一次。";
    return Response.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
