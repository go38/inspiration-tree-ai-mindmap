// Pure helpers for the shared-map API. No Workers/DB imports so the request
// validation and conflict rules can be unit-tested directly.

import { parseNodes, type NodeItem } from "./mindmap.ts";

export const MAX_TITLE_LENGTH = 120;
/** Guard against oversized payloads writing to D1 (~1MB of JSON). */
export const MAX_DATA_BYTES = 1_000_000;

export type SharedMap = {
  id: string;
  title: string;
  nodes: NodeItem[];
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

export function normalizeTitle(value: unknown): string {
  if (typeof value !== "string") return "未命名心智圖";
  const trimmed = value.trim().slice(0, MAX_TITLE_LENGTH);
  return trimmed || "未命名心智圖";
}

/** Serialize a node graph for the D1 `data` column. */
export function serializeMapData(nodes: NodeItem[]): string {
  return JSON.stringify(nodes);
}

/** Parse the D1 `data` column back into a validated node graph, or null. */
export function parseMapData(data: string): NodeItem[] | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  return parseNodes(value);
}

export type CreatePayload = { title: string; nodes: NodeItem[] };
export type UpdatePayload = { title: string; nodes: NodeItem[]; version: number };

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function validateNodesField(raw: Record<string, unknown>): ParseResult<NodeItem[]> {
  const nodes = parseNodes(raw.nodes);
  if (!nodes) return { ok: false, error: "nodes 缺少或格式錯誤（需非空、單一中心節點）" };
  if (serializeMapData(nodes).length > MAX_DATA_BYTES) {
    return { ok: false, error: "心智圖過大，無法儲存" };
  }
  return { ok: true, value: nodes };
}

/** Validate a POST /api/maps body. */
export function parseCreatePayload(body: unknown): ParseResult<CreatePayload> {
  if (!body || typeof body !== "object") return { ok: false, error: "請求內容無效" };
  const raw = body as Record<string, unknown>;
  const nodes = validateNodesField(raw);
  if (!nodes.ok) return nodes;
  return { ok: true, value: { title: normalizeTitle(raw.title), nodes: nodes.value } };
}

/** Validate a PUT /api/maps/:id body (requires the client's base version). */
export function parseUpdatePayload(body: unknown): ParseResult<UpdatePayload> {
  if (!body || typeof body !== "object") return { ok: false, error: "請求內容無效" };
  const raw = body as Record<string, unknown>;
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) {
    return { ok: false, error: "version 缺少或無效" };
  }
  const nodes = validateNodesField(raw);
  if (!nodes.ok) return nodes;
  return { ok: true, value: { title: normalizeTitle(raw.title), nodes: nodes.value, version: raw.version as number } };
}

/**
 * Optimistic-lock decision for a save. The write is allowed only when the
 * client edited the version the server still holds; otherwise the caller must
 * return 409 with the current server state so the client can reconcile.
 */
export function canApplyUpdate(clientVersion: number, serverVersion: number): boolean {
  return clientVersion === serverVersion;
}

export function nextVersion(current: number): number {
  return current + 1;
}
