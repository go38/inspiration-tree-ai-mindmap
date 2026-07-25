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
  assert.match(html, /AI 思考助手/);
  assert.match(html, /自動擴寫/);
  assert.match(html, /概念解讀/);
  assert.match(html, /靈感收件匣/);
  assert.match(html, /AI 幫我想/);
  assert.match(html, /要種到哪個分支？/);
  assert.match(html, /我的地圖/);

  // Initial mind map content is prerendered (center + a first-level branch).
  assert.match(html, /打造理想生活/);
  assert.match(html, /身心健康/);

  // Core tools expose accessible names.
  assert.match(html, /在目前節點下新增節點/);
  assert.match(html, /移除目前節點/);
  assert.match(html, /搜尋節點/);
  assert.match(html, /切換至大綱模式/);
  assert.match(html, /智慧整理/);
  assert.match(html, /智慧整理打造理想生活分支/);
  assert.match(html, /移植身心健康分支/);
  assert.match(html, /適合畫面/);
  assert.match(html, /拖曳空白處平移/);
  assert.match(html, /想往哪個方向延伸？/);
  assert.match(html, /修改標題：我的理想生活/);

  // The starter loading skeleton must be gone.
  assert.doesNotMatch(html, /Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("source keeps the app a client component wired to the shared helpers", async () => {
  const [page, studio, layout, workspacePage, workspaceClient, schema, suggestRoute, inbox] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MindMapStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/maps/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/maps/MapWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/suggest/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inbox.ts", import.meta.url), "utf8"),
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
  assert.match(studio, /reparentSubtree/);
  assert.match(studio, /indentOutlineNode/);
  assert.match(studio, /outdentOutlineNode/);
  assert.match(studio, /data-testid="transplant-dialog"/);
  assert.match(studio, /data-testid=\{`indent-node-\$\{node\.id\}`\}/);
  assert.match(studio, /beginCanvasPan/);
  assert.match(studio, /window\.requestAnimationFrame/);
  assert.match(studio, /applyTreeNodeOffsets/);
  assert.match(studio, /mode: viewMode === "tree" \? "tree" : "canvas"/);
  assert.match(studio, /拖曳節點微調樹冠/);
  assert.match(studio, /autoLayoutNodes/);
  assert.match(studio, /applyAutoLayout/);
  assert.match(studio, /data-testid="auto-layout-all"/);
  assert.match(studio, /checkpoint\(\);\s+setNodes\(next\)/, "layout creates one undo checkpoint before applying positions");
  assert.match(studio, /checkpoint\(\);\s+const arranged = autoLayoutNodes\(moved\)/, "transplant creates one undo checkpoint before applying the structural layout");
  assert.match(studio, /const MIN_ZOOM = 50/);
  assert.match(studio, /const MAX_ZOOM = 200/);
  assert.match(studio, /data-tooltip="新增節點"/);
  assert.doesNotMatch(studio, /<span aria-hidden="true">＋<\/span><small>新增<\/small>/);
  assert.match(studio, /addAiSuggestion/);
  assert.match(studio, /addAllAiSuggestions/);
  assert.match(studio, /applyExplanationToNode/);
  assert.match(studio, /data-testid="ai-expand-all"/);
  assert.match(studio, /data-testid="concept-explanation"/);
  assert.match(studio, /data-testid="apply-explanation-note"/);
  assert.doesNotMatch(studio, /AI_MODE_LABELS|多節點上下文|過去討論|預覽加入/);
  assert.match(studio, /saveDocumentTitle/);
  assert.match(studio, /href="\/maps"/);
  assert.match(studio, /data-testid="inspiration-inbox"/);
  assert.match(studio, /createSeedsFromLines/);
  assert.match(studio, /createSeedsFromSuggestions/);
  assert.match(studio, /mode:\s*"diverge"/);
  assert.match(studio, /plantInboxSeed/);
  assert.match(inbox, /inspiration-tree:inbox:v1:/);
  assert.match(inbox, /MAX_INBOX_SEEDS = 80/);

  // Drag history precision (P0): starting a drag captures a pre-drag snapshot
  // and defers the checkpoint; a plain node press no longer checkpoints on down.
  assert.match(studio, /moved: false,\s+before: viewMode === "canvas" \? \{ nodes, selectedId \} : undefined/);
  assert.match(studio, /active\?\.mode === "canvas" && active\.moved/);
  assert.doesNotMatch(studio, /stopPropagation\(\); checkpoint\(\); setSelectedId/);

  assert.match(layout, /lang="zh-Hant"/);
  assert.match(layout, /title:\s*"靈感樹/);

  // Personal workspace is identity-gated and supports the full P1-06 lifecycle.
  assert.match(workspacePage, /requireChatGPTUser\("\/maps"\)/);
  assert.match(workspacePage, /eq\(mindMaps\.ownerEmail, ownerEmail\)/);
  assert.match(workspaceClient, /建立地圖/);
  assert.match(workspaceClient, /重新命名/);
  assert.match(workspaceClient, /duplicateMap/);
  assert.match(workspaceClient, /搜尋個人地圖/);
  assert.match(workspaceClient, /已封存/);
  assert.match(workspaceClient, /sortWorkspaceMapsByRecent/);
  assert.match(schema, /ownerEmail:\s*text\("owner_email"\)/);
  assert.match(schema, /archivedAt:\s*text\("archived_at"\)/);
  assert.match(schema, /mind_maps_owner_updated_idx/);
  assert.match(suggestRoute, /EXPLANATION_RESPONSE_SCHEMA/);
  assert.match(suggestRoute, /parseAiExplanationResponse/);
  assert.match(suggestRoute, /gpt-5\.6-luna/);
});
