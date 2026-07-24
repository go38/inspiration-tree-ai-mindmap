// Pure, dependency-free mind map helpers.
// Kept free of React/DOM imports so they can be unit-tested directly under
// `node --test` (Node strips the TypeScript types on import).

export type NodeItem = {
  id: number;
  parent: number | null;
  text: string;
  note: string;
  x: number;
  y: number;
  tone: "ink" | "coral" | "sage" | "sun";
};

export type HistoryState = {
  nodes: NodeItem[];
  selectedId: number;
};

export type HistoryShortcut = "undo" | "redo" | null;

export function historyShortcutForKey(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): HistoryShortcut {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.metaKey) return "redo";
  return null;
}

/** Newest history depth kept for undo/redo (HIS-04: at least 15 states). */
export const HISTORY_LIMIT = 15;

const TONES = new Set(["ink", "coral", "sage", "sun"]);
const LAYOUT_NODE_WIDTH = 180;
const LAYOUT_ROOT_WIDTH = 204;
const LAYOUT_NODE_HEIGHT = 70;
const LAYOUT_ROOT_HEIGHT = 82;
const LAYOUT_COLUMN_GAP = 112;
const LAYOUT_ROW_GAP = 28;
const LAYOUT_COLLISION_GAP = 18;
const TREE_STAGE_CENTER_X = 540;
const TREE_ROOT_Y = 650;
const TREE_LEVEL_GAP = 250;
const TREE_LEAF_STEP = 212;

type LayoutDirection = -1 | 1;

type NodeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Structural guard for a single persisted node (used by storage + shared maps). */
export function isValidNode(value: unknown): value is NodeItem {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.id === "number" &&
    (node.parent === null || typeof node.parent === "number") &&
    typeof node.text === "string" &&
    typeof node.note === "string" &&
    typeof node.x === "number" &&
    typeof node.y === "number" &&
    typeof node.tone === "string" &&
    TONES.has(node.tone)
  );
}

/**
 * Validate an untrusted value as a mind map node array. Returns the typed
 * array, or null if it is not a non-empty array with exactly one center node
 * (parent === null) and every node structurally valid.
 */
export function parseNodes(value: unknown): NodeItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every(isValidNode)) return null;
  const nodes = value as NodeItem[];
  const roots = nodes.filter((node) => node.parent === null);
  if (roots.length !== 1) return null;
  return nodes;
}

/** Push a state onto a history stack, capping it at HISTORY_LIMIT entries. */
export function pushHistory(history: HistoryState[], state: HistoryState): HistoryState[] {
  return [...history.slice(-(HISTORY_LIMIT - 1)), state];
}

/** Next unused node id (max existing id + 1; 1 when there are no nodes). */
export function nextNodeId(nodes: NodeItem[]): number {
  if (nodes.length === 0) return 1;
  return Math.max(...nodes.map((node) => node.id)) + 1;
}

/** Depth of a node from the root: root parent === null is depth 0. */
export function depthOf(nodes: NodeItem[], node: NodeItem): number {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  let depth = 0;
  let current: NodeItem | undefined = node;
  while (current && current.parent !== null) {
    depth += 1;
    current = byId.get(current.parent);
  }
  return depth;
}

/** Ids of a node and all of its descendants (the whole subtree). */
export function collectSubtreeIds(nodes: NodeItem[], rootId: number): Set<number> {
  const ids = new Set<number>([rootId]);
  let foundChild = true;
  while (foundChild) {
    foundChild = false;
    nodes.forEach((node) => {
      if (node.parent !== null && ids.has(node.parent) && !ids.has(node.id)) {
        ids.add(node.id);
        foundChild = true;
      }
    });
  }
  return ids;
}

/** Rendered node size used by fit-to-view, auto-layout, and overlap tests. */
export function nodeBounds(node: NodeItem): NodeBounds {
  return {
    x: node.x,
    y: node.y,
    width: node.tone === "ink" ? LAYOUT_ROOT_WIDTH : LAYOUT_NODE_WIDTH,
    height: node.tone === "ink" ? LAYOUT_ROOT_HEIGHT : LAYOUT_NODE_HEIGHT,
  };
}

