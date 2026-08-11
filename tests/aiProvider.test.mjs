import assert from "node:assert/strict";
import test from "node:test";
import { extractClaudeText, readAiConfig, toAnthropicSchema } from "../app/lib/aiProvider.ts";
import { AI_MAP_RESPONSE_SCHEMA } from "../app/lib/aiMap.ts";

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

test("schema conversion strips the keywords Anthropic structured outputs reject", () => {
  const converted = toAnthropicSchema(AI_MAP_RESPONSE_SCHEMA);
  const serialized = JSON.stringify(converted);
  for (const keyword of ["minItems", "maxItems", "minLength", "maxLength", "multipleOf"]) {
    assert.doesNotMatch(serialized, new RegExp(keyword), `${keyword} must not reach the API`);
  }
  // Everything load-bearing survives, including nested objects and enums.
  assert.equal(converted.additionalProperties, false);
  assert.deepEqual(converted.required, ["title", "summary", "nodes"]);
  assert.deepEqual(converted.properties.nodes.items.properties.tone.enum, ["ink", "coral", "sage", "sun"]);
  assert.equal(converted.properties.nodes.items.additionalProperties, false);
  // The source schema keeps its constraints as documentation.
  assert.equal(AI_MAP_RESPONSE_SCHEMA.properties.nodes.minItems, 3);
});

test("response extractor reads Anthropic content blocks and rejects unusable replies", () => {
  const structured = '{"summary":"整理結果","suggestions":[]}';
  assert.equal(extractClaudeText({ content: [{ type: "text", text: structured }] }), structured);
  assert.equal(
    extractClaudeText({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: structured }] }),
    structured,
  );
  assert.equal(extractClaudeText({ content: [] }), null);
  assert.equal(extractClaudeText({ content: [{ type: "text", text: "   " }] }), null);
  // The OpenAI Responses shape must not be silently accepted any more.
  assert.equal(extractClaudeText({ output_text: structured }), null);
});
