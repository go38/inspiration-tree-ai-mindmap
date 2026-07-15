// Module-customization hooks for `node --test`.
//
// The built worker bundle imports `cloudflare:workers` (via db/index.ts, pulled
// in by the API routes). Node's default ESM loader rejects the `cloudflare:`
// scheme, so we stub that one module with an empty ambient `env`. Rendering "/"
// never calls getDb(), so the stub is sufficient for the SSR test.

const STUB_SOURCE = "export const env = {};\nexport default {};\n";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: "stub:cloudflare-workers", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "stub:cloudflare-workers") {
    return { format: "module", shortCircuit: true, source: STUB_SOURCE };
  }
  return nextLoad(url, context);
}