/** True when two rendered node cards overlap (optionally including a gap). */
export function nodeBoundsOverlap(a: NodeBounds, b: NodeBounds, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * Deterministic tidy-tree layout.
 *
 * With no rootId (or the center id), first-level branches are placed on both
 * sides of the center while preserving an existing clear left/right choice.
 * With a non-center rootId, that branch root stays anchored and descendants
 * are arranged outward on its current side. Unselected nodes never move.
 */
export function autoLayoutNodes(nodes: NodeItem[], rootId?: number): NodeItem[] {
  if (nodes.length < 2) return nodes;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const center = nodes.find((node) => node.parent === null);
  const target = rootId === undefined ? center : byId.get(rootId);
  if (!center || !target) return nodes;

  const childrenByParent = new Map<number, NodeItem[]>();
  for (const node of nodes) {
    if (node.parent === null || !byId.has(node.parent)) continue;
    const siblings = childrenByParent.get(node.parent);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parent, [node]);
  }

  const positioned = new Map<number, { x: number; y: number }>();
  const reachable = new Set<number>();

  const layoutForest = (
    anchor: NodeItem,
    roots: NodeItem[],
    direction: LayoutDirection,
  ) => {
    if (roots.length === 0) return;
    const centers = new Map<number, number>();
    const visited = new Set<number>([anchor.id]);
    let nextLeafCenter = 0;

    const arrangeY = (node: NodeItem): number => {
      if (visited.has(node.id)) return nextLeafCenter;
      visited.add(node.id);
      reachable.add(node.id);
      const children = (childrenByParent.get(node.id) ?? []).filter((child) => !visited.has(child.id));
      if (children.length === 0) {
        const centerY = nextLeafCenter;
        nextLeafCenter += LAYOUT_NODE_HEIGHT + LAYOUT_ROW_GAP;
        centers.set(node.id, centerY);
        return centerY;
      }
      const childCenters = children.map(arrangeY);
      const centerY = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
      centers.set(node.id, centerY);
      return centerY;
    };

    roots.forEach(arrangeY);
    const laidOutCenters = [...centers.values()];
    const forestMiddle = (Math.min(...laidOutCenters) + Math.max(...laidOutCenters)) / 2;
    const anchorCenterY = anchor.y + nodeBounds(anchor).height / 2;

    const assignX = (node: NodeItem, depth: number, path: Set<number>) => {
      if (path.has(node.id)) return;
      const nextPath = new Set(path).add(node.id);
      const anchorBounds = nodeBounds(anchor);
      const x = direction > 0
        ? anchor.x + anchorBounds.width + LAYOUT_COLUMN_GAP + (depth - 1) * (LAYOUT_NODE_WIDTH + LAYOUT_COLUMN_GAP)
        : anchor.x - LAYOUT_COLUMN_GAP - LAYOUT_NODE_WIDTH - (depth - 1) * (LAYOUT_NODE_WIDTH + LAYOUT_COLUMN_GAP);
      const centerY = (centers.get(node.id) ?? forestMiddle) - forestMiddle + anchorCenterY;
      positioned.set(node.id, { x, y: centerY - nodeBounds(node).height / 2 });
      (childrenByParent.get(node.id) ?? []).forEach((child) => assignX(child, depth + 1, nextPath));
    };

    roots.forEach((root) => assignX(root, 1, new Set([anchor.id])));
  };

  if (target.parent === null) {
    const rootChildren = childrenByParent.get(target.id) ?? [];
    const left: NodeItem[] = [];
    const right: NodeItem[] = [];
    let ambiguousIndex = 0;
    const centerX = target.x + nodeBounds(target).width / 2;

    for (const child of rootChildren) {
      const childCenterX = child.x + nodeBounds(child).width / 2;
      if (childCenterX < centerX - 24) left.push(child);
      else if (childCenterX > centerX + 24) right.push(child);
      else {
        (ambiguousIndex % 2 === 0 ? left : right).push(child);
        ambiguousIndex += 1;
      }
    }
    layoutForest(target, left, -1);
    layoutForest(target, right, 1);
  } else {
    const parent = byId.get(target.parent);
    const parentCenterX = parent ? parent.x + nodeBounds(parent).width / 2 : target.x;
    const targetCenterX = target.x + nodeBounds(target).width / 2;
    const direction: LayoutDirection = targetCenterX < parentCenterX ? -1 : 1;
    layoutForest(target, childrenByParent.get(target.id) ?? [], direction);

    // Move the arranged descendants together by the smallest vertical amount
    // that clears cards outside the selected branch. The branch root remains
    // fixed, so a local tidy-up never repositions unrelated ideas.
    const candidates = nodes
      .filter((node) => positioned.has(node.id))
      .map((node) => ({ ...node, ...positioned.get(node.id)! }));
    const fixed = nodes.filter((node) => !reachable.has(node.id));
    const forbiddenOffsets: [number, number][] = [];
    for (const candidate of candidates) {
      const candidateBox = nodeBounds(candidate);
      for (const fixedNode of fixed) {
        const fixedBox = nodeBounds(fixedNode);
        const horizontalConflict =
          candidateBox.x < fixedBox.x + fixedBox.width + LAYOUT_COLLISION_GAP &&
          candidateBox.x + candidateBox.width + LAYOUT_COLLISION_GAP > fixedBox.x;
        if (!horizontalConflict) continue;
        forbiddenOffsets.push([
          fixedBox.y - candidateBox.y - candidateBox.height - LAYOUT_COLLISION_GAP,
          fixedBox.y + fixedBox.height + LAYOUT_COLLISION_GAP - candidateBox.y,
        ]);
      }
    }
    forbiddenOffsets.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const interval of forbiddenOffsets) {
      const previous = merged.at(-1);
      if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
      else merged.push([...interval]);
    }
    const blockedAtZero = merged.find(([start, end]) => start <= 0 && end >= 0);
    if (blockedAtZero) {
      const offset = Math.abs(blockedAtZero[0]) <= Math.abs(blockedAtZero[1])
        ? blockedAtZero[0] - 1
        : blockedAtZero[1] + 1;
      positioned.forEach((position, id) => positioned.set(id, { ...position, y: position.y + offset }));
    }
  }

  let changed = false;
  const next = nodes.map((node) => {
    const position = positioned.get(node.id);
    if (!position) return node;
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    if (node.x === x && node.y === y) return node;
    changed = true;
    return { ...node, x, y };
  });
  return changed ? next : nodes;
}

