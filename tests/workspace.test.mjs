import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessMap,
  createPersonalMapNodes,
  duplicateMapTitle,
  normalizeOwnerEmail,
  normalizeWorkspaceSearch,
  parseWorkspaceMapCreate,
  parseWorkspaceMapPatch,
  sortWorkspaceMapsByRecent,
} from "../app/lib/workspace.ts";

test("workspace ownership normalizes identity and isolates personal maps", () => {
  assert.equal(normalizeOwnerEmail(" Eric@Example.COM "), "eric@example.com");
  assert.equal(normalizeOwnerEmail("not-an-email"), null);
  assert.equal(normalizeOwnerEmail(null), null);
  assert.equal(canAccessMap(null, null), true, "legacy shared maps stay accessible");
  assert.equal(canAccessMap("eric@example.com", "eric@example.com"), true);
  assert.equal(canAccessMap("eric@example.com", "other@example.com"), false);
  assert.equal(canAccessMap("eric@example.com", null), false);
});

test("workspace create payload supports blank maps and owned-map duplication", () => {
  assert.deepEqual(parseWorkspaceMapCreate({ title: "  研究計畫 " }), {
    ok: true,
    value: { title: "研究計畫", sourceMapId: null },
  });
  assert.deepEqual(parseWorkspaceMapCreate({ sourceMapId: "abc123" }), {
    ok: true,
    value: { title: "未命名心智圖", sourceMapId: "abc123" },
  });
  assert.equal(parseWorkspaceMapCreate("bad").ok, false);
  assert.equal(parseWorkspaceMapCreate({ sourceMapId: "" }).ok, false);
});

test("workspace patch accepts rename/archive and rejects empty updates", () => {
  assert.deepEqual(parseWorkspaceMapPatch({ title: "  新名稱 " }), {
    ok: true,
    value: { title: "新名稱" },
  });
  assert.deepEqual(parseWorkspaceMapPatch({ archived: true }), {
    ok: true,
    value: { archived: true },
  });
  assert.equal(parseWorkspaceMapPatch({}).ok, false);
  assert.equal(parseWorkspaceMapPatch({ title: " " }).ok, false);
  assert.equal(parseWorkspaceMapPatch({ archived: "yes" }).ok, false);
});

test("new personal maps and duplicate titles are deterministic and bounded", () => {
  const nodes = createPersonalMapNodes("內容策略");
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].parent, null);
  assert.equal(nodes[0].text, "內容策略");
  assert.equal(duplicateMapTitle("內容策略"), "內容策略（副本）");
  assert.equal(duplicateMapTitle("x".repeat(200)).length, 120);
});

test("workspace search trims and caps user input", () => {
  assert.equal(normalizeWorkspaceSearch("  季度計畫  "), "季度計畫");
  assert.equal(normalizeWorkspaceSearch("x".repeat(200)).length, 80);
  assert.equal(normalizeWorkspaceSearch(null), "");
});

test("workspace maps are sorted by most recent update first", () => {
  const maps = [
    { id: "old", updatedAt: "2026-07-20T00:00:00.000Z" },
    { id: "new", updatedAt: "2026-07-24T00:00:00.000Z" },
    { id: "middle", updatedAt: "2026-07-22T00:00:00.000Z" },
  ];
  assert.deepEqual(sortWorkspaceMapsByRecent(maps).map((map) => map.id), ["new", "middle", "old"]);
  assert.equal(maps[0].id, "old", "sorting does not mutate the caller's array");
});
