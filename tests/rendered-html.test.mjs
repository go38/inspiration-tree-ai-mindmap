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
  assert.match(html, /搜尋節點/);
  assert.match(html, /切換至大綱模式/);
  assert.match(html, /適合畫面/);
  assert.match(html, /拖曳空白處平移/);
  assert.match(html, /預覽加入/);
  assert.match(html, /修改標題：我的理想生活/);

  // The starter loading skeleton must be gone.
  assert.doesNotMatch(html, /Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("source keeps the app a client component wired to the shared helpers", async () => {
  const [page, studio, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MindMapStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  // The home page is a thin client wrapper around the shared studio.
  assert.match(page, /^"use client";/);
  assert.match(page, /<MindMapStudio/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);

  // The studio holds the interaction logic and is wired to the pure helpers.
  assert.match(studio, /^"use client";/);
  assert.match(studio, /from "\.\/lib\/mindmap"/);
  assert.match(studio, /mobile-open/);
  assert.match(studio, /結構化大綱/);
  assert.match(studio, /moveOutlineNode/);
  assert.match(studio, /beginCanvasPan/);
  assert.match(studio, /const MIN_ZOOM = 50/);
  assert.match(studio, /const MAX_ZOOM = 200/);
  assert.match(studio, /data-tooltip="新增節點"/);
  assert.doesNotMatch(studio, /<span aria-hidden="true">＋<\/span><small>新增<\/small>/);
  assert.match(studio, /addSelectedSuggestions/);
  assert.match(studio, /saveDocumentTitle/);

  assert.match(layout, /lang="zh-Hant"/);
  assert.match(layout, /title:\s*"靈感樹/);
});
