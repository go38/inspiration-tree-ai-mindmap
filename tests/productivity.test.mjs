import assert from "node:assert/strict";
import test from "node:test";
import { parseMapImport } from "../app/lib/importMap.ts";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  parsePreferences,
  resetPreferences,
  savePreferences,
} from "../app/lib/preferences.ts";
import { BRANCH_TEMPLATES, TEMPLATE_CATEGORIES, applyBranchTemplate, duplicateBranch, filterBranchTemplates } from "../app/lib/reuse.ts";

const nodes = [
  { id: 1, parent: null, text: "中心", note: "", x: 400, y: 280, tone: "ink" },
  { id: 2, parent: 1, text: "分支", note: "說明", x: 150, y: 100, tone: "coral" },
  { id: 3, parent: 2, text: "子節點", note: "", x: 20, y: 20, tone: "sage" },
];

test("branch duplication assigns fresh ids and remaps the whole subtree", () => {
  const result = duplicateBranch(nodes, 2);
  assert.ok(result);
  assert.equal(result.rootId, 4);
  assert.equal(result.nodes.find((node) => node.id === 4).parent, 1);
  assert.equal(result.nodes.find((node) => node.id === 5).parent, 4);
  assert.equal(result.nodes.find((node) => node.id === 4).text, "分支（複本）");
  assert.equal(nodes.length, 3, "source remains unchanged for undo");
  assert.equal(duplicateBranch(nodes, 1), null, "center node is not duplicated");
});

test("built-in templates create reusable, correctly parented subtrees", () => {
  assert.equal(BRANCH_TEMPLATES.length, 11);
  const result = applyBranchTemplate(nodes, 2, BRANCH_TEMPLATES[0]);
  assert.ok(result);
  assert.equal(result.nodes.find((node) => node.id === result.rootId).parent, 2);
  const createdIds = new Set(result.nodes.slice(nodes.length).map((node) => node.id));
  for (const node of result.nodes.slice(nodes.length + 1)) assert.ok(createdIds.has(node.parent));
});

test("template marketplace filters categories, tags, descriptions, and empty queries", () => {
  assert.deepEqual(TEMPLATE_CATEGORIES, ["全部", "目標", "專案", "教育", "研究", "行銷", "敏捷", "AI", "生活"]);
  assert.equal(filterBranchTemplates(BRANCH_TEMPLATES, "", "全部").length, 11);
  assert.deepEqual(filterBranchTemplates(BRANCH_TEMPLATES, "", "AI").map((template) => template.id), ["ai-prompt"]);
  assert.deepEqual(filterBranchTemplates(BRANCH_TEMPLATES, "論文", "全部").map((template) => template.id), ["research-plan"]);
  assert.deepEqual(filterBranchTemplates(BRANCH_TEMPLATES, "不存在", "全部"), []);
  for (const template of BRANCH_TEMPLATES) {
    assert.ok(template.author);
    assert.ok(template.icon);
    assert.ok(template.tags.length);
  }
});

test("JSON import supports a versioned envelope and reports bad hierarchy by node", () => {
  const result = parseMapImport(JSON.stringify({ version: 1, title: "匯入地圖", nodes }), "json");
  assert.equal(result.ok, true);
  assert.equal(result.title, "匯入地圖");
  assert.equal(result.nodes.length, 3);

  const broken = parseMapImport(JSON.stringify({ nodes: [{ ...nodes[0], parent: 99 }] }), "json");
  assert.equal(broken.ok, false);
  assert.equal(broken.node, 1);
});

test("Markdown import previews hierarchy and gives line-specific errors", () => {
  const result = parseMapImport("# 專案\n中心說明\n## 研究\n- 使用者訪談\n### 假設\n驗證風險", "markdown");
  assert.equal(result.ok, true);
  assert.equal(result.title, "專案");
  assert.deepEqual(result.nodes.map((node) => node.parent), [null, 1, 2]);
  assert.equal(result.nodes[1].note, "使用者訪談");

  const broken = parseMapImport("# 專案\n### 跳級", "markdown");
  assert.deepEqual(broken, { ok: false, message: "標題層級跳太多；請逐層增加 #。", line: 2 });

  const exported = parseMapImport("# 靈感樹心智圖\n> 匯出時間：今天\n## 中心\n### 分支", "markdown");
  assert.equal(exported.ok, true);
  assert.deepEqual(exported.nodes.map((node) => node.text), ["中心", "分支"]);
});

test("preferences validate, clamp, persist, and reset safely", () => {
  assert.deepEqual(parsePreferences("{broken"), DEFAULT_PREFERENCES);
  const parsed = parsePreferences(JSON.stringify({
    version: 1,
    defaultView: "tree",
    aiPanelOpen: true,
    zoom: 900,
    reducedMotion: true,
  }));
  assert.deepEqual(parsed, { version: 1, defaultView: "tree", aiPanelOpen: true, zoom: 200, reducedMotion: true });

  const memory = new Map();
  const storage = {
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  assert.equal(savePreferences(parsed, storage), true);
  assert.ok(memory.has(PREFERENCES_STORAGE_KEY));
  assert.deepEqual(resetPreferences(storage), DEFAULT_PREFERENCES);
  assert.equal(memory.has(PREFERENCES_STORAGE_KEY), false);
});
