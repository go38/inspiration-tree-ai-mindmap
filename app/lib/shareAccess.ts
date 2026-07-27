export const SHARE_PERMISSIONS = ["view", "comment", "edit"] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

export type ShareLinkSummary = {
  token: string;
  permission: SharePermission;
  active: boolean;
  url: string;
};

export function isSharePermission(value: unknown): value is SharePermission {
  return typeof value === "string" && SHARE_PERMISSIONS.includes(value as SharePermission);
}

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24}$/.test(value);
}

export function parseShareLinkUpdate(value: unknown):
  | { ok: true; value: { active: boolean; permission: SharePermission; regenerate: boolean } }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "分享設定格式錯誤" };
  const raw = value as Record<string, unknown>;
  if (typeof raw.active !== "boolean") return { ok: false, error: "分享狀態必須是布林值" };
  if (!isSharePermission(raw.permission)) return { ok: false, error: "分享權限無效" };
  if (raw.regenerate !== undefined && typeof raw.regenerate !== "boolean") {
    return { ok: false, error: "重新產生設定無效" };
  }
  return {
    ok: true,
    value: { active: raw.active, permission: raw.permission, regenerate: raw.regenerate === true },
  };
}

export function sharePermissionCanRead(permission: SharePermission): boolean {
  return permission === "view" || permission === "comment" || permission === "edit";
}

export function sharePermissionCanEdit(permission: SharePermission): boolean {
  return permission === "edit";
}

export function sharePermissionLabel(permission: SharePermission): string {
  if (permission === "edit") return "可編輯";
  if (permission === "comment") return "可留言";
  return "唯讀";
}
