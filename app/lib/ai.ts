import { parseNodes, type NodeItem } from "./mindmap.ts";

export type AiMode = "diverge" | "breakdown" | "challenge";

export type AiSuggestion = {
  title: string;
  note: string;
  sourceNodeIds: number[];
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
  diverge: { label: "發散", description: "提出更多可能" },
  breakdown: { label: "拆解", description: "轉成可執行步驟" },
  challenge: { label: "質疑", description: "找出假設、風險與盲點" },
};

export function parseAiSuggestRequest(value: unknown): AiSuggestRequest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (input.mode !== "diverge" && input.mode !== "breakdown" && input.mode !== "challenge") return null;
  const nodes = parseNodes(input.nodes);
  if (!nodes || nodes.length > 120) return null;
  const focusNodeId = typeof input.focusNodeId === "number" ? input.focusNodeId : NaN;
  if (!nodes.some((node) => node.id === focusNodeId)) return null;
  const contextNodeIds = Array.isArray(input.contextNodeIds)
    ? [...new Set(input.contextNodeIds.filter((id): id is number => typeof id === "number" && nodes.some((node) => node.id === id)))].slice(0, 8)
    : [];
  const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 800) : "";
  return { mode: input.mode, prompt, focusNodeId, contextNodeIds, nodes };
}

export function buildAiInput(request: AiSuggestRequest): string {
  const focus = request.nodes.find((node) => node.id === request.focusNodeId)!;
  const selectedIds = request.contextNodeIds.length ? request.contextNodeIds : [focus.id];
  const context = selectedIds.map((id) => request.nodes.find((node) => node.id === id)).filter((node): node is NodeItem => Boolean(node));
  const contextLines = context.map((node) => `- [${node.id}] ${node.text}${node.note ? `：${node.note}` : ""}`).join("\n");
  return [
    `思考模式：${AI_MODE_LABELS[request.mode].label}（${AI_MODE_LABELS[request.mode].description}）`,
    `目前焦點：[${focus.id}] ${focus.text}${focus.note ? `：${focus.note}` : ""}`,
    "使用者選取的上下文節點：",
    contextLines,
    request.prompt ? `使用者問題：${request.prompt}` : "使用者問題：請依目前內容提出具體、有區別且可直接加入心智圖的建議。",
    "請使用繁體中文與臺灣常用語，每項建議標題簡潔，說明需具體。sourceNodeIds 只能使用上方方括號中的節點 ID。",
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
        return typeof item.id === "string" && (item.mode === "diverge" || item.mode === "breakdown" || item.mode === "challenge") && typeof item.prompt === "string" && typeof item.summary === "string" && Array.isArray(item.suggestions) && Array.isArray(item.adoptedTitles);
      });
      if (validTurns.length) history[nodeId] = validTurns;
    }
    return history;
  } catch {
    return {};
  }
}
