import { env } from "cloudflare:workers";
import { AI_MAP_RESPONSE_SCHEMA, parseAiMapDraft } from "../../lib/aiMap";
import { extractAiResponseText } from "../../lib/ai";
import { extractWebsiteText, parseKnowledgeImportRequest } from "../../lib/knowledgeImport";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = parseKnowledgeImportRequest(await request.json().catch(() => null));
  if (!parsed) return Response.json({ error: "知識來源格式不正確；請確認網址、PDF 或逐字稿內容。" }, { status: 400 });
  const workerEnv = env as unknown as Record<string, string | undefined>;
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  const apiKey = workerEnv.OPENAI_API_KEY || nodeEnv.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "AI 尚未啟用，管理者需先設定 OpenAI API 金鑰。", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  let sourceText = parsed.content;
  if (parsed.sourceType === "website") {
    try {
      const page = await fetch(parsed.url, {
        headers: { "user-agent": "InspirationTreeKnowledgeImporter/1.0" },
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
      });
      if (page.status >= 300 && page.status < 400) {
        return Response.json({ error: "網站有重新導向，請貼上重新導向後的最終 HTTPS 網址。" }, { status: 422 });
      }
      const contentType = page.headers.get("content-type") ?? "";
      const contentLength = Number(page.headers.get("content-length") ?? 0);
      if (!page.ok || !contentType.includes("text/html") || contentLength > 1_500_000) {
        return Response.json({ error: "網站無法讀取、不是 HTML，或內容超過限制。" }, { status: 422 });
      }
      sourceText = extractWebsiteText((await page.text()).slice(0, 1_500_000));
      if (sourceText.length < 80) return Response.json({ error: "網站正文太少，可能需要登入或由 JavaScript 載入。" }, { status: 422 });
    } catch {
      return Response.json({ error: "網站讀取逾時或拒絕存取，請改貼上正文。" }, { status: 422 });
    }
  }

  const sourceLabel = parsed.sourceType === "pdf" ? parsed.filename : parsed.sourceType === "website" ? parsed.url : parsed.url || "影音逐字稿";
  const instruction = [
    `來源：${sourceLabel}`,
    "請忠實把來源內容整理成一張繁體中文心智圖，不加入來源沒有支持的特定事實。",
    "保留重要定義、論點、步驟、例子與限制；用 note 提供足以理解的來源摘要。",
    "產生 8 至 30 個節點；只能有一個中心節點，父節點必須在子節點之前。",
  ].join("\n");
  const content: Record<string, unknown>[] = [{ type: "input_text", text: parsed.sourceType === "pdf" ? instruction : `${instruction}\n\n來源正文：\n${sourceText}` }];
  if (parsed.sourceType === "pdf") {
    content.push({
      type: "input_file",
      filename: parsed.filename,
      file_data: parsed.fileData.slice("data:application/pdf;base64,".length),
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: workerEnv.OPENAI_MODEL || nodeEnv.OPENAI_MODEL || "gpt-5.6-luna",
        instructions: "你是知識整理助手。只根據提供的文件、網頁正文或逐字稿建立階層化心智圖。",
        input: [{ role: "user", content }],
        reasoning: { effort: "low" },
        max_output_tokens: 3600,
        text: { verbosity: "low", format: { type: "json_schema", name: "knowledge_mind_map", strict: true, schema: AI_MAP_RESPONSE_SCHEMA } },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status === 401 ? 503 : 502;
      const message = response.status === 429 ? "AI 使用量暫時已達上限，請稍後重試。" : response.status === 401 ? "AI 服務設定無效，請管理者檢查 API 金鑰。" : "AI 暫時無法整理此來源，請稍後重試。";
      return Response.json({ error: message }, { status });
    }
    const outputText = extractAiResponseText(await response.json() as unknown);
    const draft = parseAiMapDraft(outputText ? JSON.parse(outputText) : null, 30);
    if (!draft) return Response.json({ error: "AI 整理出的階層不完整，請縮小來源範圍後重試。" }, { status: 502 });
    return Response.json({ draft, source: { type: parsed.sourceType, label: sourceLabel } });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError" ? "知識整理逾時，請縮短內容或換一份較小的文件。" : "AI 回覆無法解析，請再試一次。";
    return Response.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
