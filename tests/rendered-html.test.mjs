import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Server-render the built worker and assert the real mind map app ships,
// not a placeholder skeleton.
async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the mind map studio", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();

  // Document shell from app/layout.tsx.
  assert.match(html, /lang="zh-Hant"/);
  assert.match(html, /<title>[^<]*靈感樹[^<]*<\/title>/);

  // Brand + workspace chrome from app/page.tsx.
  assert.match(html, /AI MIND STUDIO/);
  assert.match(html, /AI 思考夥伴/);

  // Initial mind map content is prerendered (center + a first-level branch).
  assert.match(html, /打造理想生活/);
  assert.match(html, /身心健康/);

  // Core tools expose accessible names.
  assert.match(html, /在目前節點下新增節點/);
  assert.match(html, /移除目前節點/);

  // The starter loading skeleton must be gone.
  assert.doesNotMatch(html, /Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("source keeps the app a client component wired to the shared helpers", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /^"use client";/);
  assert.match(page, /from "\.\/lib\/mindmap"/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);

  assert.match(layout, /lang="zh-Hant"/);
  assert.match(layout, /title:\s*"靈感樹/);
});
