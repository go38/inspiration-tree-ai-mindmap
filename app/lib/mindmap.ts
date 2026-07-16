// Pure, dependency-free mind map helpers.
// Kept free of React/DOM imports so they can be unit-tested directly under
// `node --test` (Node strips the TypeScript types on import).

export type NodeItem = {
  id: number;
  parent: number | null;
  text: string;
  note: string;
  x: number;
  y: number;
  tone: "ink" | "coral" | "sage" | "sun";
};

export type HistoryState = {
  nodes: NodeItem[];
  selectedId: number;
};

/** Newest history depth kept for undo/redo (HIS-04: at least 15 states). */
export const HISTORY_LIMIT = 15;

const TONES = new Set(["ink", "coral", "sage", "sun"]);

/** Structural guard for a single persisted node (used by storage + shared maps). */
export function isValidNode(value: unknown): value is NodeItem {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.id === "number" &&
    (node.parent === null || typeof node.parent === "number") &&
    typeof node.text === "string" &&
    typeof node.note === "string" &&
    typeof node.x === "number" &&
    typeof node.y === "number" &&
    typeof node.tone === "string" &&
    TONES.has(node.tone)
  );
}

/**
 * Validate an untrusted value as a mind map node array. Returns the typed
 * array, or null if it is not a non-empty array with exactly one center node
 * (parent === null) and every node structurally valid.
 */
export function parseNodes(value: unknown): NodeItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every(isValidNode)) return null;
  const nodes = value as NodeItem[];
  const roots = nodes.filter((node) => node.parent === null);
  if (roots.length !== 1) return null;
  return nodes;
}

/** Push a state onto a history stack, capping it at HISTORY_LIMIT entries. */
export function pushHistory(history: HistoryState[], state: HistoryState): HistoryState[] {
  return [...history.slice(-(HISTORY_LIMIT - 1)), state];
}

/** Next unused node id (max existing id + 1; 1 when there are no nodes). */
export function nextNodeId(nodes: NodeItem[]): number {
  if (nodes.length === 0) return 1;
  return Math.max(...nodes.map((node) => node.id)) + 1;
}

/** Depth of a node from the root: root parent === null is depth 0. */
export function depthOf(nodes: NodeItem[], node: NodeItem): number {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  let depth = 0;
  let current: NodeItem | undefined = node;
  while (current && current.parent !== null) {
    depth += 1;
    current = byId.get(current.parent);
  }
  return depth;
}

/** Ids of a node and all of its descendants (the whole subtree). */
export function collectSubtreeIds(nodes: NodeItem[], rootId: number): Set<number> {
  const ids = new Set<number>([rootId]);
  let foundChild = true;
  while (foundChild) {
    foundChild = false;
    nodes.forEach((node) => {
      if (node.parent !== null && ids.has(node.parent) && !ids.has(node.id)) {
        ids.add(node.id);
        foundChild = true;
      }
    });
  }
  return ids;
}

/** Move a node before another sibling while preserving every subtree. */
export function reorderSiblingNodes(nodes: NodeItem[], sourceId: number, targetId: number): NodeItem[] {
  if (sourceId === targetId) return nodes;
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || !target || source.parent === null || source.parent !== target.parent) return nodes;
  const siblingSlots = nodes.flatMap((node, index) => node.parent === source.parent ? [index] : []);
  const siblings = siblingSlots.map((index) => nodes[index]);
  const sourceIndex = siblings.findIndex((node) => node.id === sourceId);
  const targetIndex = siblings.findIndex((node) => node.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return nodes;
  const reordered = [...siblings];
  const [moved] = reordered.splice(sourceIndex, 1);
  const insertionIndex = reordered.findIndex((node) => node.id === targetId);
  reordered.splice(insertionIndex, 0, moved);
  const next = [...nodes];
  siblingSlots.forEach((slot, index) => { next[slot] = reordered[index]; });
  return next;
}

/** Move a node one position among its siblings. */
export function moveSiblingNode(nodes: NodeItem[], nodeId: number, delta: -1 | 1): NodeItem[] {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node || node.parent === null) return nodes;
  const siblings = nodes.filter((item) => item.parent === node.parent);
  const index = siblings.findIndex((item) => item.id === nodeId);
  const targetIndex = index + delta;
  if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return nodes;
  if (delta < 0) return reorderSiblingNodes(nodes, nodeId, siblings[targetIndex].id);
  return reorderSiblingNodes(nodes, siblings[targetIndex].id, nodeId);
}

/** Filesystem-safe file name derived from a node title. */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 48) || "心智圖";
}

/** Markdown lines for the current map. Timestamp is injected for testability. */
export function buildMarkdownLines(nodes: NodeItem[], timestamp: string): string[] {
  const roots = nodes.filter((node) => node.parent === null);
  const lines = ["# 靈感樹心智圖", "", `> 匯出時間：${timestamp}`, ""];
  function appendNode(node: NodeItem, depth: number) {
    lines.push(`${"#".repeat(Math.min(depth + 1, 6))} ${node.text.replace(/\n/g, " ")}`, "");
    if (node.note.trim()) lines.push(node.note.trim(), "");
    nodes.filter((item) => item.parent === node.id).forEach((child) => appendNode(child, depth + 1));
  }
  roots.forEach((root) => appendNode(root, 1));
  return lines;
}

export function createCurvedRibbon(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  startWidth: number,
  endWidth: number,
  seed: number,
) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const nx = -dy / length, ny = dx / length;
  const bend = Math.min(46, length * .13) * (seed % 2 === 0 ? 1 : -1);
  const c1x = x1 + dx * .34 + nx * bend, c1y = y1 + dy * .34 + ny * bend;
  const c2x = x1 + dx * .68 + nx * bend, c2y = y1 + dy * .68 + ny * bend;
  const startHalf = startWidth / 2, endHalf = endWidth / 2;
  const top = {
    start: [x1 + nx * startHalf, y1 + ny * startHalf],
    c1: [c1x + nx * startHalf * .72, c1y + ny * startHalf * .72],
    c2: [c2x + nx * endHalf * 1.35, c2y + ny * endHalf * 1.35],
    end: [x2 + nx * endHalf, y2 + ny * endHalf],
  };
  const bottom = {
    start: [x1 - nx * startHalf, y1 - ny * startHalf],
    c1: [c1x - nx * startHalf * .72, c1y - ny * startHalf * .72],
    c2: [c2x - nx * endHalf * 1.35, c2y - ny * endHalf * 1.35],
    end: [x2 - nx * endHalf, y2 - ny * endHalf],
  };
  const p = (point: number[]) => `${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
  return {
    top, bottom,
    path: `M ${p(top.start)} C ${p(top.c1)}, ${p(top.c2)}, ${p(top.end)} L ${p(bottom.end)} C ${p(bottom.c2)}, ${p(bottom.c1)}, ${p(bottom.start)} Z`,
  };
}