/**
 * Read-only, bottom-up tree layout used by the "樹狀" view.
 *
 * The root becomes the base of the trunk, descendants grow upward, and every
 * parent is centered over the horizontal span of its leaves. The returned
 * nodes are copies, so switching views never changes the saved mind-map
 * coordinates or creates an undo checkpoint.
 */
export function layoutTreeViewNodes(nodes: NodeItem[]): NodeItem[] {
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const root = nodes.find((node) => node.parent === null);
  if (!root) return nodes.map((node) => ({ ...node }));

  const childrenByParent = new Map<number, NodeItem[]>();
  for (const node of nodes) {
    if (node.parent === null || !byId.has(node.parent)) continue;
    const siblings = childrenByParent.get(node.parent);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parent, [node]);
  }

  const depthById = new Map<number, number>([[root.id, 0]]);
  const centerSlotById = new Map<number, number>();
  const visiting = new Set<number>();
  const visited = new Set<number>();
  let nextLeafSlot = 0;
  let maxDepth = 0;

  const measure = (node: NodeItem, depth: number): number => {
    if (visiting.has(node.id) || visited.has(node.id)) {
      const fallback = nextLeafSlot++;
      centerSlotById.set(node.id, fallback);
      return fallback;
    }
    visiting.add(node.id);
    visited.add(node.id);
    depthById.set(node.id, depth);
    maxDepth = Math.max(maxDepth, depth);
    const children = (childrenByParent.get(node.id) ?? []).filter((child) => !visiting.has(child.id));
    let centerSlot: number;
    if (children.length === 0) {
      centerSlot = nextLeafSlot++;
    } else {
      const childSlots = children.map((child) => measure(child, depth + 1));
      centerSlot = (childSlots[0] + childSlots[childSlots.length - 1]) / 2;
    }
    centerSlotById.set(node.id, centerSlot);
    visiting.delete(node.id);
    return centerSlot;
  };

  measure(root, 0);
  // Keep malformed or disconnected nodes deterministic and visible rather
  // than stacking them on the root.
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    depthById.set(node.id, 1);
    centerSlotById.set(node.id, nextLeafSlot++);
  }

  const leafMiddle = Math.max(0, nextLeafSlot - 1) / 2;
  const rootY = Math.max(TREE_ROOT_Y, maxDepth * TREE_LEVEL_GAP + 76);
  const rootChildren = childrenByParent.get(root.id) ?? [];
  const rootChildStagger = new Map<number, number>();
  if (rootChildren.length >= 3) {
    const middle = (rootChildren.length - 1) / 2;
    const span = Math.max(middle, 1);
    rootChildren.forEach((child, index) => {
      const edgeRatio = Math.abs(index - middle) / span;
      rootChildStagger.set(child.id, Math.round(edgeRatio * 190 - 180));
    });
  }
  return nodes.map((node) => {
    const depth = depthById.get(node.id) ?? 1;
    const bounds = nodeBounds(node);
    const centerX = TREE_STAGE_CENTER_X + ((centerSlotById.get(node.id) ?? leafMiddle) - leafMiddle) * TREE_LEAF_STEP;
    // Small alternating lift gives the crown a natural rhythm while the
    // generous level gap still guarantees children remain above parents.
    const stagger = rootChildStagger.get(node.id) ?? (depth > 0 ? ((node.id % 3) - 1) * 12 : 0);
    return {
      ...node,
      x: Math.round(centerX - bounds.width / 2),
      y: Math.round(rootY - depth * TREE_LEVEL_GAP + stagger),
    };
  });
}

