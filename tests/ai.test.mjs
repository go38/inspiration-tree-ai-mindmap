import assert from "node:assert/strict";
import test from "node:test";
import { buildAiInput, extractAiResponseText, parseAiExplanationResponse, parseAiHistory, parseAiResponse, parseAiSuggestRequest } from "../app/lib/ai.ts";

const nodes = [
  { id: 1, parent: null, text: "理想生活", note: "中心", x: 0, y: 0, tone: "ink" },
  { id: 2, parent: 1, text: "健康", note: "睡得更好", x: 0, y: 0, tone: "sage" },
];

test("AI request parser validates modes and limits context to known nodes", () => {
  const parsed = parseAiSuggestRequest({ mode: "breakdown", prompt: " 行動計畫 ", focusNodeId: 2, contextNodeIds: [1, 2, 99, 2], nodes });
  assert.ok(parsed);
  assert.equal(parsed.prompt, "行動計畫");
  assert.deepEqual(parsed.contextNodeIds, [1, 2]);
  assert.equal(parseAiSuggestRequest({ mode: "expand", focusNodeId: 2, nodes })?.mode, "expand");
  assert.equal(parseAiSuggestRequest({ mode: "explain", focusNodeId: 2, nodes })?.mode, "explain");
  assert.equal(parseAiSuggestRequest({ mode: "unknown", focusNodeId: 2, nodes }), null);
});

test("AI prompt includes mode, focus and selected node context", () => {
  const parsed = parseAiSuggestRequest({ mode: "challenge", prompt: "找盲點", focusNodeId: 2, contextNodeIds: [1, 2], nodes });
  const input = buildAiInput(parsed);
  assert.match(input, /質疑/);
  assert.match(input, /\[1\].*理想生活/);
  assert.match(input, /找盲點/);
});

test("AI expansion prompt includes existing children and asks for non-duplicate nodes", () => {
  const branchNodes = [...nodes, { id: 3, parent: 2, text: "固定睡眠", note: "每天同一時間上床", x: 0, y: 0, tone: "coral" }];
  const parsed = parseAiSuggestRequest({ mode: "expand", prompt: "", focusNodeId: 2, contextNodeIds: [], nodes: branchNodes });
  const input = buildAiInput(parsed);
  assert.match(input, /任務：為目前節點擴寫/);
  assert.match(input, /既有子節點.*固定睡眠/s);
  assert.match(input, /避免同義重複/);
});

test("AI explanation prompt asks for grounded definition, key points, and relationships", () => {
  const parsed = parseAiSuggestRequest({ mode: "explain", prompt: "給初學者", focusNodeId: 2, contextNodeIds: [], nodes });
  const input = buildAiInput(parsed);
  assert.match(input, /任務：解讀目前節點的概念/);
  assert.match(input, /白話建立清楚定義/);
  assert.match(input, /不得把推測寫成事實/);
  assert.match(input, /給初學者/);
});

test("AI response parser rejects malformed output and unknown source ids", () => {
  const result = parseAiResponse({ summary: "整理結果", suggestions: [{ title: "固定睡眠時間", note: "每天同一時間上床", sourceNodeIds: [2, 99] }] }, new Set([1, 2]));
  assert.deepEqual(result.suggestions[0].sourceNodeIds, [2]);
  assert.equal(parseAiResponse({ summary: "", suggestions: [] }, new Set([1])), null);
});

test("AI explanation parser validates useful content and removes unknown connections", () => {
  const result = parseAiExplanationResponse({
    summary: "健康是維持日常身心運作的基礎。",
    explanation: {
      definition: "健康包含身體、心理與生活節奏的整體狀態。",
      keyPoints: ["不是只有沒有疾病", "需要持續觀察與調整"],
      connections: [{ nodeId: 1, relation: "是理想生活的基礎" }, { nodeId: 99, relation: "不存在" }],
      question: "目前最想改善的是哪一個面向？",
    },
  }, new Set([1, 2]));
  assert.equal(result.explanation.connections.length, 1);
  assert.equal(result.explanation.connections[0].nodeId, 1);
  assert.equal(parseAiExplanationResponse({ summary: "不完整", explanation: { definition: "", keyPoints: [], connections: [], question: "" } }, new Set([1])), null);
});

test("AI response text extractor supports raw Responses API output", () => {
  const structured = '{"summary":"整理結果","suggestions":[]}';
  assert.equal(extractAiResponseText({ output_text: structured }), structured);
  assert.equal(extractAiResponseText({ output: [{ type: "reasoning", content: [] }, { type: "message", content: [{ type: "output_text", text: structured }] }] }), structured);
  assert.equal(extractAiResponseText({ output: [{ type: "message", content: [{ type: "refusal", refusal: "無法回答" }] }] }), null);
});

test("AI history is restored per node and malformed records are ignored", () => {
  const history = parseAiHistory(JSON.stringify({ 2: [{ id: "turn-1", mode: "diverge", prompt: "更多方向", summary: "摘要", suggestions: [], adoptedTitles: [] }], bad: [{ id: 1 }] }));
  assert.equal(history[2][0].summary, "摘要");
  assert.equal(history.bad, undefined);
  assert.deepEqual(parseAiHistory("not-json"), {});
});
