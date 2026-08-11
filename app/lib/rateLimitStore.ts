// D1-backed counters for the pure policy in ./rateLimit.ts.
//
// Every window is one upsert that returns the new count, so a check costs a
// single D1 round trip (all windows go out in one batch) and never needs a
// read-then-write race window. Deliberately fails closed: if the counters
// cannot be written we cannot bound spend, and an unmetered AI route on a
// public URL is the exact hole this closes.

import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { rateLimits } from "../../db/schema";
import {
  bucketKey,
  exceededRule,
  rateLimitIdentity,
  rateLimitMessage,
  readRateLimitConfig,
  retryAfterSeconds,
  windowStart,
  type RateCount,
  type RateRule,
} from "./rateLimit.ts";

/** Chance per request of sweeping rows whose window is long gone. */
const CLEANUP_PROBABILITY = 0.02;

type Check = { rule: RateRule; bucket: string };

function upsert(check: Check, nowMs: number) {
  const start = windowStart(nowMs, check.rule.windowSeconds);
  return getDb()
    .insert(rateLimits)
    .values({
      bucket: check.bucket,
      windowStart: start,
      count: 1,
      expiresAt: start + check.rule.windowSeconds,
    })
    .onConflictDoUpdate({
      target: rateLimits.bucket,
      set: {
        // Same window: keep counting. New window: start over at 1.
        count: sql`case when ${rateLimits.windowStart} = excluded.window_start then ${rateLimits.count} + 1 else 1 end`,
        windowStart: sql`excluded.window_start`,
        expiresAt: sql`excluded.expires_at`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
}

/**
 * Counts one request against every configured window.
 * Returns the window that was blown, or null when the request is within budget.
 */
export async function consumeRateLimit(request: Request, scope: string, nowMs = Date.now()): Promise<RateCount | null> {
  const workerEnv = env as unknown as Record<string, string | undefined>;
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  const config = readRateLimitConfig(workerEnv, nodeEnv);
  const identity = rateLimitIdentity(request.headers);
  const checks: Check[] = config.rules.map((rule) => ({ rule, bucket: bucketKey(scope, identity, rule) }));
  // The shared window is per deployment, not per route: one budget for the key.
  if (config.sharedRule) checks.push({ rule: config.sharedRule, bucket: bucketKey("ai", "*", config.sharedRule) });
  if (!checks.length) return null;

  const db = getDb();
  const statements = checks.map((check) => upsert(check, nowMs));
  const results = await db.batch(statements as [(typeof statements)[number], ...typeof statements]);
  const counts: RateCount[] = checks.map((check, index) => {
    const row = results[index]?.[0];
    return { rule: check.rule, count: row?.count ?? 1, windowStart: row?.windowStart ?? windowStart(nowMs, check.rule.windowSeconds) };
  });

  if (Math.random() < CLEANUP_PROBABILITY) {
    await db.delete(rateLimits).where(sql`${rateLimits.expiresAt} < ${Math.floor(nowMs / 1000)}`).catch(() => undefined);
  }
  return exceededRule(counts);
}

/**
 * Route guard: returns the response to send back, or null to continue.
 * `scope` separates the AI routes so a burst of one does not starve the others.
 */
export async function enforceAiRateLimit(request: Request, scope: string): Promise<Response | null> {
  const nowMs = Date.now();
  let exceeded: RateCount | null;
  try {
    exceeded = await consumeRateLimit(request, scope, nowMs);
  } catch (error) {
    console.error("[rate-limit]", error);
    return Response.json(
      { error: "AI 用量控管暫時無法運作，請稍後再試。", code: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503 },
    );
  }
  if (!exceeded) return null;

  const retryAfter = retryAfterSeconds(exceeded, nowMs);
  return Response.json(
    { error: rateLimitMessage(exceeded), code: "RATE_LIMITED", retryAfter },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}
