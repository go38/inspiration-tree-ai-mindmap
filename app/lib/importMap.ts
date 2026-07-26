import { autoLayoutNodes, parseNodes, type NodeItem } from "./mindmap.ts";

export type ImportFormat = "auto" | "json" | "markdown";
export type ImportSuccess = { ok: true; format: Exclude<ImportFormat, "auto">; title: string; nodes: NodeItem[] };
export type ImportFailure = { ok: false; message: string; line?: number; node?: number };
export type ImportResult = ImportSuccess | ImportFailure;

function validateHierarchy(nodes: NodeItem[]): ImportFailure | null {
  const ids = new Set<number>();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (ids.has(node.id)) return { ok: false, message: "節點 ID 重複。", node: index + 1 };
    ids.add(node.id);
  }
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.parent !== null && !ids.has(node.parent)) {
      return { ok: false, message: `找不到父節點 ${node.parent}。`, node: index + 1 };
    }
  }
  return null;
}

export function parseJsonImport(source: string): ImportResult {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    const match = error instanceof Error ? error.message.match(/position\s+(\d+)/i) : null;
    const position = match ? Number(match[1]) : 0;
    const line = source.slice(0, position).split("\n").length;
    return { ok: false, message: "JSON 語法無法解析。", line };
  }
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const rawNodes = Array.isArray(value) ? value : record?.nodes;
  if (!Array.isArray(rawNodes)) return { ok: false, message: "JSON 需為節點陣列，或包含 nodes 陣列。" };
  const hierarchyError = validateHierarchy(rawNodes.filter((item): item is NodeItem => Boolean(item && typeof item === "object")) as NodeItem[]);
  if (hierarchyError) return hierarchyError;
  const nodes = parseNodes(rawNodes);
  if (!nodes) return { ok: false, message: "節點格式無效；每個節點需有 id、parent、text、note、x、y、tone，且只能有一個中心節點。" };
  return {
    ok: true,
    format: "json",
    title: typeof record?.title === "string" && record.title.trim() ? record.title.trim() : nodes.find((node) => node.parent === null)!.text,
    nodes: autoLayoutNodes(nodes.map((node) => ({ ...node }))),
  };
}

export function parseMarkdownImport(source: string): ImportResult {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const parsed: { level: number; text: string; note: string[]; line: number }[] = [];
  let current: (typeof parsed)[number] | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const heading = raw.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      current = { level: heading[1].length, text: heading[2].trim(), note: [], line: index + 1 };
      parsed.push(current);
      continue;
    }
    const text = raw.trim();
    if (!text || /^>\s*匯出時間[：:]/.test(text)) continue;
    if (!current) return { ok: false, message: "內容必須放在標題節點之後。", line: index + 1 };
    current.note.push(text.replace(/^[-*]\s+/, ""));
  }
  if (!parsed.length) return { ok: false, message: "找不到 Markdown 標題；請以 # 標題建立節點。" };
  if (parsed.length > 1 && parsed[0].level === 1 && parsed[0].text === "靈感樹心智圖") parsed.shift();
  const baseLevel = Math.min(...parsed.map((item) => item.level));
  const stack: { level: number; id: number }[] = [];
  const nodes: NodeItem[] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const item = parsed[index];
    const normalizedLevel = item.level - baseLevel;
    if (index > 0 && normalizedLevel > stack.at(-1)!.level + 1) {
      return { ok: false, message: "標題層級跳太多；請逐層增加 #。", line: item.line };
    }
    while (stack.length && stack.at(-1)!.level >= normalizedLevel) stack.pop();
    if (index > 0 && stack.length === 0) {
      return { ok: false, message: "只能有一個最上層中心標題。", line: item.line };
    }
    const id = index + 1;
    nodes.push({
      id,
      parent: index === 0 ? null : stack.at(-1)!.id,
      text: item.text,
      note: item.note.join("\n"),
      x: 0,
      y: 0,
      tone: index === 0 ? "ink" : (["coral", "sage", "sun"] as const)[(normalizedLevel - 1 + index) % 3],
    });
    stack.push({ level: normalizedLevel, id });
  }
  return { ok: true, format: "markdown", title: parsed[0].text, nodes: autoLayoutNodes(nodes) };
}

export function parseMapImport(source: string, format: ImportFormat = "auto"): ImportResult {
  if (!source.trim()) return { ok: false, message: "請貼上內容或選擇檔案。" };
  const resolved = format === "auto" ? (source.trimStart().startsWith("{") || source.trimStart().startsWith("[") ? "json" : "markdown") : format;
  return resolved === "json" ? parseJsonImport(source) : parseMarkdownImport(source);
}
