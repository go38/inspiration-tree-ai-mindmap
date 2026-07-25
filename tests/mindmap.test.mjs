import assert from "node:assert/strict";
import test from "node:test";

// Node strips the TypeScript types on import, so the pure helpers can be
// exercised directly without a build step.
import {
  HISTORY_LIMIT,
  applyTreeNodeOffsets,
  autoLayoutNodes,
  buildDepthMap,
  buildMarkdownLines,
  calculateAnchoredZoom,
  calculateFitTransform,
  collectSubtreeIds,
  countConnectionCrossings,
  createCanvasBranchRibbons,
  depthOf,
  createTreeBranchRibbons,
  historyShortcutForKey,
  indentOutlineNode,
  layoutTreeViewNodes,
  nextNodeId,
  moveSiblingNode,
  nodeBounds,
  nodeBoundsOverlap,
  nodeMetricsForDepth,
  outdentOutlineNode,
  pushHistory,
  reparentSubtree,
  reorderSiblingNodes,
  safeFilename,
  visibleNodesForCollapsed,
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

test("hierarchy metrics map root, first-level, and deeper nodes to large, medium, and small cards", () => {
  const depths = buildDepthMap(sampleNodes());
  assert.deepEqual([...depths.entries()], [[1, 0], [2, 1], [3, 2], [4, 1]]);
  assert.deepEqual(nodeMetricsForDepth(0), { level: "root", width: 204, height: 94 });
  assert.deepEqual(nodeMetricsForDepth(1), { level: "branch", width: 180, height: 82 });
  assert.deepEqual(nodeMetricsForDepth(2), { level: "detail", width: 152, height: 70 });
  assert.equal(nodeMetricsForDepth(8).level, "detail");
});

test("collapsed parents hide every descendant but remain visible themselves", () => {
  const nodes = sampleNodes();
  assert.deepEqual(visibleNodesForCollapsed(nodes, new Set([2])).map((node) => node.id), [1, 2, 4]);
  assert.deepEqual(visibleNodesForCollapsed(nodes, new Set([1])).map((node) => node.id), [1]);
  assert.equal(visibleNodesForCollapsed(nodes, new Set()), nodes);
});

test("fit transform centers the root and keeps an asymmetric map inside the safe viewport", () => {
  const nodes = [
    { id: 1, parent: null, text: "中心", note: "", x: 420, y: 300, tone: "ink" },
    { id: 2, parent: 1, text: "左側遠端", note: "", x: -820, y: 20, tone: "coral" },
    { id: 3, parent: 1, text: "右側", note: "", x: 720, y: 560, tone: "sage" },
  ];
  const depths = buildDepthMap(nodes);
  const viewport = { width: 868, height: 744, top: 100, right: 24, bottom: 70, left: 24 };
  const fit = calculateFitTransform(nodes, 1, viewport, { depthById: depths, maximumZoom: 200, minimumZoom: 10 });
  const scale = fit.zoom / 100;
  const stageCenter = { x: viewport.width / 2, y: viewport.height / 2 };
  const rootBox = nodeBounds(nodes[0], 0);
  const rootCenter = { x: rootBox.x + rootBox.width / 2, y: rootBox.y + rootBox.height / 2 };
  const screenPoint = (x, y) => ({
    x: stageCenter.x + fit.offset.x + scale * (x - 540),
    y: stageCenter.y + fit.offset.y + scale * (y - 325),
  });
  assert.deepEqual(screenPoint(rootCenter.x, rootCenter.y), fit.target);
  for (const node of nodes) {
    const box = nodeBounds(node, depths.get(node.id));
    const topLeft = screenPoint(box.x, box.y);
    const bottomRight = screenPoint(box.x + box.width, box.y + box.height);
    assert.ok(topLeft.x >= viewport.left - 1);
    assert.ok(bottomRight.x <= viewport.width - viewport.right + 1);
    assert.ok(topLeft.y >= viewport.top - 1);
    assert.ok(bottomRight.y <= viewport.height - viewport.bottom + 1);
  }
});

test("anchored zoom keeps the same map point under the mouse or pinch center", () => {
  const viewportCenter = { x: 500, y: 350 };
  const anchor = { x: 760, y: 210 };
  const totalOffset = { x: 45, y: -30 };
  const currentZoom = 80;
  const nextZoom = 135;
  const beforeMapVector = {
    x: (anchor.x - viewportCenter.x - totalOffset.x) / (currentZoom / 100),
    y: (anchor.y - viewportCenter.y - totalOffset.y) / (currentZoom / 100),
  };
  const result = calculateAnchoredZoom(currentZoom, nextZoom, anchor, viewportCenter, totalOffset);
  const anchoredAfter = {
    x: viewportCenter.x + result.totalOffset.x + beforeMapVector.x * (nextZoom / 100),
    y: viewportCenter.y + result.totalOffset.y + beforeMapVector.y * (nextZoom / 100),
  };

  assert.deepEqual(anchoredAfter, anchor);
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

test("reparenting moves a whole subtree and rejects invalid targets", () => {
  const nodes = sampleNodes();
  const moved = reparentSubtree(nodes, 2, 4);

  assert.notEqual(moved, nodes);
  assert.equal(moved.find((node) => node.id === 2).parent, 4);
  assert.equal(moved.find((node) => node.id === 3).parent, 2, "descendants remain attached");
  assert.deepEqual(moved.filter((node) => node.parent === 1).map((node) => node.id), [4]);
  assert.deepEqual(moved.filter((node) => node.parent === 4).map((node) => node.id), [2]);

  assert.equal(reparentSubtree(nodes, 1, 2), nodes, "the center cannot be moved");
  assert.equal(reparentSubtree(nodes, 2, 2), nodes, "a node cannot parent itself");
  assert.equal(reparentSubtree(nodes, 2, 3), nodes, "a node cannot move under its descendant");
  assert.equal(reparentSubtree(nodes, 2, 1), nodes, "the current parent is a no-op");
  assert.equal(reparentSubtree(nodes, 99, 1), nodes, "unknown nodes are rejected");
});

test("outline indentation and outdentation preserve subtree structure and order", () => {
  const nodes = sampleNodes();
  const indented = indentOutlineNode(nodes, 4);
  assert.equal(indented.find((node) => node.id === 4).parent, 2);
  assert.deepEqual(indented.filter((node) => node.parent === 2).map((node) => node.id), [3, 4]);

  const restored = outdentOutlineNode(indented, 4);
  assert.equal(restored.find((node) => node.id === 4).parent, 1);
  assert.deepEqual(restored.filter((node) => node.parent === 1).map((node) => node.id), [2, 4]);

  const outdentedChild = outdentOutlineNode(nodes, 3);
  assert.equal(outdentedChild.find((node) => node.id === 3).parent, 1);
  assert.deepEqual(outdentedChild.filter((node) => node.parent === 1).map((node) => node.id), [2, 3, 4]);

  assert.equal(indentOutlineNode(nodes, 2), nodes, "the first sibling cannot indent");
  assert.equal(outdentOutlineNode(nodes, 2), nodes, "a root child cannot outdent");
  assert.equal(indentOutlineNode(nodes, 1), nodes, "the center cannot indent");
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

test("history shortcuts support macOS and Windows conventions", () => {
  assert.equal(historyShortcutForKey({ key: "z", metaKey: true }), "undo");
  assert.equal(historyShortcutForKey({ key: "Z", metaKey: true, shiftKey: true }), "redo");
  assert.equal(historyShortcutForKey({ key: "z", ctrlKey: true }), "undo");
  assert.equal(historyShortcutForKey({ key: "y", ctrlKey: true }), "redo");
  assert.equal(historyShortcutForKey({ key: "z" }), null);
  assert.equal(historyShortcutForKey({ key: "z", ctrlKey: true, altKey: true }), null);
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

test("auto layout arranges 100 nodes without overlap, crossings, or two-sided crowding", () => {
  const nodes = [
    { id: 1, parent: null, text: "中心", note: "", x: 420, y: 300, tone: "ink" },
  ];
  for (let id = 2; id <= 100; id++) {
    // Ten broad first-level branches with a deterministic, mixed-depth tree.
    const parent = id <= 11 ? 1 : 2 + ((id - 12) % 10);
    nodes.push({ id, parent, text: `節點 ${id}`, note: "", x: 420, y: 300, tone: id % 3 === 0 ? "sage" : id % 3 === 1 ? "sun" : "coral" });
  }

  const laidOut = autoLayoutNodes(nodes);
  assert.notEqual(laidOut, nodes);
  assert.deepEqual(
    { x: laidOut[0].x, y: laidOut[0].y },
    { x: nodes[0].x, y: nodes[0].y },
    "center remains the layout anchor",
  );
  const laidOutDepths = buildDepthMap(laidOut);

  for (let i = 0; i < laidOut.length; i++) {
    for (let j = i + 1; j < laidOut.length; j++) {
      assert.equal(
        nodeBoundsOverlap(
          nodeBounds(laidOut[i], laidOutDepths.get(laidOut[i].id)),
          nodeBounds(laidOut[j], laidOutDepths.get(laidOut[j].id)),
        ),
        false,
        `nodes ${laidOut[i].id} and ${laidOut[j].id} must not overlap`,
      );
    }
  }

  const byId = new Map(laidOut.map((node) => [node.id, node]));
  const rootCenter = {
    x: laidOut[0].x + nodeBounds(laidOut[0]).width / 2,
    y: laidOut[0].y + nodeBounds(laidOut[0]).height / 2,
  };
  for (const node of laidOut.slice(1)) {
    const parent = byId.get(node.parent);
    const nodeCenter = node.x + nodeBounds(node).width / 2;
    const nodeCenterY = node.y + nodeBounds(node).height / 2;
    const parentCenter = parent.x + nodeBounds(parent).width / 2;
    const parentCenterY = parent.y + nodeBounds(parent).height / 2;
    assert.ok(
      Math.hypot(nodeCenter - rootCenter.x, nodeCenterY - rootCenter.y) >
        Math.hypot(parentCenter - rootCenter.x, parentCenterY - rootCenter.y),
      `node ${node.id} must sit farther from the center than its parent`,
    );
  }
  const rootChildren = laidOut.filter((node) => node.parent === laidOut[0].id);
  const rootChildCenters = rootChildren.map((node) => ({
    x: node.x + nodeBounds(node).width / 2,
    y: node.y + nodeBounds(node).height / 2,
  }));
  assert.ok(rootChildCenters.some((point) => point.y < rootCenter.y - 100), "branches spread above the center");
  assert.ok(rootChildCenters.some((point) => point.y > rootCenter.y + 100), "branches spread below the center");
  assert.ok(rootChildCenters.some((point) => point.x < rootCenter.x - 100), "branches spread left of the center");
  assert.ok(rootChildCenters.some((point) => point.x > rootCenter.x + 100), "branches spread right of the center");
  assert.equal(countConnectionCrossings(laidOut), 0, "tidy radial connections do not cross");
});

test("canvas connections attach to card edges and do not overlap at node centers", () => {
  const laidOut = autoLayoutNodes(sampleNodes());
  const ribbons = createCanvasBranchRibbons(laidOut);
  assert.equal(ribbons.length, laidOut.length - 1);
  const byId = new Map(laidOut.map((node) => [node.id, node]));
  for (const ribbon of ribbons) {
    const parent = byId.get(ribbon.parentId);
    const parentBox = nodeBounds(parent);
    const parentCenter = {
      x: parent.x + parentBox.width / 2,
      y: parent.y + parentBox.height / 2,
    };
    assert.notDeepEqual(ribbon.start, parentCenter, "each line starts at the card boundary");
    assert.match(ribbon.path, /^M /);
  }
  assert.equal(countConnectionCrossings(laidOut), 0);
});

test("branch auto layout anchors the selected root, avoids outsiders, and leaves them untouched", () => {
  const nodes = [
    { id: 1, parent: null, text: "中心", note: "", x: 420, y: 300, tone: "ink" },
    { id: 2, parent: 1, text: "左分支", note: "", x: 130, y: 220, tone: "coral" },
    { id: 3, parent: 2, text: "子節點一", note: "", x: -162, y: 220, tone: "sage" },
    { id: 4, parent: 2, text: "子節點二", note: "", x: -162, y: 220, tone: "sun" },
    { id: 5, parent: 1, text: "不相關分支", note: "", x: -162, y: 220, tone: "coral" },
  ];

  const laidOut = autoLayoutNodes(nodes, 2);
  assert.deepEqual(laidOut.find((node) => node.id === 2), nodes[1], "selected branch root is anchored");
  assert.equal(laidOut.find((node) => node.id === 5), nodes[4], "outside nodes preserve identity and position");

  for (let i = 0; i < laidOut.length; i++) {
    for (let j = i + 1; j < laidOut.length; j++) {
      assert.equal(nodeBoundsOverlap(nodeBounds(laidOut[i]), nodeBounds(laidOut[j])), false);
    }
  }
});

test("tree view layout grows upward without changing saved node data", () => {
  const nodes = sampleNodes();
  const laidOut = layoutTreeViewNodes(nodes);
  const byId = new Map(laidOut.map((node) => [node.id, node]));

  assert.notEqual(laidOut, nodes);
  assert.deepEqual(nodes.map(({ id, x, y }) => ({ id, x, y })), [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 0, y: 0 },
    { id: 3, x: 0, y: 0 },
    { id: 4, x: 0, y: 0 },
  ], "source coordinates stay untouched");

  for (const node of laidOut.slice(1)) {
    const parent = byId.get(node.parent);
    assert.ok(node.y + nodeBounds(node).height < parent.y, `node ${node.id} grows above its parent`);
    assert.equal(node.text, nodes.find((item) => item.id === node.id).text);
    assert.equal(node.note, nodes.find((item) => item.id === node.id).note);
  }

  for (let i = 0; i < laidOut.length; i++) {
    for (let j = i + 1; j < laidOut.length; j++) {
      assert.equal(nodeBoundsOverlap(nodeBounds(laidOut[i]), nodeBounds(laidOut[j])), false);
    }
  }
});

test("tree view offsets move rendered copies without changing canvas coordinates", () => {
  const nodes = sampleNodes();
  const laidOut = layoutTreeViewNodes(nodes);
  const adjusted = applyTreeNodeOffsets(laidOut, {
    2: { x: 48, y: -22 },
    4: { x: -18, y: 30 },
  });

  assert.deepEqual(
    adjusted.find((node) => node.id === 2),
    { ...laidOut.find((node) => node.id === 2), x: laidOut.find((node) => node.id === 2).x + 48, y: laidOut.find((node) => node.id === 2).y - 22 },
  );
  assert.equal(adjusted.find((node) => node.id === 1), laidOut.find((node) => node.id === 1), "untouched nodes preserve identity");
  assert.deepEqual(nodes.map(({ id, x, y }) => ({ id, x, y })), [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 0, y: 0 },
    { id: 3, x: 0, y: 0 },
    { id: 4, x: 0, y: 0 },
  ], "saved canvas coordinates stay untouched");
});

test("tree view layout is deterministic for a broad 100-node crown", () => {
  const nodes = [{ id: 1, parent: null, text: "根", note: "", x: 400, y: 280, tone: "ink" }];
  for (let id = 2; id <= 100; id++) {
    const parent = id <= 9 ? 1 : 2 + ((id - 10) % 8);
    nodes.push({ id, parent, text: `節點 ${id}`, note: "", x: id, y: id, tone: id % 2 ? "sage" : "coral" });
  }
  const first = layoutTreeViewNodes(nodes);
  const second = layoutTreeViewNodes(nodes);
  assert.deepEqual(first, second);
  const byId = new Map(first.map((node) => [node.id, node]));
  for (const node of first.slice(1)) {
    assert.ok(node.y + nodeBounds(node).height < byId.get(node.parent).y);
  }
});

test("tree connections share a trunk before splitting into thinner branches", () => {
  const laidOut = layoutTreeViewNodes(sampleNodes());
  const ribbons = createTreeBranchRibbons(laidOut);
  const rootTrunk = ribbons.find((ribbon) => ribbon.id === "trunk-1");
  const rootBranches = ribbons.filter((ribbon) => ribbon.id === "branch-1-2" || ribbon.id === "branch-1-4");

  assert.ok(rootTrunk, "a multi-child root grows one shared trunk");
  assert.equal(rootBranches.length, 2);
  assert.equal(ribbons.length, 4, "three edges become one trunk plus three branches");
  assert.equal(rootTrunk.tone, "trunk");

  const startCenter = (ribbon) => ({
    x: (ribbon.curve.top.start[0] + ribbon.curve.bottom.start[0]) / 2,
    y: (ribbon.curve.top.start[1] + ribbon.curve.bottom.start[1]) / 2,
  });
  const firstStart = startCenter(rootBranches[0]);
  const secondStart = startCenter(rootBranches[1]);
  assert.equal(firstStart.y, secondStart.y, "balanced siblings leave the trunk at the same height");
  assert.ok(Math.abs(firstStart.x - secondStart.x) < 12, "siblings peel from the same narrow trunk");

  const trunkStartWidth = Math.hypot(
    rootTrunk.curve.top.start[0] - rootTrunk.curve.bottom.start[0],
    rootTrunk.curve.top.start[1] - rootTrunk.curve.bottom.start[1],
  );
  const branchStartWidth = Math.hypot(
    rootBranches[0].curve.top.start[0] - rootBranches[0].curve.bottom.start[0],
    rootBranches[0].curve.top.start[1] - rootBranches[0].curve.bottom.start[1],
  );
  assert.ok(trunkStartWidth > branchStartWidth, "the trunk is thicker than its outgoing branches");
});

test("wide tree crowns peel colored limbs from staggered trunk heights", () => {
  const nodes = [
    { id: 1, parent: null, text: "根", note: "", x: 438, y: 568, tone: "ink" },
    { id: 2, parent: 1, text: "左一", note: "", x: 26, y: 378, tone: "coral" },
    { id: 3, parent: 1, text: "左二", note: "", x: 238, y: 378, tone: "sage" },
    { id: 4, parent: 1, text: "右一", note: "", x: 662, y: 378, tone: "sun" },
    { id: 5, parent: 1, text: "右二", note: "", x: 874, y: 378, tone: "coral" },
  ];
  const ribbons = createTreeBranchRibbons(nodes);
  assert.equal(ribbons.filter((ribbon) => ribbon.id === "trunk-1").length, 1);
  const branches = ribbons.filter((ribbon) => ribbon.kind === "branch");
  assert.equal(branches.length, 4);
  assert.ok(ribbons.every((ribbon) => !ribbon.id.startsWith("bough-")));

  const startY = (ribbon) =>
    (ribbon.curve.top.start[1] + ribbon.curve.bottom.start[1]) / 2;
  const outerBranch = ribbons.find((ribbon) => ribbon.id === "branch-1-2");
  const innerBranch = ribbons.find((ribbon) => ribbon.id === "branch-1-3");
  assert.ok(startY(outerBranch) > startY(innerBranch), "outer limbs leave the trunk lower");
});
