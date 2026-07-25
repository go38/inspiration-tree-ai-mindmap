import { parseNodes, type NodeItem } from "./mindmap.ts";

export type AiMode = "expand" | "explain" | "diverge" | "breakdown" | "challenge";

export type AiSuggestion = {
  title: string;
  note: string;
  sourceNodeIds: number[];
};

export type AiExplanation = {
  definition: string;
  keyPoints: string[];
  connections: {
    nodeId: number;
    relation: string;
  }[];
  question: string;
};

export type AiTurn = {
  id: string;
  mode: AiMode;
  prompt: string;
  summary: string;
  suggestions: AiSuggestion[];
  adoptedTitles: string[];
};

export type AiHistory = Record<number, AiTurn[]>;

export type AiSuggestRequest = {
  mode: AiMode;
  prompt: string;
  focusNodeId: number;
  contextNodeIds: number[];
  nodes: NodeItem[];
};

export const AI_MODE_LABELS: Record<AiMode, { label: string; description: string }> = {
  expand: { label: "擴寫", description: "延伸成互補且不重複的子概念" },
  explain: { label: "解讀", description: "快速說明概念、重點與關聯" },
  diverge: { label: "發散", description: "提出更多可能" },
  breakdown: { label: "拆解", description: "轉成可執行步驟" },
  challenge: { label: "質疑", description: "找出假設、風險與盲點" },
};

const AI_MODES = new Set<AiMode>(["expand", "explain", "diverge", "breakdown", "challenge"]);

export function extractAiResponseText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  if (!Array.isArray(response.output)) return null;

  const text = response.output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const output = part as Record<string, unknown>;
      return output.type === "output_text" && typeof output.text === "string" && output.text.trim() ? [output.text.trim()] : [];
    });
  }).join("\n");

  return text || null;
}

export function parseAiSuggestRequest(value: unknown): AiSuggestRequest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.mode !== "string" || !AI_MODES.has(input.mode as AiMode)) return null;
  const nodes = parseNodes(input.nodes);
  if (!nodes || nodes.length > 120) return null;
  const focusNodeId = typeof input.focusNodeId === "number" ? input.focusNodeId : NaN;
  if (!nodes.some((node) => node.id === focusNodeId)) return null;
  const contextNodeIds = Array.isArray(input.contextNodeIds)
    ? [...new Set(input.contextNodeIds.filter((id): id is number => typeof id === "number" && nodes.some((node) => node.id === id)))].slice(0, 8)
    : [];
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 800) : "";
  return { mode: input.mode as AiMode, prompt, focusNodeId, contextNodeIds, nodes };
}

export function buildAiInput(request: AiSuggestRequest): string {
  const focus = request.nodes.find((node) => node.id === request.focusNodeId)!;
  const compact = (value: string, maximum: number) => value.trim().slice(0, maximum);
  const byId = new Map(request.nodes.map((node) => [node.id, node]));
  const ancestors: NodeItem[] = [];
  let current = focus.parent === null ? undefined : byId.get(focus.parent);
  while (current && ancestors.length < request.nodes.length) {
    ancestors.unshift(current);
    current = current.parent === null ? undefined : byId.get(current.parent);
  }
  const children = request.nodes.filter((node) => node.parent === focus.id);
  const selectedIds = [...new Set([
    ...ancestors.map((node) => node.id),
    focus.id,
    ...children.map((node) => node.id),
    ...request.contextNodeIds,
  ])].slice(0, 20);
  const context = selectedIds.map((id) => byId.get(id)).filter((node): node is NodeItem => Boolean(node));
  const contextLines = context.map((node) => {
    const relationship = node.id === focus.id
      ? "目前節點"
      : ancestors.some((ancestor) => ancestor.id === node.id)
        ? "上層脈絡"
        : node.parent === focus.id
          ? "既有子節點"
          : "相關節點";
    return `- [${node.id}]（${relationship}）${compact(node.text, 80)}${node.note ? `：${compact(node.note, 220)}` : ""}`;
  }).join("\n");
  const existingChildren = children.map((node) => compact(node.text, 60)).join("、").slice(0, 1200) || "目前沒有子節點";
  const taskInstruction = request.mode === "explain"
    ? [
        "任務：解讀目前節點的概念。",
        "先用白話建立清楚定義，再整理 2 至 4 個核心重點；只連結上方確實存在的節點。",
        "若資訊不足，必須用保留語氣指出可能解讀，不得把推測寫成事實。",
      ]
    : request.mode === "expand"
      ? [
        "任務：為目前節點擴寫 3 至 6 個可以直接加入心智圖的子節點。",
        `目前已有的直接子節點：${existingChildren}。請避免同義重複，讓新節點彼此互補並能推動下一步思考。`,
      ]
      : [
        `任務：依「${AI_MODE_LABELS[request.mode].label}」模式提出 3 至 6 個可以直接加入心智圖的具體建議。`,
        `目前已有的直接子節點：${existingChildren}。請避免同義重複。`,
      ];
  return [
    `思考模式：${AI_MODE_LABELS[request.mode].label}（${AI_MODE_LABELS[request.mode].description}）`,
    `目前焦點：[${focus.id}] ${compact(focus.text, 80)}${focus.note ? `：${compact(focus.note, 220)}` : ""}`,
    "可用的心智圖脈絡：",
    contextLines,
    ...taskInstruction,
    request.prompt ? `使用者補充方向：${request.prompt}` : "使用者沒有補充方向，請直接依目前內容完成任務。",
    "請使用繁體中文與臺灣常用語，文字清楚、精簡且具體。若輸出包含 sourceNodeIds 或 connections.nodeId，只能使用上方方括號中的節點 ID。",
  ].join("\n");
}

