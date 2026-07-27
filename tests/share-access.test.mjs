import assert from "node:assert/strict";
import test from "node:test";
import {
  isSharePermission,
  isShareToken,
  parseShareLinkUpdate,
  sharePermissionCanEdit,
  sharePermissionCanRead,
  sharePermissionLabel,
} from "../app/lib/shareAccess.ts";

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
  assert.deepEqual(parseShareLinkUpdate({ active: true, permission: "view" }), {
    ok: true,
    value: { active: true, permission: "view", regenerate: false },
  });
  assert.deepEqual(parseShareLinkUpdate({ active: false, permission: "edit", regenerate: true }), {
    ok: true,
    value: { active: false, permission: "edit", regenerate: true },
  });
  assert.equal(parseShareLinkUpdate(null).ok, false);
  assert.equal(parseShareLinkUpdate({ active: "yes", permission: "view" }).ok, false);
  assert.equal(parseShareLinkUpdate({ active: true, permission: "admin" }).ok, false);
  assert.equal(parseShareLinkUpdate({ active: true, permission: "view", regenerate: "yes" }).ok, false);
});
