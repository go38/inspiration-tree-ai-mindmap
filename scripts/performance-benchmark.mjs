import { performance } from "node:perf_hooks";
import {
  autoLayoutNodes,
  buildChildrenByParent,
  buildDepthMap,
  buildNodeSearchIndex,
  createCanvasBranchRibbons,
  findMatchingNodeIds,
  layoutTreeViewNodes,
  moveNodeBy,
} from "../app/lib/mindmap.ts";

const SIZES = [100, 300, 500];
const INTERACTION_BUDGET_MS = 16;
const DERIVATION_BUDGET_MS = 50;
const LAYOUT_BUDGET_MS = 300;
const SAMPLE_COUNT = 80;

function largeMap(size) {
  const nodes = [{
    id: 1,
    parent: null,
    text: "大型心智圖效能基準",
    note: "中心節點",
    x: 420,
    y: 300,
    tone: "ink",
  }];
  const branchCount = Math.min(12, Math.max(6, Math.floor(size / 25)));
  for (let id = 2; id <= size; id++) {
    const parent = id <= branchCount + 1
      ? 1
      : 2 + ((id - branchCount - 2) % branchCount);
    nodes.push({
      id,
      parent,
      text: id % 17 === 0 ? `關鍵搜尋節點 ${id}` : `效能節點 ${id}`,
      note: `第 ${id} 個節點的說明文字，用於模擬真實搜尋與輸入負載`,
      x: 420 + (id % 10) * 12,
      y: 300 + (id % 8) * 10,
      tone: id % 3 === 0 ? "sage" : id % 3 === 1 ? "sun" : "coral",
    });
  }
  return autoLayoutNodes(nodes);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function measure(name, budgetMs, operation, samples = SAMPLE_COUNT) {
  for (let index = 0; index < 10; index++) operation(index);
  const durations = [];
  for (let index = 0; index < samples; index++) {
    const start = performance.now();
    operation(index);
    durations.push(performance.now() - start);
  }
  const result = {
    name,
    medianMs: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: Math.max(...durations),
    budgetMs,
  };
  result.pass = result.p95Ms <= budgetMs;
  return result;
}

const reports = [];
for (const size of SIZES) {
  let nodes = largeMap(size);
  const targetId = Math.max(2, Math.floor(size / 2));
  const searchIndex = buildNodeSearchIndex(nodes);
  const cases = [
    measure("drag-state-update", INTERACTION_BUDGET_MS, (index) => {
      nodes = moveNodeBy(nodes, targetId, { x: index % 2 === 0 ? 1 : -1, y: 0 });
    }),
    measure("search-query", INTERACTION_BUDGET_MS, (index) => {
      findMatchingNodeIds(searchIndex, index % 2 === 0 ? "關鍵搜尋" : "節點說明");
    }),
    measure("text-input-state", INTERACTION_BUDGET_MS, (index) => {
      const text = `正在輸入 ${index}`;
      nodes = nodes.map((node) => node.id === targetId ? { ...node, text } : node);
    }),
    measure("render-derivations", DERIVATION_BUDGET_MS, () => {
      buildDepthMap(nodes);
      buildChildrenByParent(nodes);
      buildNodeSearchIndex(nodes);
      createCanvasBranchRibbons(nodes);
    }, 30),
    measure("tree-layout", LAYOUT_BUDGET_MS, () => {
      layoutTreeViewNodes(nodes);
    }, 20),
  ];
  reports.push({ size, cases });
}

console.log("P0-15 large-map benchmark (milliseconds, p95 budgets)");
console.table(reports.flatMap(({ size, cases }) => cases.map((item) => ({
  nodes: size,
  operation: item.name,
  median: item.medianMs.toFixed(3),
  p95: item.p95Ms.toFixed(3),
  max: item.maxMs.toFixed(3),
  budget: item.budgetMs,
  result: item.pass ? "PASS" : "FAIL",
}))));

const failures = reports.flatMap(({ size, cases }) =>
  cases.filter((item) => !item.pass).map((item) => `${size} nodes / ${item.name}: ${item.p95Ms.toFixed(3)}ms > ${item.budgetMs}ms`),
);
if (failures.length > 0) {
  console.error(`Performance budget exceeded:\n${failures.join("\n")}`);
  process.exitCode = 1;
}
