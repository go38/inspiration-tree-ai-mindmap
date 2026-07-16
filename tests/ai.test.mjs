import assert from "node:assert/strict";
import test from "node:test";
import { buildAiInput, parseAiHistory, parseAiResponse, parseAiSuggestRequest } from "../app/lib/ai.ts";

const nodes = [
  { id: 1, parent: null, text: "理想生活", note: "中心", x: 0, y: 0, tone: "ink" },
  { id: 2, parent: 1, text: "健康", note: "睡得更好", x: 0, y: 0, tone: "sage" },
];

test("AI request parser validates modes and limits context to known nodes", () => {
  const parsed = parseAiSuggestRequest({ mode: "breakdown", prompt: " 行動計畫 ", focusNodeId: 2, contextNodeIds: [1, 2, 99, 2], nodes });
  assert.ok(parsed);
  assert.equal(parsed.prompt, "行動計畫");
  assert.deepEqual(parsed.contextNodeIds, [1, 2]);
  assert.equal(parseAiSuggestRequest({ mode: "unknown", focusNodeId: 2, nodes }), null);
});

test("AI prompt includes mode, focus and selected node context", () => {
  const parsed = parseAiSuggestRequest({ mode: "challenge", prompt: "找盲點", focusNodeId: 2, contextNodeIds: [1, 2], nodes });
  const input = buildAiInput(parsed);
  assert.match(input, /質疑/);
  assert.match(input, /\[1\] 理想生活/);
  assert.match(input, /找盲點/);
});

test("AI response parser rejects malformed output and unknown source ids", () => {
  const result = parseAiResponse({ summary: "整理結果", suggestions: [{ title: "固定睡眠時間", note: "每天同一時間上床", sourceNodeIds: [2, 99] }] }, new Set([1, 2]));
  assert.deepEqual(result.suggestions[0].sourceNodeIds, [2]);
  assert.equal(parseAiResponse({ summary: "", suggestions: [] }, new Set([1])), null);
});

test("AI history is restored per node and malformed records are ignored", () => {
  const history = parseAiHistory(JSON.stringify({ 2: [{ id: "turn-1", mode: "diverge", prompt: "更多方向", summary: "摘要", suggestions: [], adoptedTitles: [] }], bad: [{ id: 1 }] }));
  assert.equal(history[2][0].summary, "摘要");
  assert.equal(history.bad, undefined);
  assert.deepEqual(parseAiHistory("not-json"), {});
});
