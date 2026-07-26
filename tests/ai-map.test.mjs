import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_MAP_DETAIL_OPTIONS,
  buildAiMapInput,
  materializeAiMapDraft,
  parseAiMapDraft,
  parseAiMapRequest,
} from "../app/lib/aiMap.ts";

const rawDraft = {
  title: "MikroTik VLAN 課程",
  summary: "從基礎觀念到實作與評量的課程結構。",
  nodes: [
    { key: "root", parentKey: null, text: "MikroTik VLAN", note: "完成 VLAN 規劃、設定與驗證", tone: "ink" },
    { key: "concept", parentKey: "root", text: "核心觀念", note: "理解 VLAN、Tag 與 Untag", tone: "coral" },
    { key: "lab", parentKey: "root", text: "實作 Lab", note: "建立可重現的操作練習", tone: "sage" },
    { key: "bridge", parentKey: "lab", text: "Bridge VLAN", note: "設定 VLAN filtering 與 ports", tone: "sun" },
  ],
};

test("AI map requests require a meaningful prompt and explicit detail", () => {
  assert.deepEqual(parseAiMapRequest({ prompt: "  MikroTik VLAN 課程  ", detail: "standard" }), { prompt: "MikroTik VLAN 課程", detail: "standard" });
  assert.equal(parseAiMapRequest({ prompt: "AI", detail: "standard" }), null);
  assert.equal(parseAiMapRequest({ prompt: "完整課程", detail: "unknown" }), null);
  assert.equal(AI_MAP_DETAIL_OPTIONS.deep.maximumNodes, 40);
});

test("AI map input sets hierarchy, language, safety, and size constraints", () => {
  const input = buildAiMapInput({ prompt: "規劃 VLAN 課程", detail: "concise" });
  assert.match(input, /最多 12 個節點/);
  assert.match(input, /只能有一個.*中心節點/);
  assert.match(input, /繁體中文/);
  assert.match(input, /不得捏造/);
});

test("AI map drafts validate parent order, unique keys, tones, and limits", () => {
  assert.deepEqual(parseAiMapDraft(rawDraft, 12), rawDraft);
  assert.equal(parseAiMapDraft({ ...rawDraft, nodes: rawDraft.nodes.slice(0, 2) }, 12), null);
  assert.equal(parseAiMapDraft({ ...rawDraft, nodes: rawDraft.nodes.map((node, index) => index === 2 ? { ...node, key: "concept" } : node) }, 12), null);
  assert.equal(parseAiMapDraft({ ...rawDraft, nodes: rawDraft.nodes.map((node, index) => index === 1 ? { ...node, parentKey: "missing" } : node) }, 12), null);
  assert.equal(parseAiMapDraft(rawDraft, 3), null);
});

test("AI map drafts materialize into a valid laid-out mind map", () => {
  const draft = parseAiMapDraft(rawDraft, 12);
  const nodes = materializeAiMapDraft(draft);
  assert.deepEqual(nodes.map((node) => node.parent), [null, 1, 1, 3]);
  assert.deepEqual(nodes.map((node) => node.id), [1, 2, 3, 4]);
  assert.equal(nodes[0].tone, "ink");
  assert.ok(nodes.some((node) => node.x !== 0 || node.y !== 0));
});
