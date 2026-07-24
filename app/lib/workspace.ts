// Pure helpers for the identity-scoped personal map workspace.

import { MAX_TITLE_LENGTH, normalizeTitle, type SharedMap } from "./sharedMap.ts";
import type { NodeItem } from "./mindmap.ts";

export const MAX_WORKSPACE_SEARCH_LENGTH = 80;

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type WorkspaceMapSummary = Pick<
  SharedMap,
  "id" | "title" | "version" | "updatedAt"
> & {
  archivedAt: string | null;
  nodeCount: number;
};

export type WorkspaceMapPatch = {
  title?: string;
  archived?: boolean;
};

export function sortWorkspaceMapsByRecent<T extends Pick<WorkspaceMapSummary, "updatedAt">>(maps: T[]): T[] {
  return [...maps].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function normalizeOwnerEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLocaleLowerCase("en-US");
  return email && email.includes("@") ? email : null;
}

export function canAccessMap(ownerEmail: string | null, viewerEmail: string | null): boolean {
  return ownerEmail === null || ownerEmail === viewerEmail;
}

export function normalizeWorkspaceSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_WORKSPACE_SEARCH_LENGTH);
}

export function parseWorkspaceMapPatch(body: unknown): ParseResult<WorkspaceMapPatch> {
  if (!body || typeof body !== "object") return { ok: false, error: "請求內容無效" };
  const raw = body as Record<string, unknown>;
  const value: WorkspaceMapPatch = {};
  if ("title" in raw) {
    if (typeof raw.title !== "string" || !raw.title.trim()) {
      return { ok: false, error: "地圖名稱不能空白" };
    }
    value.title = normalizeTitle(raw.title);
  }
  if ("archived" in raw) {
    if (typeof raw.archived !== "boolean") {
      return { ok: false, error: "archived 必須是布林值" };
    }
    value.archived = raw.archived;
  }
  if (value.title === undefined && value.archived === undefined) {
    return { ok: false, error: "沒有可更新的欄位" };
  }
  return { ok: true, value };
}

export function parseWorkspaceMapCreate(
  body: unknown,
): ParseResult<{ title: string; sourceMapId: string | null }> {
  if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
    return { ok: false, error: "請求內容無效" };
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.sourceMapId !== undefined && (typeof raw.sourceMapId !== "string" || !raw.sourceMapId.trim())) {
    return { ok: false, error: "來源地圖無效" };
  }
  return {
    ok: true,
    value: {
      title: normalizeTitle(raw.title),
      sourceMapId: typeof raw.sourceMapId === "string" ? raw.sourceMapId.trim() : null,
    },
  };
}

export function duplicateMapTitle(title: string): string {
  const suffix = "（副本）";
  const base = title.replace(/（副本(?: \d+)?）$/, "").trim().slice(0, MAX_TITLE_LENGTH - suffix.length);
  return `${base || "未命名心智圖"}${suffix}`;
}

export function createPersonalMapNodes(title: string): NodeItem[] {
  return [
    {
      id: 1,
      parent: null,
      text: normalizeTitle(title),
      note: "從這裡開始整理想法",
      x: 438,
      y: 284,
      tone: "ink",
    },
  ];
}