/** Move a node before another sibling while preserving every subtree. */
export function reorderSiblingNodes(nodes: NodeItem[], sourceId: number, targetId: number): NodeItem[] {
  if (sourceId === targetId) return nodes;
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || !target || source.parent === null || source.parent !== target.parent) return nodes;
  const siblingSlots = nodes.flatMap((node, index) => node.parent === source.parent ? [index] : []);
  const siblings = siblingSlots.map((index) => nodes[index]);
  const sourceIndex = siblings.findIndex((node) => node.id === sourceId);
  const targetIndex = siblings.findIndex((node) => node.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return nodes;
  const reordered = [...siblings];
  const [moved] = reordered.splice(sourceIndex, 1);
  const insertionIndex = reordered.findIndex((node) => node.id === targetId);
  reordered.splice(insertionIndex, 0, moved);
  const next = [...nodes];
  siblingSlots.forEach((slot, index) => { next[slot] = reordered[index]; });
  return next;
}

/** Move a node one position among its siblings. */
export function moveSiblingNode(nodes: NodeItem[], nodeId: number, delta: -1 | 1): NodeItem[] {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node || node.parent === null) return nodes;
  const siblings = nodes.filter((item) => item.parent === node.parent);
  const index = siblings.findIndex((item) => item.id === nodeId);
  const targetIndex = index + delta;
  if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return nodes;
  if (delta < 0) return reorderSiblingNodes(nodes, nodeId, siblings[targetIndex].id);
  return reorderSiblingNodes(nodes, siblings[targetIndex].id, nodeId);
}

/** Filesystem-safe file name derived from a node title. */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 48) || "心智圖";
}

/** Markdown lines for the current map. Timestamp is injected for testability. */
export function buildMarkdownLines(nodes: NodeItem[], timestamp: string): string[] {
  const roots = nodes.filter((node) => node.parent === null);
  const lines = ["# 靈感樹心智圖", "", `> 匯出時間：${timestamp}`, ""];
  function appendNode(node: NodeItem, depth: number) {
    lines.push(`${"#".repeat(Math.min(depth + 1, 6))} ${node.text.replace(/\n/g, " ")}`, "");
    if (node.note.trim()) lines.push(node.note.trim(), "");
    nodes.filter((item) => item.parent === node.id).forEach((child) => appendNode(child, depth + 1));
  }
  roots.forEach((root) => appendNode(root, 1));
  return lines;
}

