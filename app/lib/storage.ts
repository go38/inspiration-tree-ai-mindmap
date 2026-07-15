// Local draft persistence for the mind map.
// parseDraft / serializeDraft are pure and unit-tested; the load/save/clear
// wrappers guard `window` so they are safe to import in a server render.

import { parseNodes, type NodeItem } from "./mindmap.ts";

export const STORAGE_KEY = "inspiration-tree:draft:v1";

export type MapDraft = {
  version: 1;
  nodes: NodeItem[];
  selectedId: number;
};

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
  if (draft.version !== 1) return null;

  const nodes = parseNodes(draft.nodes);
  if (!nodes) return null;

  const roots = nodes.filter((node) => node.parent === null);
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

export function saveDraft(nodes: NodeItem[], selectedId: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeDraft(nodes, selectedId));
    return true;
  } catch {
    // Quota or privacy-mode failures should never break editing.
    return false;
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
