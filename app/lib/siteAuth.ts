// HTTP Basic auth gate for the whole Worker, kept pure so the path rules and
// the credential comparison are unit-testable.
//
// This is the cheap alternative to Cloudflare Access for a site that a handful
// of people use: one password in a Worker secret, the browser's own login
// dialog, no identity provider and no dashboard setup. It exists to keep the AI
// routes (which spend a real API key) off the open internet.
//
// Share pages stay public — a link nobody can open is not a share link — and so
// do the static assets they need, otherwise the shared page renders without its
// JavaScript and CSS.

const PUBLIC_PREFIXES = ["/m/", "/s/", "/assets/", "/_vinext/image"];
const PUBLIC_PATHS = new Set(["/favicon.svg", "/file.svg", "/globe.svg", "/window.svg"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** The password half of an `Authorization: Basic` header, or null if absent/malformed. */
export function readBasicPassword(header: string | null): string | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null;
  try {
    const binary = atob(encoded.trim());
    // atob yields one char per byte; decode as UTF-8 so non-ASCII passwords work.
    const decoded = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    const separator = decoded.indexOf(":");
    return separator === -1 ? null : decoded.slice(separator + 1);
  } catch {
    return null;
  }
}

/** Length-independent comparison; the timing signal is worthless over the network anyway. */
export function secretsMatch(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/**
 * Returns the 401 to send back, or null to let the request through.
 * With no `SITE_PASSWORD` configured the gate is off, which is what keeps local
 * development and `npm run dev` working exactly as before.
 */
export function checkSiteAccess(request: Request, sitePassword: string | undefined): Response | null {
  if (!sitePassword) return null;
  const pathname = new URL(request.url).pathname;
  if (isPublicPath(pathname)) return null;
  const supplied = readBasicPassword(request.headers.get("authorization"));
  if (supplied !== null && secretsMatch(supplied, sitePassword)) return null;
  return new Response("需要密碼才能使用靈感樹工作室。", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="Inspiration Tree", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
