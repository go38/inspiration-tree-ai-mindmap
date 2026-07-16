import assert from "node:assert/strict";
import test from "node:test";

// Node strips the TypeScript types on import, so the pure helpers can be
// exercised directly without a build step.
import {
  HISTORY_LIMIT,
  buildMarkdownLines,
  collectSubtreeIds,
  depthOf,
  nextNodeId,
  moveSiblingNode,
  pushHistory,
  reorderSiblingNodes,
  safeFilename,
} from "../app/lib/mindmap.ts";

/** Small fixture: center → A → A1, plus sibling B. */
function sampleNodes() {
  return [
    { id: 1, parent: null, text: "中心", note: "根", x: 0, y: 0, tone: "ink" },
    { id: 2, parent: 1, text: "分支 A", note: "第一層", x: 0, y: 0, tone: "coral" },
    { id: 3, parent: 2, text: "子節點 A1", note: "第二層", x: 0, y: 0, tone: "sage" },
    { id: 4, parent: 1, text: "分支 B", note: "", x: 0, y: 0, tone: "sun" },
  ];
}

test("nextNodeId returns max id + 1, and 1 for an empty map", () => {
  assert.equal(nextNodeId(sampleNodes()), 5);
  assert.equal(nextNodeId([{ id: 7, parent: null, text: "", note: "", x: 0, y: 0, tone: "ink" }]), 8);
  assert.equal(nextNodeId([]), 1);
});

test("depthOf counts steps from the root (root is depth 0)", () => {
  const nodes = sampleNodes();
  assert.equal(depthOf(nodes, nodes[0]), 0);
  assert.equal(depthOf(nodes, nodes[1]), 1);
  assert.equal(depthOf(nodes, nodes[2]), 2);
});

test("collectSubtreeIds gathers a node and all descendants", () => {
  const nodes = sampleNodes();
  // Removing branch A also removes its child A1.
  assert.deepEqual([...collectSubtreeIds(nodes, 2)].sort((a, b) => a - b), [2, 3]);
  // Removing the whole map from the root gathers everything.
  assert.deepEqual([...collectSubtreeIds(nodes, 1)].sort((a, b) => a - b), [1, 2, 3, 4]);
  // A leaf gathers only itself.
  assert.deepEqual([...collectSubtreeIds(nodes, 4)], [4]);
});

test("sibling ordering moves only nodes with the same parent", () => {
  const nodes = sampleNodes();
  const beforeB = reorderSiblingNodes(nodes, 4, 2);
  assert.deepEqual(beforeB.filter((node) => node.parent === 1).map((node) => node.id), [4, 2]);
  assert.equal(beforeB.find((node) => node.id === 3).parent, 2);

  const down = moveSiblingNode(beforeB, 4, 1);
  assert.deepEqual(down.filter((node) => node.parent === 1).map((node) => node.id), [2, 4]);
  assert.equal(moveSiblingNode(down, 4, 1), down); // already last
  assert.equal(reorderSiblingNodes(nodes, 3, 4), nodes); // different parents
});

test("safeFilename strips illegal characters and caps length", () => {
  assert.equal(safeFilename("a/b:c*?\"<>|d"), "a-b-c------d");
  assert.equal(safeFilename("我的 理想 生活"), "我的-理想-生活");
  assert.equal(safeFilename(""), "心智圖"); // empty falls back to the default name
  assert.ok(safeFilename("x".repeat(100)).length <= 48);
});

test("pushHistory keeps at most HISTORY_LIMIT states, newest last", () => {
  let history = [];
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    history = pushHistory(history, { nodes: [], selectedId: i });
  }
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history.at(-1).selectedId, HISTORY_LIMIT + 4); // newest retained
  assert.equal(history[0].selectedId, 5); // oldest dropped
});

test("buildMarkdownLines preserves hierarchy, notes, and injected timestamp", () => {
  const md = buildMarkdownLines(sampleNodes(), "2026-07-15 10:00").join("\n");
  assert.match(md, /^# 靈感樹心智圖/);
  assert.match(md, /> 匯出時間：2026-07-15 10:00/);
  assert.match(md, /## 中心/); // root at depth 1 -> h2
  assert.match(md, /### 分支 A/); // child -> h3
  assert.match(md, /#### 子節點 A1/); // grandchild -> h4
  assert.match(md, /第一層/); // non-empty note included
  // Branch B has an empty note, so no stray blank note line is emitted for it.
  assert.doesNotMatch(md, /### 分支 B\n\n\n/);
});
