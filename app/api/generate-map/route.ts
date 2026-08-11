import { env } from "cloudflare:workers";
import { AI_MAP_DETAIL_OPTIONS, AI_MAP_RESPONSE_SCHEMA, buildAiMapInput, parseAiMapDraft, parseAiMapRequest } from "../../lib/aiMap";
import { readAiConfig, requestClaudeJson } from "../../lib/aiProvider";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = parseAiMapRequest(await request.json().catch(() => null));
  if (!parsed) return Response.json({ error: "請輸入至少三個字的主題，並選擇詳細程度。" }, { status: 400 });
  const workerEnv = env as unknown as Record<string, string | undefined>;
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  const config = readAiConfig(workerEnv, nodeEnv);
  if (!config) return Response.json({ error: "AI 尚未啟用，管理者需先設定 API 金鑰。", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const result = await requestClaudeJson({
      config,
      system: "你是心智圖資訊架構師。把使用者主題轉成清楚、可行動、可直接閱讀的階層，不捏造特定事實。",
      content: [{ type: "text", text: buildAiMapInput(parsed) }],
      schema: AI_MAP_RESPONSE_SCHEMA,
      schemaName: "generated_mind_map",
      maxTokens: parsed.detail === "deep" ? 3600 : 2400,
      signal: controller.signal,
    });
    if (!result.ok) {
      const status = result.status === 429 ? 429 : result.status === 401 ? 503 : 502;
      const message = result.status === 429 ? "AI 使用量暫時已達上限，請稍後重試。" : result.status === 401 ? "AI 服務設定無效，請管理者檢查 API 金鑰。" : "AI 服務暫時無法回應，請稍後重試。";
      return Response.json({ error: message }, { status });
    }
    const draft = parseAiMapDraft(JSON.parse(result.text), AI_MAP_DETAIL_OPTIONS[parsed.detail].maximumNodes);
    if (!draft) return Response.json({ error: "AI 產圖結構不完整，請換個描述再試一次。" }, { status: 502 });
    return Response.json({ draft });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "AI 產圖逾時，請改用較精簡的詳細程度。" : "AI 產圖結果無法解析，請再試一次。";
    return Response.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
