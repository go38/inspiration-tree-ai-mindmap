export type ViewPreference = "canvas" | "tree" | "outline";
export type UserPreferences = {
  version: 1;
  defaultView: ViewPreference;
  aiPanelOpen: boolean;
  zoom: number;
  reducedMotion: boolean;
};

export const PREFERENCES_STORAGE_KEY = "inspiration-tree:preferences:v1";
export const DEFAULT_PREFERENCES: UserPreferences = {
  version: 1,
  defaultView: "canvas",
  aiPanelOpen: false,
  zoom: 100,
  reducedMotion: false,
};

export function parsePreferences(raw: string | null): UserPreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const value = JSON.parse(raw) as Partial<UserPreferences>;
    if (value.version !== 1) return { ...DEFAULT_PREFERENCES };
    const defaultView = value.defaultView === "tree" || value.defaultView === "outline" ? value.defaultView : "canvas";
    return {
      version: 1,
      defaultView,
      aiPanelOpen: value.aiPanelOpen === true,
      zoom: typeof value.zoom === "number" && Number.isFinite(value.zoom) ? Math.max(10, Math.min(200, Math.round(value.zoom))) : 100,
      reducedMotion: value.reducedMotion === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function loadPreferences(storage: Pick<Storage, "getItem"> = window.localStorage): UserPreferences {
  return parsePreferences(storage.getItem(PREFERENCES_STORAGE_KEY));
}

export function savePreferences(preferences: UserPreferences, storage: Pick<Storage, "setItem"> = window.localStorage): boolean {
  try {
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function resetPreferences(storage: Pick<Storage, "removeItem"> = window.localStorage): UserPreferences {
  try {
    storage.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // Reset still returns safe defaults when storage is unavailable.
  }
  return { ...DEFAULT_PREFERENCES };
}
