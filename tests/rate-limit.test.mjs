import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AI_RATE_RULES,
  DEFAULT_AI_SHARED_RULE,
  bucketKey,
  exceededRule,
  rateLimitIdentity,
  rateLimitMessage,
  readRateLimitConfig,
  retryAfterSeconds,
  windowStart,
} from "../app/lib/rateLimit.ts";

const MINUTE_RULE = DEFAULT_AI_RATE_RULES[0];

test("windows are fixed and aligned, so a bucket key is stable within one window", () => {
  const base = Date.UTC(2026, 7, 12, 10, 0, 0);
  assert.equal(windowStart(base, 60), Math.floor(base / 1000));
  assert.equal(windowStart(base + 59_999, 60), windowStart(base, 60));
  assert.equal(windowStart(base + 60_000, 60), windowStart(base, 60) + 60);
  assert.equal(windowStart(base, 3_600) % 3_600, 0);
  assert.equal(bucketKey("suggest", "ip:1.2.3.4", MINUTE_RULE), "suggest|1m|ip:1.2.3.4");
});

test("callers are identified by the Cloudflare client IP before any client-supplied header", () => {
  const spoofed = new Headers({
    "cf-connecting-ip": "203.0.113.9",
    "oai-authenticated-user-email": "someone@example.com",
  });
  assert.equal(rateLimitIdentity(spoofed), "ip:203.0.113.9");
  assert.equal(rateLimitIdentity(new Headers({ "oai-authenticated-user-email": "Someone@Example.com" })), "user:someone@example.com");
  assert.equal(rateLimitIdentity(new Headers()), "anon");
});

test("only counts above the limit are rejected, and the first blown window wins", () => {
  const counts = [
    { rule: MINUTE_RULE, count: MINUTE_RULE.limit, windowStart: 0 },
    { rule: DEFAULT_AI_SHARED_RULE, count: DEFAULT_AI_SHARED_RULE.limit + 1, windowStart: 0 },
  ];
  assert.equal(exceededRule([counts[0]]), null);
  assert.equal(exceededRule(counts)?.rule, DEFAULT_AI_SHARED_RULE);
  assert.equal(exceededRule([]), null);
});

test("retry-after counts the seconds left in the blown window, never zero", () => {
  const start = windowStart(Date.UTC(2026, 7, 12, 10, 0, 0), 60);
  const entry = { rule: MINUTE_RULE, count: 99, windowStart: start };
  assert.equal(retryAfterSeconds(entry, start * 1000), 60);
  assert.equal(retryAfterSeconds(entry, (start + 45) * 1000), 15);
  assert.equal(retryAfterSeconds(entry, (start + 60) * 1000), 1);
});

test("the shared daily window is explained differently from a personal one", () => {
  const shared = rateLimitMessage({ rule: DEFAULT_AI_SHARED_RULE, count: 1, windowStart: 0 });
  assert.match(shared, /整體上限/);
  assert.match(rateLimitMessage({ rule: MINUTE_RULE, count: 1, windowStart: 0 }), /太密集/);
  assert.notEqual(rateLimitMessage({ rule: DEFAULT_AI_RATE_RULES[2], count: 1, windowStart: 0 }), shared);
});

test("limits come from env overrides, and zero disables a window", () => {
  const defaults = readRateLimitConfig({}, {});
  assert.equal(defaults.rules.length, DEFAULT_AI_RATE_RULES.length);
  assert.equal(defaults.sharedRule?.limit, DEFAULT_AI_SHARED_RULE.limit);

  const tuned = readRateLimitConfig({ AI_RATE_LIMIT_PER_MINUTE: "3" }, { AI_RATE_LIMIT_PER_HOUR: "0" });
  assert.equal(tuned.rules.find((rule) => rule.id === "1m")?.limit, 3);
  assert.equal(tuned.rules.find((rule) => rule.id === "1h"), undefined);

  assert.equal(readRateLimitConfig({ AI_RATE_LIMIT_SHARED_PER_DAY: "0" }, {}).sharedRule, null);
  // Garbage must not silently widen a limit — fall back to the default.
  assert.equal(readRateLimitConfig({ AI_RATE_LIMIT_PER_MINUTE: "abc" }, {}).rules[0].limit, MINUTE_RULE.limit);
  assert.equal(readRateLimitConfig({ AI_RATE_LIMIT_PER_MINUTE: "-5" }, {}).rules[0].limit, MINUTE_RULE.limit);
});