export function parseAiResponse(value: unknown, allowedNodeIds: Set<number>): { summary: string; suggestions: AiSuggestion[] } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const summary = typeof data.summary === "string" ? data.summary.trim().slice(0, 500) : "";
  if (!summary || !Array.isArray(data.suggestions)) return null;
  const suggestions = data.suggestions.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const suggestion = item as Record<string, unknown>;
    const title = typeof suggestion.title === "string" ? suggestion.title.trim().slice(0, 60) : "";
    const note = typeof suggestion.note === "string" ? suggestion.note.trim().slice(0, 180) : "";
    const sourceNodeIds = Array.isArray(suggestion.sourceNodeIds)
      ? [...new Set(suggestion.sourceNodeIds.filter((id): id is number => typeof id === "number" && allowedNodeIds.has(id)))].slice(0, 8)
      : [];
    return title && note ? [{ title, note, sourceNodeIds }] : [];
  });
  return suggestions.length ? { summary, suggestions } : null;
}

export function parseAiExplanationResponse(value: unknown, allowedNodeIds: Set<number>): { summary: string; explanation: AiExplanation } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const summary = typeof data.summary === "string" ? data.summary.trim().slice(0, 240) : "";
  if (!summary || !data.explanation || typeof data.explanation !== "object") return null;
  const source = data.explanation as Record<string, unknown>;
  const definition = typeof source.definition === "string" ? source.definition.trim().slice(0, 600) : "";
  const keyPoints = Array.isArray(source.keyPoints)
    ? source.keyPoints.slice(0, 4).flatMap((point) => typeof point === "string" && point.trim() ? [point.trim().slice(0, 220)] : [])
    : [];
  const connections = Array.isArray(source.connections)
    ? source.connections.slice(0, 4).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const connection = item as Record<string, unknown>;
        const nodeId = typeof connection.nodeId === "number" && allowedNodeIds.has(connection.nodeId) ? connection.nodeId : null;
        const relation = typeof connection.relation === "string" ? connection.relation.trim().slice(0, 220) : "";
        return nodeId !== null && relation ? [{ nodeId, relation }] : [];
      })
    : [];
  const question = typeof source.question === "string" ? source.question.trim().slice(0, 220) : "";
  if (!definition || keyPoints.length < 2 || !question) return null;
  return { summary, explanation: { definition, keyPoints, connections, question } };
}

export function parseAiHistory(raw: string | null): AiHistory {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return {};
    const history: AiHistory = {};
    for (const [key, turns] of Object.entries(value)) {
      const nodeId = Number(key);
      if (!Number.isInteger(nodeId) || !Array.isArray(turns)) continue;
      const validTurns = turns.slice(-12).filter((turn): turn is AiTurn => {
        if (!turn || typeof turn !== "object") return false;
        const item = turn as Record<string, unknown>;
        return typeof item.id === "string" && typeof item.mode === "string" && AI_MODES.has(item.mode as AiMode) && typeof item.prompt === "string" && typeof item.summary === "string" && Array.isArray(item.suggestions) && Array.isArray(item.adoptedTitles);
      });
      if (validTurns.length) history[nodeId] = validTurns;
    }
    return history;
  } catch {
    return {};
  }
}
