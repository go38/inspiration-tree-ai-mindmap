// Pure rate-limit policy for the AI routes. No Workers/DB imports, so the
// rules, bucket keys and the exceeded/retry-after decision are unit-testable.
//
// The AI routes spend a real API key on every call and the site is publicly
// reachable, so the limits exist to cap spend, not to shape traffic. Three
// per-caller windows catch a burst, a busy hour and a runaway day; one shared
// window caps what the whole deployment can spend in a day, which is the only
// rule an attacker rotating IP addresses cannot walk around.

export type RateRule = {
  /** Short id; part of the bucket key, so changing it starts a fresh window. */
  id: string;
  limit: number;
  windowSeconds: number;
};

export const DEFAULT_AI_RATE_RULES: RateRule[] = [
  { id: "1m", limit: 10, windowSeconds: 60 },
  { id: "1h", limit: 60, windowSeconds: 3_600 },
  { id: "1d", limit: 200, windowSeconds: 86_400 },
];

export const DEFAULT_AI_SHARED_RULE: RateRule = { id: "shared-1d", limit: 1_000, windowSeconds: 86_400 };

export type RateLimitConfig = { rules: RateRule[]; sharedRule: RateRule | null };

/** A non-negative integer override, or null when unset/invalid. `0` disables. */
function readLimit(
  workerEnv: Record<string, string | undefined>,
  nodeEnv: Record<string, string | undefined>,
  name: string,
): number | null {
  const raw = workerEnv[name] ?? nodeEnv[name];
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * Reads AI_RATE_LIMIT_* overrides. Any rule set to `0` is dropped, which is how
 * a deployment turns a window (or all of them) off.
 */
export function readRateLimitConfig(
  workerEnv: Record<string, string | undefined>,
  nodeEnv: Record<string, string | undefined>,
): RateLimitConfig {
  const overrides: Record<string, string> = {
    "1m": "AI_RATE_LIMIT_PER_MINUTE",
    "1h": "AI_RATE_LIMIT_PER_HOUR",
    "1d": "AI_RATE_LIMIT_PER_DAY",
  };
  const rules = DEFAULT_AI_RATE_RULES.map((rule) => {
    const limit = readLimit(workerEnv, nodeEnv, overrides[rule.id]);
    return limit === null ? rule : { ...rule, limit };
  }).filter((rule) => rule.limit > 0);

  const sharedLimit = readLimit(workerEnv, nodeEnv, "AI_RATE_LIMIT_SHARED_PER_DAY");
  const shared = sharedLimit === null ? DEFAULT_AI_SHARED_RULE : { ...DEFAULT_AI_SHARED_RULE, limit: sharedLimit };
  return { rules, sharedRule: shared.limit > 0 ? shared : null };
}

/**
 * Who the request is counted against. The Cloudflare-set client IP comes first:
 * the identity header is injected by the host and cannot be verified here, so
 * counting by email alone would let a caller mint a fresh quota per request.
 */
export function rateLimitIdentity(headers: Headers): string {
  const ip = headers.get("cf-connecting-ip")?.trim();
  if (ip) return `ip:${ip}`;
  const email = headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) return `user:${email}`;
  return "anon";
}

/** Start of the fixed window containing `nowMs`, in unix seconds. */
export function windowStart(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / 1000 / windowSeconds) * windowSeconds;
}

export function bucketKey(scope: string, identity: string, rule: RateRule): string {
  return `${scope}|${rule.id}|${identity}`;
}

export type RateCount = { rule: RateRule; count: number; windowStart: number };

/** The first rule the caller has gone past, or null when all are within budget. */
export function exceededRule(counts: RateCount[]): RateCount | null {
  return counts.find((entry) => entry.count > entry.rule.limit) ?? null;
}

/** Seconds until the exceeded window rolls over, always at least 1. */
export function retryAfterSeconds(entry: RateCount, nowMs: number): number {
  const resetAt = (entry.windowStart + entry.rule.windowSeconds) * 1000;
  return Math.max(1, Math.ceil((resetAt - nowMs) / 1000));
}

/** Wording shown to the user; the shared window needs a different explanation. */
export function rateLimitMessage(entry: RateCount): string {
  if (entry.rule.id === DEFAULT_AI_SHARED_RULE.id) {
    return "今天的 AI 用量已達整體上限，請明天再試或請管理者調高額度。";
  }
  if (entry.rule.windowSeconds <= 60) return "AI 請求太密集，請稍等一下再試。";
  if (entry.rule.windowSeconds <= 3_600) return "這一小時的 AI 用量已達上限，請稍後再試。";
  return "今天的 AI 用量已達上限，請明天再試。";
}
