import assert from "node:assert/strict";
import test from "node:test";

import { parseNodes } from "../app/lib/mindmap.ts";
import {
  canApplyUpdate,
  nextVersion,
  normalizeTitle,
  parseCreatePayload,
  parseMapData,
  parseUpdatePayload,
  serializeMapData,
} from "../app/lib/sharedMap.ts";

function sampleNodes() {
  return [
    { id: 1, parent: null, text: "中心", note: "根", x: 0, y: 0, tone: "ink" },
    { id: 2, parent: 1, text: "分支", note: "", x: 10, y: 20, tone: "coral" },
  ];
}

test("parseNodes accepts a valid single-center graph and rejects bad shapes", () => {
  assert.deepEqual(parseNodes(sampleNodes()), sampleNodes());
  assert.equal(parseNodes([]), null); // empty
  assert.equal(parseNodes("nope"), null); // not an array
  assert.equal(
    parseNodes([
      { id: 1, parent: null, text: "A", note: "", x: 0, y: 0, tone: "ink" },
      { id: 2, parent: null, text: "B", note: "", x: 0, y: 0, tone: "ink" },
    ]),
    null, // two centers
  );
});

test("serializeMapData round-trips through parseMapData", () => {
  const nodes = sampleNodes();
  assert.deepEqual(parseMapData(serializeMapData(nodes)), nodes);
  assert.equal(parseMapData("{ not json"), null);
  assert.equal(parseMapData(JSON.stringify({ nope: true })), null);
});

test("normalizeTitle trims, caps, and defaults", () => {
  assert.equal(normalizeTitle("  我的地圖  "), "我的地圖");
  assert.equal(normalizeTitle(""), "未命名心智圖");
  assert.equal(normalizeTitle(123), "未命名心智圖");
  assert.ok(normalizeTitle("x".repeat(500)).length <= 120);
});

test("parseCreatePayload validates nodes and normalises title", () => {
  const ok = parseCreatePayload({ title: " 計畫 ", nodes: sampleNodes() });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.title, "計畫");
  assert.deepEqual(ok.value.nodes, sampleNodes());

  assert.equal(parseCreatePayload(null).ok, false);
  assert.equal(parseCreatePayload({ nodes: [] }).ok, false);
  assert.equal(parseCreatePayload({ title: "x" }).ok, false); // missing nodes
});

test("parseUpdatePayload requires a valid base version", () => {
  const ok = parseUpdatePayload({ title: "t", nodes: sampleNodes(), version: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.version, 3);

  assert.equal(parseUpdatePayload({ nodes: sampleNodes() }).ok, false); // no version
  assert.equal(parseUpdatePayload({ nodes: sampleNodes(), version: 0 }).ok, false);
  assert.equal(parseUpdatePayload({ nodes: sampleNodes(), version: 1.5 }).ok, false);
  assert.equal(parseUpdatePayload({ version: 1, nodes: "bad" }).ok, false);
});

test("optimistic lock only applies matching versions and bumps by one", () => {
  assert.equal(canApplyUpdate(4, 4), true);
  assert.equal(canApplyUpdate(3, 4), false); // client is stale -> 409
  assert.equal(canApplyUpdate(5, 4), false);
  assert.equal(nextVersion(4), 5);
});