export function createCurvedRibbon(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  startWidth: number,
  endWidth: number,
  seed: number,
) {
  const dx = x2 - x1, dy = y2 - y1;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const nx = -dy / length, ny = dx / length;
  const bend = Math.min(46, length * .13) * (seed % 2 === 0 ? 1 : -1);
  const c1x = x1 + dx * .34 + nx * bend, c1y = y1 + dy * .34 + ny * bend;
  const c2x = x1 + dx * .68 + nx * bend, c2y = y1 + dy * .68 + ny * bend;
  const startHalf = startWidth / 2, endHalf = endWidth / 2;
  const top = {
    start: [x1 + nx * startHalf, y1 + ny * startHalf],
    c1: [c1x + nx * startHalf * .72, c1y + ny * startHalf * .72],
    c2: [c2x + nx * endHalf * 1.35, c2y + ny * endHalf * 1.35],
    end: [x2 + nx * endHalf, y2 + ny * endHalf],
  };
  const bottom = {
    start: [x1 - nx * startHalf, y1 - ny * startHalf],
    c1: [c1x - nx * startHalf * .72, c1y - ny * startHalf * .72],
    c2: [c2x - nx * endHalf * 1.35, c2y - ny * endHalf * 1.35],
    end: [x2 - nx * endHalf, y2 - ny * endHalf],
  };
  const p = (point: number[]) => `${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
  return {
    top, bottom,
    path: `M ${p(top.start)} C ${p(top.c1)}, ${p(top.c2)}, ${p(top.end)} L ${p(bottom.end)} C ${p(bottom.c2)}, ${p(bottom.c1)}, ${p(bottom.start)} Z`,
  };
}

export type TreeRibbon = {
  id: string;
  tone: NodeItem["tone"] | "trunk";
  kind: "trunk" | "branch";
  curve: ReturnType<typeof createCurvedRibbon>;
  path: string;
};

/**
 * Build a tree-like connection system with shared trunks and visible forks.
 *
 * Parents with multiple children grow one common trunk. Their colored limbs
 * peel away at staggered heights: outer branches leave lower while inner
 * branches follow the trunk farther upward. A single-child chain remains one
 * continuous branch in the child's color.
 */
export function createTreeBranchRibbons(nodes: NodeItem[]): TreeRibbon[] {
  if (nodes.length < 2) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<number, NodeItem[]>();
  for (const node of nodes) {
    if (node.parent === null || !byId.has(node.parent)) continue;
    const children = childrenByParent.get(node.parent);
    if (children) children.push(node);
    else childrenByParent.set(node.parent, [node]);
  }

  const ribbons: TreeRibbon[] = [];
  for (const parent of nodes) {
    const children = childrenByParent.get(parent.id) ?? [];
    if (children.length === 0) continue;
    const parentBox = nodeBounds(parent);
    const parentX = parent.x + parentBox.width / 2;
    const parentY = parent.y;
    const parentDepth = depthOf(nodes, parent);
    const trunkWidth = Math.max(8, 22 - parentDepth * 6);

    if (children.length === 1) {
      const child = children[0];
      const childBox = nodeBounds(child);
      const endX = child.x + childBox.width / 2;
      const endY = child.y + childBox.height;
      const curve = createCurvedRibbon(
        parentX,
        parentY,
        endX,
        endY,
        trunkWidth,
        Math.max(1.6, trunkWidth * .16),
        parent.id * 31 + child.id,
      );
      ribbons.push({
        id: `branch-${parent.id}-${child.id}`,
        tone: child.tone,
        kind: "branch",
        curve,
        path: curve.path,
      });
      continue;
    }

    const orderedChildren = [...children].sort((a, b) => {
      const aCenter = a.x + nodeBounds(a).width / 2;
      const bCenter = b.x + nodeBounds(b).width / 2;
      return aCenter - bCenter;
    });
    const childCenters = orderedChildren.map((child) => child.x + nodeBounds(child).width / 2);
    const maxHorizontalDistance = Math.max(
      1,
      ...childCenters.map((center) => Math.abs(center - parentX)),
    );
    const branchStarts = orderedChildren.map((child, index) => {
      const distance = childCenters[index] - parentX;
      const edgeRatio = Math.abs(distance) / maxHorizontalDistance;
      const childBottom = child.y + nodeBounds(child).height;
      const availableRise = Math.max(42, parentY - childBottom);
      const desiredRise = 48 + (1 - edgeRatio) * 72;
      const rise = Math.min(desiredRise, Math.max(38, availableRise * .72));
      return {
        child,
        x: parentX + Math.sign(distance) * Math.min(11, Math.abs(distance) * .035),
        y: parentY - rise,
        edgeRatio,
      };
    });
    const trunkEndY = Math.min(...branchStarts.map((start) => start.y)) - 5;
    const junctionWidth = Math.max(6, trunkWidth * .42);
    const trunk = createCurvedRibbon(
      parentX,
      parentY,
      parentX,
      trunkEndY,
      trunkWidth,
      junctionWidth,
      parent.id * 19,
    );
    ribbons.push({
      id: `trunk-${parent.id}`,
      tone: "trunk",
      kind: "trunk",
      curve: trunk,
      path: trunk.path,
    });

    branchStarts.forEach(({ child, x, y, edgeRatio }, index) => {
      const childBox = nodeBounds(child);
      const endX = child.x + childBox.width / 2;
      const endY = child.y + childBox.height;
      const branchWidth = Math.max(5.5, trunkWidth * (.38 + (1 - edgeRatio) * .12));
      const curve = createCurvedRibbon(
        x,
        y,
        endX,
        endY,
        branchWidth,
        Math.max(1.3, branchWidth * .18),
        parent.id * 47 + child.id + index,
      );
      ribbons.push({
        id: `branch-${parent.id}-${child.id}`,
        tone: child.tone,
        kind: "branch",
        curve,
        path: curve.path,
      });
    });
  }
  return ribbons;
}
