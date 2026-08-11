import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Server-render the built worker and assert the real mind map app ships,
// not a placeholder skeleton.
async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("production hides the local large-map benchmark route", async () => {
  const response = await render("/performance-benchmark?nodes=500");
  assert.equal(response.status, 404);
});

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
  // Remove/duplicate/import moved into the "更多工具" menu in v0.28.1, which is
  // only rendered once opened, so the rail exposes its entry point instead.
  assert.match(html, /開啟更多工具/);
  assert.match(html, /搜尋節點/);
  // v0.29.0 cycles 心智圖 → 樹狀 → 大綱, so the initial label names 樹狀 as next.
  assert.match(html, /切換至樹狀模式/);
  assert.match(html, /智慧整理/);
  assert.match(html, /智慧整理打造理想生活分支/);
  assert.match(html, /移植身心健康分支/);
  assert.match(html, /適合畫面/);
  assert.match(html, /滾輪／雙指縮放/);
  assert.match(html, /想往哪個方向延伸？/);
  assert.match(html, /修改標題：我的理想生活/);

  // The starter loading skeleton must be gone.
  assert.doesNotMatch(html, /Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("source keeps the app a client component wired to the shared helpers", async () => {
  const [page, studio, layout, globals, workspacePage, workspaceClient, schema, suggestRoute, inbox, viewState, benchmarkPage, benchmarkScript, shareRoute, sharedAccessPage, mapRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MindMapStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/maps/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/maps/MapWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/suggest/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/inbox.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/viewState.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/performance-benchmark/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/performance-benchmark.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/api/maps/[id]/share/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/s/[token]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/maps/[id]/route.ts", import.meta.url), "utf8"),
  ]);

  // The home page is a thin client wrapper around the shared studio.
  assert.match(page, /^"use client";/);
  assert.match(page, /<MindMapStudio/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview|codex-preview/);

  // P0-15: search work is deferred, large outline traversals share indexes,
  // and the visual benchmark route can never be exposed in production.
  assert.match(studio, /useDeferredValue\(searchQuery\)/);
  assert.match(studio, /buildChildrenByParent\(nodes\)/);
  assert.match(studio, /findMatchingNodeIds\(searchIndex, deferredSearchQuery\)/);
  assert.match(benchmarkPage, /process\.env\.NODE_ENV === "production"\) notFound\(\)/);
  assert.match(benchmarkScript, /const SIZES = \[100, 300, 500\]/);
  assert.match(benchmarkScript, /INTERACTION_BUDGET_MS = 16/);

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
  assert.match(studio, /拖曳或方向鍵微調樹冠/);
  assert.match(studio, /autoLayoutNodes/);
  assert.match(studio, /applyAutoLayout/);
  assert.match(studio, /data-testid="auto-layout-all"/);
  assert.match(studio, /checkpoint\(\);\s+setNodes\(next\)/, "layout creates one undo checkpoint before applying positions");
  assert.match(studio, /checkpoint\(\);\s+const arranged = autoLayoutNodes\(moved\)/, "transplant creates one undo checkpoint before applying the structural layout");
  assert.match(studio, /const MIN_ZOOM = 10/);
  assert.match(studio, /const MAX_ZOOM = 200/);
  assert.match(studio, /calculateFitTransform/);
  assert.match(studio, /calculateAnchoredZoom/);
  assert.match(studio, /onCanvasWheel/);
  assert.match(studio, /onCanvasPointerMoveCapture/);
  assert.match(studio, /data-testid="mind-map-canvas"/);
  assert.match(studio, /滾輪／雙指縮放/);
  assert.match(studio, /level-\$\{visualLevel\}/);
  assert.match(studio, /data-testid=\{`collapse-branch-\$\{node\.id\}`\}/);
  assert.match(studio, /aria-expanded=\{!isCollapsed\}/);
  assert.match(studio, /saveMapViewState/);
  assert.match(viewState, /inspiration-tree:view-state:v1:/);
  assert.match(studio, /data-tooltip="新增節點"/);
  assert.match(studio, /viewMode === "canvas" \? "tree" : viewMode === "tree" \? "outline" : "canvas"/, "the rail view button cycles canvas, tree, and outline in order");
  assert.match(studio, /onClick=\{cycleViewMode\}/);
  assert.match(studio, /aria-label=\{`切換至\$\{nextViewLabel\}模式`\}/);
  assert.doesNotMatch(studio, /<span aria-hidden="true">＋<\/span><small>新增<\/small>/);
  assert.match(studio, /addAiSuggestion/);
  assert.match(studio, /addAllAiSuggestions/);
  assert.match(studio, /setSelectedId\(parent\.id\)/, "adding one AI suggestion keeps the source node selected so more suggestions remain available");
  assert.match(studio, /data-added=\{isAdded\}/);
  assert.match(studio, /已加入目前節點/);
  assert.match(studio, /applyExplanationToNode/);
  assert.match(studio, /data-testid="ai-expand-all"/);
  assert.match(studio, /data-testid="concept-explanation"/);
  assert.match(studio, /data-testid="apply-explanation-note"/);
  assert.match(globals, /\.ai-panel\s*\{[^}]*min-height:0[^}]*overflow:hidden/);
  assert.match(globals, /\.ai-content\s*\{[^}]*min-height:0[^}]*overflow-y:scroll[^}]*scrollbar-gutter:stable/);
  assert.match(globals, /\.ai-content::-webkit-scrollbar-thumb/);

  // P0-14 touch and accessibility convergence.
  // Every interactive role shares one focus indicator, and controls drawn on
  // ink backgrounds switch to the warm ring so it stays visible.
  assert.match(globals, /button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible,\[tabindex\]:focus-visible\s*\{[^}]*outline:3px solid var\(--focus-ring\)/);
  assert.match(globals, /\.mind-node\.ink:focus-visible[^{]*\{[^}]*outline-color:var\(--sun\)/);
  assert.match(globals, /\.mind-node:focus-visible\s*\{[^}]*outline:3px solid var\(--focus-ring\)/);
  assert.doesNotMatch(globals, /outline:3px solid rgba\(237,118,95,\.38\)/, "the low-contrast focus ring must not come back");

  // Touch pointers get 44px targets, including a floating node action row that
  // cannot fit inside a 152px detail card.
  const coarseBlock = globals.match(/@media \(pointer:coarse\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(coarseBlock, "a (pointer:coarse) block must exist");
  assert.match(coarseBlock, /\.mind-node \.node-actions button,\.mind-node\.level-detail \.node-actions button\s*\{[^}]*width:44px;\s*height:44px/);
  assert.match(coarseBlock, /\.mind-node:not\(\.selected\) \.node-actions\s*\{\s*display:none/);
  assert.match(coarseBlock, /\.view-switch button,\.fit-button,\.layout-button\s*\{[^}]*min-height:44px/);
  assert.match(coarseBlock, /\.outline-collapse\s*\{[^}]*width:44px;\s*height:44px/);
  assert.match(coarseBlock, /\.prompt-box button\s*\{[^}]*width:44px;\s*height:44px/);
  for (const smaller of coarseBlock.match(/(?:min-height|height|width):(\d+)px/g) ?? []) {
    assert.ok(Number(smaller.match(/(\d+)px/)[1]) >= 44, `${smaller} is below the 44px touch target floor`);
  }

  // A 200%-zoomed viewport is short: the shell minimums must fit inside it
  // rather than clipping panels out of reach.
  assert.match(globals, /\.app-shell\s*\{[^}]*height:100dvh;\s*min-height:480px/);
  assert.match(globals, /\.workspace\s*\{[^}]*height:calc\(100dvh - 76px\);\s*min-height:404px/);
  assert.match(globals, /\.toolrail\s*\{[^}]*overflow-y:auto/);
  const toolrailStart = studio.indexOf('<nav className="toolrail"');
  const toolrailEnd = studio.indexOf("</nav>", toolrailStart);
  const moreToolsPanel = studio.indexOf("{toolMenuOpen && <>");
  assert.ok(toolrailStart >= 0 && toolrailEnd > toolrailStart && moreToolsPanel > toolrailEnd, "the fixed more-tools panel must stay outside the scrollable toolrail so Safari does not clip it");
  // 1280x800 at 200% zoom is 640x400 CSS px, so nothing may demand more.
  for (const shellMinimum of globals.match(/\.app-shell[^{]*\{[^}]*min-height:(\d+)px/g) ?? []) {
    assert.ok(Number(shellMinimum.match(/min-height:(\d+)px/)[1]) <= 480, `${shellMinimum} is taller than a 200%-zoomed viewport`);
  }
  assert.doesNotMatch(globals, /min-height:680px|min-height:760px|min-height:604px|min-height:626px|min-height:556px/, "the pre-P0-14 shell minimums must not come back");

  // Dragging always has a pointer-free alternative.
  assert.match(studio, /nudgeVectorForKey\(event\.key, event\.shiftKey\)/);
  assert.match(studio, /nudgeSelectedNode\(nudge\)/);
  assert.match(studio, /target\?\.closest\("\.mind-node, \.canvas"\)/, "arrow keys must only take over inside the map");
  assert.match(studio, /if \(nudgeBurst\.current === null\) checkpoint\(\)/, "one undo entry per burst of arrow presses");
  assert.match(studio, /tabIndex=\{0\}/, "canvas nodes must be reachable by keyboard");
  assert.match(studio, /onFocus=\{\(event\) => \{ if \(event\.target !== event\.currentTarget\) return; setSelectedId\(node\.id\); keepNodeInView\(event\.currentTarget\); \}\}/);
  assert.match(studio, /function keepNodeInView/, "focused nodes must be panned out from behind the command bar and zoom controls");
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
  assert.match(studio, /onContextMenu=\{\(event\) => openAiContextMenu\(event, node\)\}/);
  assert.match(studio, /data-testid="ai-context-menu"/);
  assert.match(studio, /runAiAssistantCommand\(command\.id\)/);
  assert.match(studio, /aria-label=\{`對\$\{node\.text\}使用 AI Assistant`\}/);
  assert.match(studio, /data-testid="ai-map-dialog"/);
  assert.match(studio, /fetch\("\/api\/generate-map"/);
  assert.match(studio, /套用會取代目前地圖，但可復原一次/);
  assert.match(studio, /data-testid="knowledge-import-dialog"/);
  assert.match(studio, /fetch\("\/api\/knowledge-import"/);
  assert.match(studio, /PDF／網站／影音知識匯入/);
  assert.match(studio, /影音逐字稿/);
  assert.match(studio, /data-testid="share-access-dialog"/);
  assert.match(studio, /唯讀/);
  assert.match(studio, /可留言/);
  assert.match(studio, /可編輯/);
  assert.match(shareRoute, /eq\(mindMaps\.ownerEmail, ownerEmail\)/);
  assert.match(shareRoute, /regenerate/);
  assert.match(sharedAccessPage, /eq\(shareLinks\.active, true\)/);
  assert.match(mapRoute, /sharePermissionCanEdit/);
  assert.match(mapRoute, /status: 403/);
  assert.match(schema, /share_links/);

  // Read-only visitors must be blocked by native disabled state, not by CSS
  // alone: pointer-events:none still leaves buttons reachable with a keyboard.
  assert.doesNotMatch(studio, /<nav className="toolrail"[^>]*aria-disabled/);
  assert.doesNotMatch(globals, /\.read-only \.toolrail\s*\{[^}]*pointer-events:\s*none/);
  const studioLines = studio.split("\n");
  for (const label of [
    "在目前節點下新增節點",
    "使用 AI 自動產生心智圖",
    "開啟靈感收件匣",
  ]) {
    const line = studioLines.find((text) => text.includes("<button") && text.includes(label));
    assert.ok(line, `找不到工具列按鈕：${label}`);
    assert.match(line, /disabled={!canEdit}/, `${label} 在唯讀模式必須停用`);
  }
  // Mutating helpers guard themselves, since they are also reachable from node
  // cards, the inbox and keyboard shortcuts.
  assert.match(studio, /function addNode\([^)]*\)\s*{\s*\n\s*if \(!canEdit\) return;/);
  assert.match(studio, /function removeSelectedNode\(\)\s*{\s*\n\s*if \(!canEdit\) return;/);
});
