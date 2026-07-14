// Local draft persistence for the mind map.
// parseDraft / serializeDraft are pure and unit-tested; the load/save/clear
// wrappers guard `window` so they are safe to import in a server render.

import type { NodeItem } from "./mindmap";

export const STORAGE_KEY = "inspiration-tree:draft:v1";

export type MapDraft = {
  version: 1;
  nodes: NodeItem[];
  selectedId: number;
};

const TONES = new Set(["ink", "coral", "sage", "sun"]);

function isValidNode(value: unknown): value is NodeItem {
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
 * Validate and normalise a stored draft. Returns null for anything malformed
 * so a corrupt value can never crash hydration — the caller falls back to the
 * default sample map.
 */
export function parseDraft(raw: string | null): MapDraft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const draft = data as Record<string, unknown>;
  if (draft.version !== 1 || !Array.isArray(draft.nodes) || draft.nodes.length === 0) return null;
  if (!draft.nodes.every(isValidNode)) return null;

  const nodes = draft.nodes as NodeItem[];
  const roots = nodes.filter((node) => node.parent === null);
  if (roots.length !== 1) return null; // must keep the single-center invariant

  const selectedId =
    typeof draft.selectedId === "number" && nodes.some((node) => node.id === draft.selectedId)
      ? draft.selectedId
      : roots[0].id;

  return { version: 1, nodes, selectedId };
}

export function serializeDraft(nodes: NodeItem[], selectedId: number): string {
  const draft: MapDraft = { version: 1, nodes, selectedId };
  return JSON.stringify(draft);
}

export function loadDraft(): MapDraft | null {
  if (typeof window === "undefined") return null;
  try {
    return parseDraft(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveDraft(nodes: NodeItem[], selectedId: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeDraft(nodes, selectedId));
  } catch {
    // Quota or privacy-mode failures should never break editing.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
