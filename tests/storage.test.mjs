import assert from "node:assert/strict";
import test from "node:test";

import { parseCloudDraft, parseDraft, serializeCloudDraft, serializeDraft } from "../app/lib/storage.ts";

function sampleNodes() {
  return [
    { id: 1, parent: null, text: "中心", note: "根", x: 10, y: 20, tone: "ink" },
    { id: 2, parent: 1, text: "分支", note: "", x: 30, y: 40, tone: "coral" },
  ];
}

test("serializeDraft round-trips through parseDraft", () => {
  const nodes = sampleNodes();
  const draft = parseDraft(serializeDraft(nodes, 2));
  assert.ok(draft);
  assert.equal(draft.version, 1);
  assert.equal(draft.selectedId, 2);
  assert.deepEqual(draft.nodes, nodes);
});

test("parseDraft rejects malformed input", () => {
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft(""), null);
  assert.equal(parseDraft("{ not json"), null);
  assert.equal(parseDraft(JSON.stringify({ version: 2, nodes: sampleNodes(), selectedId: 1 })), null);
  assert.equal(parseDraft(JSON.stringify({ version: 1, nodes: [], selectedId: 1 })), null);
});

test("parseDraft enforces exactly one center node", () => {
  const twoRoots = [
    { id: 1, parent: null, text: "A", note: "", x: 0, y: 0, tone: "ink" },
    { id: 2, parent: null, text: "B", note: "", x: 0, y: 0, tone: "ink" },
  ];
  assert.equal(parseDraft(JSON.stringify({ version: 1, nodes: twoRoots, selectedId: 1 })), null);

  const noRoot = [{ id: 2, parent: 9, text: "orphan", note: "", x: 0, y: 0, tone: "ink" }];
  assert.equal(parseDraft(JSON.stringify({ version: 1, nodes: noRoot, selectedId: 2 })), null);
});

test("parseDraft rejects nodes with wrong field types", () => {
  const badTone = [{ id: 1, parent: null, text: "A", note: "", x: 0, y: 0, tone: "neon" }];
  assert.equal(parseDraft(JSON.stringify({ version: 1, nodes: badTone, selectedId: 1 })), null);

  const badCoord = [{ id: 1, parent: null, text: "A", note: "", x: "0", y: 0, tone: "ink" }];
  assert.equal(parseDraft(JSON.stringify({ version: 1, nodes: badCoord, selectedId: 1 })), null);
});

test("parseDraft repairs a selectedId that points at a missing node", () => {
  const draft = parseDraft(JSON.stringify({ version: 1, nodes: sampleNodes(), selectedId: 999 }));
  assert.ok(draft);
  assert.equal(draft.selectedId, 1); // falls back to the center node
});

test("cloud drafts round-trip with map, version, title, and timestamp metadata", () => {
  const nodes = sampleNodes();
  const raw = serializeCloudDraft("map-123", " 離線企劃 ", nodes, 2, 7, "2026-07-24T08:00:00.000Z");
  const draft = parseCloudDraft(raw, "map-123");
  assert.ok(draft);
  assert.equal(draft.mapId, "map-123");
  assert.equal(draft.title, "離線企劃");
  assert.equal(draft.baseVersion, 7);
  assert.equal(draft.updatedAt, "2026-07-24T08:00:00.000Z");
  assert.equal(draft.selectedId, 2);
  assert.deepEqual(draft.nodes, nodes);
});

test("parseCloudDraft rejects invalid or mismatched cloud drafts", () => {
  const valid = serializeCloudDraft("map-123", "標題", sampleNodes(), 1, 2, "2026-07-24T08:00:00.000Z");
  assert.equal(parseCloudDraft(valid, "another-map"), null);
  assert.equal(parseCloudDraft(JSON.stringify({ version: 1, mapId: "map-123" }), "map-123"), null);
  assert.equal(parseCloudDraft(valid.replace('"baseVersion":2', '"baseVersion":0'), "map-123"), null);
});
