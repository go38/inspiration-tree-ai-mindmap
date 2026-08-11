import assert from "node:assert/strict";
import test from "node:test";
import {
  describeShareExpiry,
  isShareLinkUsable,
  isSharePermission,
  isShareToken,
  keepShareExpiry,
  parseShareExpiry,
  parseShareLinkUpdate,
  shareExpiryFromPreset,
  shareLinkState,
  shareLinkStateLabel,
  sharePermissionCanEdit,
  sharePermissionCanRead,
  sharePermissionLabel,
} from "../app/lib/shareAccess.ts";

/** Fixed clock so expiry assertions never depend on the wall time. */
const NOW = Date.UTC(2026, 7, 12, 10, 0, 0);

test("share permissions expose view, comment, and edit roles", () => {
  assert.equal(isSharePermission("view"), true);
  assert.equal(isSharePermission("comment"), true);
  assert.equal(isSharePermission("edit"), true);
  assert.equal(isSharePermission("owner"), false);
  assert.equal(sharePermissionCanRead("view"), true);
  assert.equal(sharePermissionCanRead("comment"), true);
  assert.equal(sharePermissionCanRead("edit"), true);
  assert.equal(sharePermissionCanEdit("view"), false);
  assert.equal(sharePermissionCanEdit("comment"), false);
  assert.equal(sharePermissionCanEdit("edit"), true);
  assert.equal(sharePermissionLabel("view"), "唯讀");
  assert.equal(sharePermissionLabel("comment"), "可留言");
  assert.equal(sharePermissionLabel("edit"), "可編輯");
  assert.equal(isShareToken("Abcd_efgh-ijklmnopqrstuv"), true);
  assert.equal(isShareToken("too-short"), false);
  assert.equal(isShareToken("../not-a-token-value!!!"), false);
});

test("share updates require an explicit state and valid role", () => {
  assert.deepEqual(parseShareLinkUpdate({ active: true, permission: "view" }, NOW), {
    ok: true,
    value: { active: true, permission: "view", regenerate: false, expiresAt: null },
  });
  assert.deepEqual(parseShareLinkUpdate({ active: false, permission: "edit", regenerate: true }, NOW), {
    ok: true,
    value: { active: false, permission: "edit", regenerate: true, expiresAt: null },
  });
  assert.equal(parseShareLinkUpdate(null, NOW).ok, false);
  assert.equal(parseShareLinkUpdate({ active: "yes", permission: "view" }, NOW).ok, false);
  assert.equal(parseShareLinkUpdate({ active: true, permission: "admin" }, NOW).ok, false);
  assert.equal(parseShareLinkUpdate({ active: true, permission: "view", regenerate: "yes" }, NOW).ok, false);
});

test("an expiry must be a real time inside the allowed range", () => {
  const inOneDay = new Date(NOW + 86_400_000).toISOString();
  assert.deepEqual(parseShareExpiry(inOneDay, NOW), { ok: true, value: inOneDay });
  assert.deepEqual(parseShareExpiry(null, NOW), { ok: true, value: null });
  assert.deepEqual(parseShareExpiry("", NOW), { ok: true, value: null });
  // Normalized, so every row stores the same format regardless of client input.
  assert.deepEqual(parseShareExpiry("2026-08-20T10:00:00+08:00", NOW), { ok: true, value: "2026-08-20T02:00:00.000Z" });
  assert.equal(parseShareExpiry("not-a-date", NOW).ok, false);
  assert.equal(parseShareExpiry(new Date(NOW - 1000).toISOString(), NOW).ok, false);
  assert.equal(parseShareExpiry(new Date(NOW + 60_000).toISOString(), NOW).ok, false);
  assert.equal(parseShareExpiry(new Date(NOW + 400 * 86_400_000).toISOString(), NOW).ok, false);
  assert.equal(parseShareLinkUpdate({ active: true, permission: "view", expiresAt: "not-a-date" }, NOW).ok, false);
  assert.deepEqual(parseShareLinkUpdate({ active: true, permission: "view", expiresAt: inOneDay }, NOW).value.expiresAt, inOneDay);
});

test("a link is usable only while enabled, unexpired and never revoked", () => {
  const live = { active: true, expiresAt: null, revokedAt: null };
  assert.equal(shareLinkState(live, NOW), "active");
  assert.equal(isShareLinkUsable(live, NOW), true);
  assert.equal(shareLinkState({ ...live, active: false }, NOW), "disabled");
  assert.equal(shareLinkState({ ...live, expiresAt: new Date(NOW + 1000).toISOString() }, NOW), "active");
  assert.equal(shareLinkState({ ...live, expiresAt: new Date(NOW - 1000).toISOString() }, NOW), "expired");
  assert.equal(isShareLinkUsable({ ...live, expiresAt: new Date(NOW - 1000).toISOString() }, NOW), false);
  // Fail closed: an unreadable deadline must not grant access.
  assert.equal(shareLinkState({ ...live, expiresAt: "garbage" }, NOW), "expired");
  // Revocation outranks every other state and survives being re-enabled.
  assert.equal(shareLinkState({ ...live, revokedAt: new Date(NOW).toISOString() }, NOW), "revoked");
  assert.equal(isShareLinkUsable({ active: true, expiresAt: null, revokedAt: new Date(NOW).toISOString() }, NOW), false);
  assert.equal(shareLinkStateLabel("expired"), "已到期");
  assert.equal(shareLinkStateLabel("revoked"), "已撤銷");
});

test("expiry presets and their labels round-trip through the API contract", () => {
  assert.equal(shareExpiryFromPreset("never", NOW), null);
  assert.equal(shareExpiryFromPreset("24h", NOW), new Date(NOW + 86_400_000).toISOString());
  assert.equal(parseShareExpiry(shareExpiryFromPreset("30d", NOW), NOW).ok, true);
  assert.equal(describeShareExpiry(null, NOW), "不會自動到期");
  assert.equal(describeShareExpiry(new Date(NOW + 86_400_000 * 2 + 3_600_000).toISOString(), NOW), "2 天 1 小時後到期");
  assert.equal(describeShareExpiry(new Date(NOW + 5_400_000).toISOString(), NOW), "1 小時 30 分後到期");
  assert.equal(describeShareExpiry(new Date(NOW - 1000).toISOString(), NOW), "已到期");
  // Re-saving a link must not replay a deadline the API would now reject.
  assert.equal(keepShareExpiry(new Date(NOW - 1000).toISOString(), NOW), null);
  assert.equal(keepShareExpiry(new Date(NOW + 86_400_000).toISOString(), NOW), new Date(NOW + 86_400_000).toISOString());
});
