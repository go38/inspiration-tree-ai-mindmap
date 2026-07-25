export const VIEW_STATE_STORAGE_PREFIX = "inspiration-tree:view-state:v1:";

export type MapViewState = {
  version: 1;
  collapsedIds: number[];
};

export function parseMapViewState(raw: string | null, validIds?: Set<number>): MapViewState {
  if (!raw) return { version: 1, collapsedIds: [] };
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return { version: 1, collapsedIds: [] };
    const data = value as Record<string, unknown>;
    if (data.version !== 1 || !Array.isArray(data.collapsedIds)) {
      return { version: 1, collapsedIds: [] };
    }
    const ids = [...new Set(data.collapsedIds
      .filter((id): id is number => Number.isInteger(id) && (id as number) > 0)
      .filter((id) => !validIds || validIds.has(id))
      .slice(0, 500))]
      .sort((a, b) => a - b);
    return { version: 1, collapsedIds: ids };
  } catch {
    return { version: 1, collapsedIds: [] };
  }
}

export function serializeMapViewState(collapsedIds: Iterable<number>): string {
  const ids = [...new Set([...collapsedIds].filter((id) => Number.isInteger(id) && id > 0))]
    .sort((a, b) => a - b)
    .slice(0, 500);
  return JSON.stringify({ version: 1, collapsedIds: ids } satisfies MapViewState);
}

function viewStateStorageKey(scope: string): string {
  return `${VIEW_STATE_STORAGE_PREFIX}${scope}`;
}

export function loadMapViewState(scope: string, validIds?: Set<number>): MapViewState {
  if (typeof window === "undefined") return { version: 1, collapsedIds: [] };
  try {
    return parseMapViewState(window.localStorage.getItem(viewStateStorageKey(scope)), validIds);
  } catch {
    return { version: 1, collapsedIds: [] };
  }
}

export function saveMapViewState(scope: string, collapsedIds: Iterable<number>): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(viewStateStorageKey(scope), serializeMapViewState(collapsedIds));
    return true;
  } catch {
    return false;
  }
}
