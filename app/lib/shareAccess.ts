export const SHARE_PERMISSIONS = ["view", "comment", "edit"] as const;
export type SharePermission = (typeof SHARE_PERMISSIONS)[number];

/** Why a link is (not) usable. Only "active" grants access. */
export const SHARE_LINK_STATES = ["active", "disabled", "expired", "revoked"] as const;
export type ShareLinkState = (typeof SHARE_LINK_STATES)[number];

/** An expiry further out than this is indistinguishable from "never". */
export const MAX_SHARE_EXPIRY_DAYS = 365;
/** Below this the link would die before the recipient could open it. */
export const MIN_SHARE_EXPIRY_MINUTES = 5;

export type ShareLinkLifecycle = {
  active: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type ShareLinkSummary = ShareLinkLifecycle & {
  token: string;
  permission: SharePermission;
  url: string;
  state: ShareLinkState;
};

export function isSharePermission(value: unknown): value is SharePermission {
  return typeof value === "string" && SHARE_PERMISSIONS.includes(value as SharePermission);
}

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24}$/.test(value);
}

/**
 * Single source of truth for link validity, used by the share page, the map
 * API and the owner UI. Revocation outranks everything else because it is
 * permanent; an unparseable `expiresAt` counts as expired (fail closed).
 */
export function shareLinkState(link: ShareLinkLifecycle, nowMs: number = Date.now()): ShareLinkState {
  if (link.revokedAt) return "revoked";
  if (!link.active) return "disabled";
  if (link.expiresAt !== null) {
    const deadline = Date.parse(link.expiresAt);
    if (!Number.isFinite(deadline) || deadline <= nowMs) return "expired";
  }
  return "active";
}

export function isShareLinkUsable(link: ShareLinkLifecycle, nowMs: number = Date.now()): boolean {
  return shareLinkState(link, nowMs) === "active";
}

export function shareLinkStateLabel(state: ShareLinkState): string {
  if (state === "active") return "使用中";
  if (state === "disabled") return "已關閉";
  if (state === "expired") return "已到期";
  return "已撤銷";
}

/**
 * Validates an owner-supplied deadline. `null`/`undefined` mean "never".
 * Returns the normalized ISO string so every row stores the same format.
 */
export function parseShareExpiry(value: unknown, nowMs: number):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "到期時間格式錯誤" };
  const deadline = Date.parse(value);
  if (!Number.isFinite(deadline)) return { ok: false, error: "到期時間格式錯誤" };
  if (deadline <= nowMs + MIN_SHARE_EXPIRY_MINUTES * 60_000) {
    return { ok: false, error: `到期時間至少要在 ${MIN_SHARE_EXPIRY_MINUTES} 分鐘之後` };
  }
  if (deadline > nowMs + MAX_SHARE_EXPIRY_DAYS * 86_400_000) {
    return { ok: false, error: `到期時間最多 ${MAX_SHARE_EXPIRY_DAYS} 天` };
  }
  return { ok: true, value: new Date(deadline).toISOString() };
}

export function parseShareLinkUpdate(value: unknown, nowMs: number = Date.now()):
  | { ok: true; value: { active: boolean; permission: SharePermission; regenerate: boolean; expiresAt: string | null } }
  | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "分享設定格式錯誤" };
  const raw = value as Record<string, unknown>;
  if (typeof raw.active !== "boolean") return { ok: false, error: "分享狀態必須是布林值" };
  if (!isSharePermission(raw.permission)) return { ok: false, error: "分享權限無效" };
  if (raw.regenerate !== undefined && typeof raw.regenerate !== "boolean") {
    return { ok: false, error: "重新產生設定無效" };
  }
  const expiresAt = parseShareExpiry(raw.expiresAt, nowMs);
  if (!expiresAt.ok) return expiresAt;
  return {
    ok: true,
    value: {
      active: raw.active,
      permission: raw.permission,
      regenerate: raw.regenerate === true,
      expiresAt: expiresAt.value,
    },
  };
}

export const SHARE_EXPIRY_PRESETS = [
  { id: "never", label: "不設到期", hours: null },
  { id: "24h", label: "24 小時後", hours: 24 },
  { id: "7d", label: "7 天後", hours: 24 * 7 },
  { id: "30d", label: "30 天後", hours: 24 * 30 },
] as const;

export type ShareExpiryPresetId = (typeof SHARE_EXPIRY_PRESETS)[number]["id"];

/** Turns a preset pick into the ISO deadline the API expects. */
export function shareExpiryFromPreset(id: ShareExpiryPresetId, nowMs: number = Date.now()): string | null {
  const preset = SHARE_EXPIRY_PRESETS.find((item) => item.id === id);
  if (!preset || preset.hours === null) return null;
  return new Date(nowMs + preset.hours * 3_600_000).toISOString();
}

/**
 * The deadline to resend when the owner edits a link without touching its
 * expiry. A deadline that has already passed (or is about to) is dropped rather
 * than replayed, because the API would reject it and block the save.
 */
export function keepShareExpiry(expiresAt: string | null, nowMs: number = Date.now()): string | null {
  const parsed = parseShareExpiry(expiresAt, nowMs);
  return parsed.ok ? parsed.value : null;
}

/** Human wording for the owner UI; also covers already-expired deadlines. */
export function describeShareExpiry(expiresAt: string | null, nowMs: number = Date.now()): string {
  if (!expiresAt) return "不會自動到期";
  const deadline = Date.parse(expiresAt);
  if (!Number.isFinite(deadline)) return "到期時間無效";
  const remaining = deadline - nowMs;
  if (remaining <= 0) return "已到期";
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  if (days > 0) return `${days} 天 ${hours} 小時後到期`;
  if (hours > 0) return `${hours} 小時 ${minutes} 分後到期`;
  return `${Math.max(minutes, 1)} 分鐘後到期`;
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
