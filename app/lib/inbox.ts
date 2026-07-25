export const INBOX_STORAGE_PREFIX = "inspiration-tree:inbox:v1:";
export const MAX_INBOX_SEEDS = 80;

export type InspirationSeed = {
  id: string;
  title: string;
  note: string;
  source: "user" | "ai";
  createdAt: string;
};

type SeedSuggestion = {
  title: string;
  note?: string;
};

type SeedFactoryOptions = {
  now?: string;
  idFactory?: () => string;
};

const BULLET_PREFIX = /^\s*(?:(?:[-*•▪◦]+)|(?:\d+[.)、]))\s*/;
const NOTE_DELIMITERS = ["｜", " | ", "：", ": ", " — ", " – ", " - "];

function cleanText(value: string, maximum: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function normalizedTitle(value: string): string {
  return value.trim().toLocaleLowerCase("zh-TW");
}

function seedId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `seed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function splitSeedLine(rawLine: string): { title: string; note: string } | null {
  const line = rawLine.replace(BULLET_PREFIX, "").trim().slice(0, 280);
  if (!line) return null;
  const delimiter = NOTE_DELIMITERS
    .map((value) => ({ value, index: line.indexOf(value) }))
    .filter((item) => item.index > 0)
    .sort((a, b) => a.index - b.index)[0];
  if (delimiter) {
    const title = cleanText(line.slice(0, delimiter.index), 80);
    const note = cleanText(line.slice(delimiter.index + delimiter.value.length), 220);
    return title ? { title, note } : null;
  }
  const title = cleanText(line, 80);
  const note = line.length > 80 ? cleanText(line, 220) : "";
  return title ? { title, note } : null;
}

function appendUniqueSeeds(
  candidates: Array<{ title: string; note: string; source: InspirationSeed["source"] }>,
  existing: InspirationSeed[],
  options: SeedFactoryOptions = {},
): InspirationSeed[] {
  const existingTitles = new Set(existing.map((seed) => normalizedTitle(seed.title)));
  const now = options.now ?? new Date().toISOString();
  const makeId = options.idFactory ?? seedId;
  const created: InspirationSeed[] = [];
  for (const candidate of candidates) {
    const title = cleanText(candidate.title, 80);
    const key = normalizedTitle(title);
    if (!title || existingTitles.has(key)) continue;
    existingTitles.add(key);
    created.push({
      id: makeId(),
      title,
      note: cleanText(candidate.note, 220),
      source: candidate.source,
      createdAt: now,
    });
    if (existing.length + created.length >= MAX_INBOX_SEEDS) break;
  }
  return created;
}

export function createSeedsFromLines(
  input: string,
  existing: InspirationSeed[] = [],
  options: SeedFactoryOptions = {},
): InspirationSeed[] {
  const candidates = input
    .split(/\r?\n/)
    .flatMap((line) => {
      const parsed = splitSeedLine(line);
      return parsed ? [{ ...parsed, source: "user" as const }] : [];
    });
  return appendUniqueSeeds(candidates, existing, options);
}

export function createSeedsFromSuggestions(
  suggestions: SeedSuggestion[],
  existing: InspirationSeed[] = [],
  options: SeedFactoryOptions = {},
): InspirationSeed[] {
  return appendUniqueSeeds(
    suggestions.slice(0, 6).map((suggestion) => ({
      title: suggestion.title,
      note: suggestion.note ?? "",
      source: "ai" as const,
    })),
    existing,
    options,
  );
}

export function parseInboxSeeds(raw: string | null): InspirationSeed[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return [];
    const data = value as Record<string, unknown>;
    if (data.version !== 1 || !Array.isArray(data.seeds)) return [];
    const ids = new Set<string>();
    const titles = new Set<string>();
    return data.seeds.slice(-MAX_INBOX_SEEDS).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const seed = item as Record<string, unknown>;
      const id = typeof seed.id === "string" ? seed.id.trim().slice(0, 100) : "";
      const title = typeof seed.title === "string" ? cleanText(seed.title, 80) : "";
      const note = typeof seed.note === "string" ? cleanText(seed.note, 220) : "";
      const source = seed.source === "ai" ? "ai" : seed.source === "user" ? "user" : null;
      const createdAt = typeof seed.createdAt === "string" && !Number.isNaN(Date.parse(seed.createdAt))
        ? seed.createdAt
        : "";
      const titleKey = normalizedTitle(title);
      if (!id || !title || !source || !createdAt || ids.has(id) || titles.has(titleKey)) return [];
      ids.add(id);
      titles.add(titleKey);
      return [{ id, title, note, source, createdAt }];
    });
  } catch {
    return [];
  }
}

export function serializeInboxSeeds(seeds: InspirationSeed[]): string {
  return JSON.stringify({ version: 1, seeds: seeds.slice(-MAX_INBOX_SEEDS) });
}

function inboxStorageKey(scope: string): string {
  return `${INBOX_STORAGE_PREFIX}${scope}`;
}

export function loadInboxSeeds(scope: string): InspirationSeed[] {
  if (typeof window === "undefined") return [];
  try {
    return parseInboxSeeds(window.localStorage.getItem(inboxStorageKey(scope)));
  } catch {
    return [];
  }
}

export function saveInboxSeeds(scope: string, seeds: InspirationSeed[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(inboxStorageKey(scope), serializeInboxSeeds(seeds));
    return true;
  } catch {
    return false;
  }
}
