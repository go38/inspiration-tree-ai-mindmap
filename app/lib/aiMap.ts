import { autoLayoutNodes, type NodeItem } from "./mindmap.ts";

export type AiMapDetail = "concise" | "standard" | "deep";
export type AiMapRequest = { prompt: string; detail: AiMapDetail };
export type AiMapDraftNode = {
  key: string;
  parentKey: string | null;
  text: string;
  note: string;
  tone: NodeItem["tone"];
};
export type AiMapDraft = {
  title: string;
  summary: string;
  nodes: AiMapDraftNode[];
};

export const AI_MAP_DETAIL_OPTIONS: Record<AiMapDetail, { label: string; description: string; maximumNodes: number }> = {
  concise: { label: "精簡", description: "約 8–12 個節點，快速看見骨架", maximumNodes: 12 },
  standard: { label: "標準", description: "約 13–24 個節點，兼顧結構與行動", maximumNodes: 24 },
  deep: { label: "深入", description: "約 25–40 個節點，展開更多細節", maximumNodes: 40 },
};

export const AI_MAP_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "nodes"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    nodes: {
      type: "array",
      minItems: 3,
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "parentKey", "text", "note", "tone"],
        properties: {
          key: { type: "string" },
          parentKey: { type: ["string", "null"] },
          text: { type: "string" },
          note: { type: "string" },
          tone: { type: "string", enum: ["ink", "coral", "sage", "sun"] },
        },
      },
    },
  },
} as const;

const TONES = new Set<NodeItem["tone"]>(["ink", "coral", "sage", "sun"]);

export function parseAiMapRequest(value: unknown): AiMapRequest | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const prompt = typeof source.prompt === "string" ? source.prompt.trim().slice(0, 1200) : "";
  const detail = source.detail === "concise" || source.detail === "deep" ? source.detail : source.detail === "standard" ? "standard" : null;
  return prompt.length >= 3 && detail ? { prompt, detail } : null;
}

export function buildAiMapInput(request: AiMapRequest): string {
  const option = AI_MAP_DETAIL_OPTIONS[request.detail];
  return [
    `主題與需求：${request.prompt}`,
    `詳細程度：${option.label}；最多 ${option.maximumNodes} 個節點。`,
    "請建立一張可直接使用的心智圖。只能有一個 parentKey 為 null 的中心節點；其餘節點必須引用前面已存在的 parentKey。",
    "第一層需彼此互補，第二層以後提供具體資訊、行動、例子、衡量方式或風險；避免同義重複與空泛標題。",
    "key 使用簡短 ASCII 識別字且不得重複。中心 tone 使用 ink，其餘使用 coral、sage、sun 平衡分配。",
    "使用繁體中文與臺灣常用語。不得捏造使用者未提供的特定事實；資訊不足時以規劃建議表述。",
  ].join("\n");
}

export function parseAiMapDraft(value: unknown, maximumNodes = 24): AiMapDraft | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const title = typeof source.title === "string" ? source.title.trim().slice(0, 80) : "";
  const summary = typeof source.summary === "string" ? source.summary.trim().slice(0, 500) : "";
  if (!title || !summary || !Array.isArray(source.nodes) || source.nodes.length < 3 || source.nodes.length > maximumNodes) return null;
  const keys = new Set<string>();
  const nodes: AiMapDraftNode[] = [];
  for (let index = 0; index < source.nodes.length; index += 1) {
    const item = source.nodes[index];
    if (!item || typeof item !== "object") return null;
    const node = item as Record<string, unknown>;
    const key = typeof node.key === "string" ? node.key.trim().slice(0, 48) : "";
    const parentKey = node.parentKey === null ? null : typeof node.parentKey === "string" ? node.parentKey.trim().slice(0, 48) : "";
    const text = typeof node.text === "string" ? node.text.trim().slice(0, 60) : "";
    const note = typeof node.note === "string" ? node.note.trim().slice(0, 220) : "";
    const tone = typeof node.tone === "string" && TONES.has(node.tone as NodeItem["tone"]) ? node.tone as NodeItem["tone"] : null;
    if (!key || keys.has(key) || !text || !note || !tone) return null;
    if (index === 0 && (parentKey !== null || tone !== "ink")) return null;
    if (index > 0 && (!parentKey || !keys.has(parentKey))) return null;
    keys.add(key);
    nodes.push({ key, parentKey, text, note, tone });
  }
  if (nodes.filter((node) => node.parentKey === null).length !== 1) return null;
  return { title, summary, nodes };
}

export function materializeAiMapDraft(draft: AiMapDraft): NodeItem[] {
  const idByKey = new Map(draft.nodes.map((node, index) => [node.key, index + 1]));
  return autoLayoutNodes(draft.nodes.map((node, index): NodeItem => ({
    id: index + 1,
    parent: node.parentKey === null ? null : idByKey.get(node.parentKey)!,
    text: node.text,
    note: node.note,
    x: 0,
    y: 0,
    tone: node.parentKey === null ? "ink" : node.tone,
  })));
}
