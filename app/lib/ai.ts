import { parseNodes, type NodeItem } from "./mindmap.ts";

export type AiMode = "expand" | "explain" | "diverge" | "breakdown" | "challenge";
export type AiAssistantCommand = "expand" | "risks" | "swot" | "okr" | "brainstorm" | "simplify" | "translate" | "summary";

export type AiAssistantCommandDefinition = {
  id: AiAssistantCommand;
  label: string;
  icon: string;
  mode: AiMode;
  prompt: string;
  result: "suggestions" | "explanation";
};

export const AI_ASSISTANT_COMMANDS: AiAssistantCommandDefinition[] = [
  { id: "expand", label: "展開想法", icon: "✦", mode: "expand", prompt: "延伸成互補、可直接加入心智圖的具體子節點。", result: "suggestions" },
  { id: "risks", label: "找風險", icon: "△", mode: "challenge", prompt: "找出關鍵風險、隱藏假設、早期警訊與可行的緩解方式。", result: "suggestions" },
  { id: "swot", label: "SWOT", icon: "田", mode: "expand", prompt: "以優勢、劣勢、機會、威脅四個面向完成 SWOT；標題需清楚標示所屬面向。", result: "suggestions" },
  { id: "okr", label: "OKR", icon: "◎", mode: "breakdown", prompt: "把內容整理成一個清楚目標與 3 至 5 個可衡量關鍵結果；標題需標示 Objective 或 KR。", result: "suggestions" },
  { id: "brainstorm", label: "Brainstorm", icon: "☄", mode: "diverge", prompt: "進行開放式腦力激盪，提出跨角度、有區別且尚未出現的新方向。", result: "suggestions" },
  { id: "simplify", label: "簡化內容", icon: "≋", mode: "explain", prompt: "用初學者能懂的一句話簡化內容，保留核心意思並移除術語；核心重點也要使用短句。", result: "explanation" },
  { id: "translate", label: "翻譯成英文", icon: "文", mode: "explain", prompt: "將目前節點標題與說明準確翻譯成自然英文；definition 放完整譯文，核心重點說明關鍵用詞，其他文字仍以繁體中文呈現。", result: "explanation" },
  { id: "summary", label: "摘要", icon: "Σ", mode: "explain", prompt: "綜合目前節點、上層脈絡與直接子節點，先給一段精簡摘要，再列出最重要的核心重點。", result: "explanation" },
];

export function getAiAssistantCommand(id: string): AiAssistantCommandDefinition | null {
  return AI_ASSISTANT_COMMANDS.find((command) => command.id === id) ?? null;
}

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
