import assert from "node:assert/strict";
import test from "node:test";
import { extractClaudeToolInput, readAiConfig } from "../app/lib/aiProvider.ts";

test("config prefers AI_* names and falls back to the shipped OPENAI_API_KEY", () => {
  assert.equal(readAiConfig({}, {}), null);

  const migrated = readAiConfig({ OPENAI_API_KEY: "sk-old" }, {});
  assert.equal(migrated.apiKey, "sk-old");
  assert.equal(migrated.model, "claude-haiku-4-5");
  assert.equal(migrated.baseUrl, "https://hnd1.aihub.zeabur.ai");

  const explicit = readAiConfig(
    { AI_API_KEY: "sk-new", AI_MODEL: "claude-sonnet-4-5", AI_BASE_URL: "https://sfo1.aihub.zeabur.ai/" },
    { OPENAI_API_KEY: "sk-ignored" },
  );
  assert.equal(explicit.apiKey, "sk-new");
  assert.equal(explicit.model, "claude-sonnet-4-5");
  assert.equal(explicit.baseUrl, "https://sfo1.aihub.zeabur.ai", "trailing slash must not double up the /v1/messages path");
});

test("an inherited OpenAI model name is never sent to Claude", () => {
  // OPENAI_MODEL is deliberately not a fallback: gpt-5.6-luna reaching the
  // Messages API would fail every request.
  const config = readAiConfig({ OPENAI_API_KEY: "sk-old", OPENAI_MODEL: "gpt-5.6-luna" }, {});
  assert.equal(config.model, "claude-haiku-4-5");
});

test("tool input extractor reads the forced call and ignores everything else", () => {
  const input = { summary: "整理結果", suggestions: [] };
  assert.deepEqual(
    extractClaudeToolInput({ content: [{ type: "tool_use", name: "emit", input }] }, "emit"),
    input,
  );
  // Claude may narrate before calling the tool; the call is what counts.
  assert.deepEqual(
    extractClaudeToolInput({ content: [{ type: "text", text: "好的" }, { type: "tool_use", name: "emit", input }] }, "emit"),
    input,
  );
  // A different tool must not be mistaken for ours.
  assert.equal(extractClaudeToolInput({ content: [{ type: "tool_use", name: "other", input }] }, "emit"), null);
  // Prose only — the failure this whole approach exists to catch. Zeabur's
  // Vertex backend answers this way when structured outputs are unavailable.
  assert.equal(extractClaudeToolInput({ content: [{ type: "text", text: "我是 Claude…" }] }, "emit"), null);
  assert.equal(extractClaudeToolInput({ content: [] }, "emit"), null);
  assert.equal(extractClaudeToolInput(null, "emit"), null);
});
