"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  autoLayoutNodes,
  buildMarkdownLines,
  collectSubtreeIds,
  createCurvedRibbon,
  createTreeBranchRibbons,
  depthOf,
  historyShortcutForKey,
  layoutTreeViewNodes,
  moveSiblingNode,
  nextNodeId,
  nodeBounds,
  pushHistory,
  reorderSiblingNodes,
  safeFilename,
  type HistoryState,
  type NodeItem,
} from "./lib/mindmap";
import { initialNodes } from "./lib/sampleMap";
import {
  clearCloudDraft,
  clearDraft,
  loadCloudDraft,
  loadDocumentTitle,
  loadDraft,
  saveCloudDraft,
  saveDocumentTitle,
  saveDraft,
} from "./lib/storage";
import { type AiSuggestion } from "./lib/ai";

const suggestionGroups: Record<string, { title: string; note: string }[][]> = {
  default: [
    [
      { title: "設計每週回顧", note: "固定 30 分鐘整理進展與下一步" },
      { title: "定義成功畫面", note: "寫下三個月後想看見的具體改變" },
      { title: "建立微小習慣", note: "把第一步縮小到兩分鐘就能開始" },
    ],
    [
      { title: "找出關鍵阻力", note: "列出最可能讓計畫停滯的三件事" },
      { title: "安排第一步", note: "選一個今天就能完成的最小行動" },
      { title: "建立支持系統", note: "找出可以提供資源或回饋的人" },
    ],
    [
      { title: "換成反向思考", note: "先問什麼做法一定會讓目標失敗" },
      { title: "設定檢查點", note: "為一週、一個月與一季設定觀察指標" },
      { title: "保留實驗空間", note: "選一個低風險方式測試新的可能" },
    ],
  ],
  身心健康: [
    [
      { title: "睡眠儀式", note: "睡前一小時降低光線與資訊刺激" },
      { title: "能量日誌", note: "記錄一週內提升與消耗能量的活動" },
      { title: "每週運動約會", note: "預先安排兩次喜歡的身體活動" },
    ],
    [
      { title: "數位休息區", note: "設定每天一段完全不看螢幕的時間" },
      { title: "恢復力清單", note: "整理五個能快速恢復精神的小行動" },
      { title: "健康環境設計", note: "讓水、好食物與運動用品更容易取得" },
    ],
  ],
  創意工作: [
    [
      { title: "靈感收件匣", note: "把碎片想法集中到單一入口" },
      { title: "無評判草稿", note: "先用 20 分鐘大量產出，再進行篩選" },
      { title: "跨域刺激", note: "每週從陌生領域帶回一個新觀點" },
    ],
    [
      { title: "創作時間盒", note: "安排不被會議打斷的 45 分鐘" },
      { title: "限制式挑戰", note: "刻意加上一個限制，逼出新的做法" },
      { title: "早期回饋", note: "在完成度 30% 時先找一人交流" },
    ],
  ],
};

export type Persistence =
  | { mode: "local" }
  | { mode: "cloud"; mapId: string; version: number; title: string; personal?: boolean };

type ServerMap = {
  id: string;
  title: string;
  nodes: NodeItem[];
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

type SyncState = "idle" | "saving" | "saved" | "offline" | "conflict" | "error";
type ViewMode = "canvas" | "tree" | "outline";

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;

const SYNC_LABEL: Record<SyncState, string> = {
  idle: "雲端共享",
  saving: "儲存中…",
  saved: "已同步",
  offline: "離線草稿",
  conflict: "版本衝突",
  error: "儲存失敗",
};

export default function MindMapStudio({
  initialNodes: startNodes,
  initialSelectedId,
  persistence,
}: {
  initialNodes: NodeItem[];
  initialSelectedId: number;
  persistence: Persistence;
}) {
  const isCloud = persistence.mode === "cloud";
  const [nodes, setNodes] = useState(startNodes);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [zoom, setZoom] = useState(100);
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const [suggestionRound, setSuggestionRound] = useState(0);
  const [persisted, setPersisted] = useState(false);
  const [sync, setSync] = useState<SyncState>("idle");
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [conflict, setConflict] = useState<ServerMap | null>(null);
  const [sharing, setSharing] = useState(false);
  const [documentTitle, setDocumentTitle] = useState(persistence.mode === "cloud" ? persistence.title : "我的理想生活");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());
  const [generatedSuggestions, setGeneratedSuggestions] = useState<AiSuggestion[] | null>(null);
  const [generatedForNodeId, setGeneratedForNodeId] = useState<number | null>(null);
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [stageOffset, setStageOffset] = useState({ x: 0, y: 0 });
  const [stagePan, setStagePan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [outlineDragId, setOutlineDragId] = useState<number | null>(null);
  const [outlineDropId, setOutlineDropId] = useState<number | null>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; before: HistoryState } | null>(null);
  const panDrag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const version = useRef(persistence.mode === "cloud" ? persistence.version : 1);
  const nodesRef = useRef(nodes);
  const selectedIdRef = useRef(selectedId);
  const documentTitleRef = useRef(documentTitle);
  const editRevision = useRef(0);
  const syncInFlight = useRef(false);
  const syncQueued = useRef(false);
  const needsCloudSync = useRef(false);
  const skipNextAutosave = useRef(false);
  useEffect(() => {
    nodesRef.current = nodes;
    selectedIdRef.current = selectedId;
    documentTitleRef.current = documentTitle;
  }, [documentTitle, nodes, selectedId]);
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const availableSuggestionGroups = suggestionGroups[selected.text] ?? suggestionGroups.default;
  const fallbackSuggestions = availableSuggestionGroups[suggestionRound % availableSuggestionGroups.length];
  const aiSuggestions: AiSuggestion[] = generatedForNodeId === selected.id && generatedSuggestions ? generatedSuggestions : fallbackSuggestions.map((item) => ({ ...item, sourceNodeIds: [selected.id] }));

  const visibleNodes = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return nodes.filter((node) => {
      let current = node.parent === null ? undefined : byId.get(node.parent);
      while (current) {
        if (collapsedIds.has(current.id)) return false;
        current = current.parent === null ? undefined : byId.get(current.parent);
      }
      return true;
    });
  }, [collapsedIds, nodes]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const treeNodes = useMemo(() => layoutTreeViewNodes(visibleNodes), [visibleNodes]);
  const displayNodes = viewMode === "tree" ? treeNodes : visibleNodes;
  const outlineNodes = useMemo(() => {
    const ordered: { node: NodeItem; depth: number }[] = [];
    const root = nodes.find((node) => node.parent === null);
    const append = (node: NodeItem, depth: number) => {
      ordered.push({ node, depth });
      if (collapsedIds.has(node.id)) return;
      nodes.filter((item) => item.parent === node.id).forEach((child) => append(child, depth + 1));
    };
    if (root) append(root, 0);
    return ordered;
  }, [collapsedIds, nodes]);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("zh-TW");

  const connections = useMemo(() => {
    if (viewMode === "tree") {
      return createTreeBranchRibbons(displayNodes).map((ribbon) => ({
        id: ribbon.id,
        path: ribbon.path,
        tone: ribbon.tone,
        kind: ribbon.kind,
      }));
    }
    const byId = new Map(displayNodes.map((node) => [node.id, node]));
    return displayNodes.flatMap((node) => {
      const parent = node.parent === null ? undefined : byId.get(node.parent);
      if (!parent || !visibleNodeIds.has(parent.id)) return [];
      const parentBox = nodeBounds(parent);
      const nodeBox = nodeBounds(node);
      const x1 = parent.x + parentBox.width / 2;
      const y1 = viewMode === "tree" ? parent.y : parent.y + parentBox.height / 2;
      const x2 = node.x + nodeBox.width / 2;
      const y2 = viewMode === "tree" ? node.y + nodeBox.height : node.y + nodeBox.height / 2;
      const depth = depthOf(nodes, node);
      const thickness = Math.max(4, 10 - (depth - 1) * 3);
      const curve = createCurvedRibbon(x1, y1, x2, y2, thickness, Math.max(1.2, thickness * .12), parent.id + node.id);
      return [{ id: `${parent.id}-${node.id}`, path: curve.path, tone: node.tone, kind: "branch" as const }];
    });
  }, [displayNodes, nodes, viewMode, visibleNodeIds]);

  function flashToast(message: string, ms = 1800) {
    setToast(message);
    window.setTimeout(() => setToast(""), ms);
  }

  async function saveToCloud() {
    if (persistence.mode !== "cloud") return;
    if (syncInFlight.current) {
      syncQueued.current = true;
      return;
    }

    const snapshot = {
      title: documentTitleRef.current,
      nodes: nodesRef.current,
      selectedId: selectedIdRef.current,
      baseVersion: version.current,
      revision: editRevision.current,
    };
    const protectedLocally = saveCloudDraft(
      persistence.mapId,
      snapshot.title,
      snapshot.nodes,
      snapshot.selectedId,
      snapshot.baseVersion,
    );
    needsCloudSync.current = true;
    if (!window.navigator.onLine) {
      setSync(protectedLocally ? "offline" : "error");
      return;
    }

    syncInFlight.current = true;
    syncQueued.current = false;
    setSync("saving");
    let saved = false;
    try {
      const response = await fetch(`/api/maps/${persistence.mapId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: snapshot.title,
          version: snapshot.baseVersion,
          nodes: snapshot.nodes,
        }),
      });
      if (response.status === 409) {
        const data = (await response.json()) as { current: ServerMap | null };
        if (data.current) setConflict(data.current);
        setSync("conflict");
        return;
      }
      if (!response.ok) {
        setSync("error");
        return;
      }
      const data = (await response.json()) as { version: number };
      version.current = data.version;
      saved = true;
      if (editRevision.current === snapshot.revision) {
        clearCloudDraft(persistence.mapId);
        needsCloudSync.current = false;
        setDraftRecovered(false);
        setSync("saved");
      } else {
        syncQueued.current = true;
      }
    } catch {
      setSync("error");
    } finally {
      syncInFlight.current = false;
      const shouldSaveNewestRevision = saved && syncQueued.current;
      syncQueued.current = false;
      if (shouldSaveNewestRevision) void saveToCloud();
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect --
   * These two effects intentionally mirror external persistence state:
   * autosave exposes its pending status immediately, while localStorage must
   * restore after hydration so server and client markup stay deterministic. */
  // Debounced autosave. Skips until the initial restore has run so a freshly
  // loaded page never overwrites the source of truth on mount.
  useEffect(() => {
    if (!hydrated.current) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    if (persistence.mode === "cloud") {
      editRevision.current += 1;
      needsCloudSync.current = true;
      const protectedLocally = saveCloudDraft(
        persistence.mapId,
        documentTitle,
        nodes,
        selectedId,
        version.current,
      );
      setSync(protectedLocally ? window.navigator.onLine ? "saving" : "offline" : "error");
    } else {
      setSync("saving");
      setPersisted(false);
    }
    const delay = isCloud ? 800 : 400;
    saveTimer.current = window.setTimeout(() => {
      if (persistence.mode === "cloud") {
        void saveToCloud();
      } else {
        const saved = saveDraft(nodes, selectedId) && saveDocumentTitle(documentTitle);
        setPersisted(saved);
        setSync(saved ? "saved" : "error");
      }
    }, delay);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentTitle, nodes, selectedId]);

  // Local maps restore their regular draft. Cloud maps restore only a
  // previously unsynchronised, map-specific safety copy.
  useEffect(() => {
    if (persistence.mode === "local") {
      const draft = loadDraft();
      if (draft) {
        setNodes(draft.nodes);
        setSelectedId(draft.selectedId);
        setPersisted(true);
      }
      const savedTitle = loadDocumentTitle();
      if (savedTitle) setDocumentTitle(savedTitle);
    } else {
      const draft = loadCloudDraft(persistence.mapId);
      if (draft) {
        setNodes(draft.nodes);
        setSelectedId(draft.selectedId);
        setDocumentTitle(draft.title);
        version.current = draft.baseVersion;
        needsCloudSync.current = true;
        setDraftRecovered(true);
        setSync(window.navigator.onLine ? "error" : "offline");
      }
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (persistence.mode !== "cloud") return;
    const protectCurrentDraft = () => {
      if (!needsCloudSync.current) return;
      saveCloudDraft(
        persistence.mapId,
        documentTitleRef.current,
        nodesRef.current,
        selectedIdRef.current,
        version.current,
      );
    };
    const onOffline = () => {
      protectCurrentDraft();
      if (needsCloudSync.current) setSync("offline");
    };
    const onOnline = () => {
      if (needsCloudSync.current) void saveToCloud();
    };
    window.addEventListener("pagehide", protectCurrentDraft);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("pagehide", protectCurrentDraft);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
    // Event handlers read the latest editor state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistence]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function resetToSample() {
    if (!window.confirm("確定要清除目前草稿並回到預設範例嗎？此動作可以復原。")) return;
    checkpoint();
    setNodes(initialNodes);
    setSelectedId(1);
    clearDraft();
    flashToast("已重設為預設範例");
  }

  async function createSharedMap() {
    if (sharing) return;
    setSharing(true);
    flashToast("建立共享連結中…", 4000);
    try {
      const rootText = nodes.find((node) => node.parent === null)?.text ?? "共享心智圖";
      const response = await fetch("/api/maps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: documentTitle || rootText, nodes }),
      });
      if (!response.ok) {
        flashToast("建立失敗，請稍後再試", 2400);
        return;
      }
      const data = (await response.json()) as { id: string };
      window.location.href = `/m/${data.id}`;
    } catch {
      flashToast("建立失敗，請稍後再試", 2400);
    } finally {
      setSharing(false);
    }
  }

  function loadLatestFromConflict() {
    if (!conflict) return;
    const roots = conflict.nodes.filter((node) => node.parent === null);
    setNodes(conflict.nodes);
    setSelectedId(roots[0]?.id ?? conflict.nodes[0]?.id ?? 1);
    version.current = conflict.version;
    if (persistence.mode === "cloud") clearCloudDraft(persistence.mapId);
    needsCloudSync.current = false;
    skipNextAutosave.current = true;
    setDraftRecovered(false);
    setConflict(null);
    setSync("saved");
    flashToast("已載入最新版本");
  }

  async function overwriteConflict() {
    if (!conflict) return;
    version.current = conflict.version; // adopt server version as the new base
    setConflict(null);
    await saveToCloud();
  }

  function checkpoint() {
    setHistory((items) => pushHistory(items, { nodes, selectedId }));
    setFuture([]);
  }

  function addNode(parentId = selectedId, title = "新想法", note = "雙擊節點即可編輯") {
    checkpoint();
    const parent = nodes.find((node) => node.id === parentId) ?? nodes[0];
    const childCount = nodes.filter((node) => node.parent === parent.id).length;
    const nextId = nextNodeId(nodes);
    const tones: NodeItem["tone"][] = ["coral", "sage", "sun"];
    const next: NodeItem = {
      id: nextId, parent: parent.id, text: title, note,
      x: Math.max(20, Math.min(900, parent.x + (parent.x < 430 ? -210 : 210))),
      y: Math.max(20, Math.min(560, parent.y - 65 + childCount * 115)),
      tone: tones[childCount % tones.length],
    };
    setNodes((items) => [...items, next]);
    setSelectedId(nextId);
    flashToast(`已加入「${title}」`);
  }

  function addSiblingNode() {
    const parentId = selected.parent ?? selected.id;
    addNode(parentId);
  }

  function beginEdit(node: NodeItem) {
    setSelectedId(node.id);
    setEditingId(node.id);
    setEditText(node.text);
    setEditNote(node.note);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditNote("");
  }

  function saveInlineEdit() {
    const text = editText.trim();
    if (editingId === null || !text) return;
    checkpoint();
    setNodes((items) => items.map((item) => item.id === editingId ? { ...item, text, note: editNote.trim() } : item));
    setEditingId(null);
    flashToast("節點已更新");
  }

  function removeSelectedNode() {
    const target = nodes.find((node) => node.id === selectedId);
    if (!target || target.parent === null) {
      flashToast("中心節點不能移除");
      return;
    }
    checkpoint();
    const removedIds = collectSubtreeIds(nodes, target.id);
    setNodes((items) => items.filter((node) => !removedIds.has(node.id)));
    setSelectedId(target.parent);
    flashToast(removedIds.size > 1 ? `已移除「${target.text}」及 ${removedIds.size - 1} 個子節點` : `已移除「${target.text}」`, 2200);
  }

  function toggleCollapsed(id: number) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function addAiSuggestion(suggestion: AiSuggestion) {
    checkpoint();
    const parent = selected;
    const existingChildren = nodes.filter((node) => node.parent === parent.id).length;
    const tones: NodeItem["tone"][] = ["coral", "sage", "sun"];
    const created: NodeItem = {
      id: nextNodeId(nodes), parent: parent.id, text: suggestion.title, note: suggestion.note,
      x: Math.max(20, Math.min(900, parent.x + (parent.x < 430 ? -210 : 210))),
      y: Math.max(20, Math.min(560, parent.y - 65 + existingChildren * 115)),
      tone: tones[existingChildren % tones.length],
    };
    setNodes((items) => [...items, created]);
    setSelectedId(created.id);
    flashToast(`已加入「${suggestion.title}」`);
  }

  function fitNodesToView(items: NodeItem[], message = "已將心智圖調整至畫面中央", maximumZoom = MAX_ZOOM) {
    if (!items.length) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const bounds = items.map(nodeBounds);
    const minX = Math.min(...bounds.map((box) => box.x));
    const maxX = Math.max(...bounds.map((box) => box.x + box.width));
    const minY = Math.min(...bounds.map((box) => box.y));
    const maxY = Math.max(...bounds.map((box) => box.y + box.height));
    const nextZoom = rect
      ? Math.round(Math.max(MIN_ZOOM, Math.min(maximumZoom, Math.min((rect.width - 70) / Math.max(maxX - minX, 1), (rect.height - 90) / Math.max(maxY - minY, 1)) * 100)) / 10) * 10
      : 100;
    setZoom(nextZoom);
    setStageOffset({ x: 540 - (minX + maxX) / 2, y: 325 - (minY + maxY) / 2 });
    setStagePan({ x: 0, y: 0 });
    flashToast(message);
  }

  function fitToView() {
    fitNodesToView(displayNodes, viewMode === "tree" ? "已將整棵靈感樹調整至畫面中央" : undefined, viewMode === "tree" ? 110 : MAX_ZOOM);
  }

  function selectViewMode(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "outline") return;
    window.requestAnimationFrame(() => {
      fitNodesToView(mode === "tree" ? treeNodes : visibleNodes, mode === "tree" ? "已切換至樹狀檢視" : "已切換至心智圖檢視", mode === "tree" ? 110 : MAX_ZOOM);
    });
  }

  function applyAutoLayout(branchRootId?: number) {
    if (viewMode === "tree") {
      fitNodesToView(treeNodes, branchRootId === undefined ? "樹冠已依層級自動整理" : "分枝已依層級展開", 110);
      return;
    }
    const next = autoLayoutNodes(nodes, branchRootId);
    if (next === nodes) {
      flashToast("目前布局已經很整齊");
      return;
    }
    const branchRoot = branchRootId === undefined ? undefined : nodes.find((node) => node.id === branchRootId);
    checkpoint();
    setNodes(next);
    setViewMode("canvas");
    const nextVisible = next.filter((node) => visibleNodeIds.has(node.id));
    const message = branchRoot && branchRoot.parent !== null
      ? `已整理「${branchRoot.text}」分支，可復原`
      : "已整理整張圖，可復原";
    fitNodesToView(nextVisible, message);
  }

  function beginTitleEdit() {
    setTitleDraft(documentTitle);
    setTitleEditing(true);
  }

  function saveTitleEdit() {
    const nextTitle = titleDraft.trim().slice(0, 80);
    if (!nextTitle) return;
    setDocumentTitle(nextTitle);
    setTitleEditing(false);
    flashToast("標題已更新");
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [{ nodes, selectedId }, ...items].slice(0, 15));
    setNodes(previous.nodes);
    setHistory((items) => items.slice(0, -1));
    setSelectedId(previous.selectedId);
    flashToast("已復原上一步", 1600);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((items) => pushHistory(items, { nodes, selectedId }));
    setNodes(next.nodes);
    setSelectedId(next.selectedId);
    setFuture((items) => items.slice(1));
    flashToast("已重做上一步", 1600);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (panDrag.current) {
      setStagePan({
        x: panDrag.current.originX + event.clientX - panDrag.current.startX,
        y: panDrag.current.originY + event.clientY - panDrag.current.startY,
      });
      return;
    }
    if (!drag.current) return;
    const x = drag.current.originX + (event.clientX - drag.current.startX) * (100 / zoom);
    const y = drag.current.originY + (event.clientY - drag.current.startY) * (100 / zoom);
    // Ignore pure clicks/selection: only touch nodes + history once the position
    // actually changes, so plain selection never produces an undo checkpoint.
    if (x === drag.current.originX && y === drag.current.originY) return;
    drag.current.moved = true;
    setNodes((items) => items.map((item) => item.id === drag.current?.id ? { ...item, x, y } : item));
  }

  function beginCanvasPan(event: React.PointerEvent<HTMLDivElement>) {
    if (viewMode === "outline" || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".mind-node, .canvas-commandbar, .zoom-control")) return;
    panDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: stagePan.x, originY: stagePan.y };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endPointerInteraction(event: React.PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    // Record a single checkpoint on release, holding the pre-drag snapshot, but
    // only when the node was actually moved (not merely selected).
    if (active?.moved) {
      setHistory((items) => pushHistory(items, active.before));
      setFuture([]);
    }
    drag.current = null;
    if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null;
    setPanning(false);
  }

  function moveOutlineNode(nodeId: number, delta: -1 | 1) {
    const next = moveSiblingNode(nodes, nodeId, delta);
    if (next === nodes) {
      flashToast(delta < 0 ? "已是第一個同層節點" : "已是最後一個同層節點");
      return;
    }
    checkpoint();
    setNodes(next);
    setSelectedId(nodeId);
    flashToast(delta < 0 ? "節點已上移" : "節點已下移");
  }

  function dropOutlineNode(targetId: number) {
    if (outlineDragId === null) return;
    const next = reorderSiblingNodes(nodes, outlineDragId, targetId);
    if (next !== nodes) {
      checkpoint();
      setNodes(next);
      setSelectedId(outlineDragId);
      flashToast("大綱順序已更新");
    }
    setOutlineDragId(null);
    setOutlineDropId(null);
  }

  async function askAI() {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "diverge", prompt: prompt.trim(), focusNodeId: selected.id, contextNodeIds: [], nodes }),
      });
      const data = await response.json() as { summary?: string; suggestions?: AiSuggestion[]; error?: string };
      if (!response.ok || !data.summary || !data.suggestions) {
        setAiError(data.error || "AI 暫時無法回應，請稍後再試。");
        return;
      }
      setGeneratedSuggestions(data.suggestions);
      setGeneratedForNodeId(selected.id);
      setAiSummary(data.summary);
      setPrompt("");
      flashToast(`已產生 ${data.suggestions.length} 個 AI 建議`);
    } catch {
      setAiError("網路連線失敗，心智圖內容沒有被變更。請稍後重試。");
    } finally {
      setAiLoading(false);
    }
  }

  function downloadFile(parts: BlobPart[], type: string, extension: string) {
    const blob = new Blob(parts, { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(nodes.find((node) => node.parent === null)?.text ?? "心智圖")}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportMarkdown() {
    const lines = buildMarkdownLines(nodes, new Date().toLocaleString("zh-TW"));
    downloadFile(["﻿", lines.join("\n")], "text/markdown;charset=utf-8", "md");
    setExportOpen(false);
    flashToast("Markdown 已下載");
  }

  function makePdfFromJpeg(jpeg: Uint8Array, imageWidth: number, imageHeight: number) {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const offsets = [0];
    let length = 0;
    const push = (value: string | Uint8Array) => { const bytes = typeof value === "string" ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.length; };
    push(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10]));
    const object = (id: number, body: string | Uint8Array[]) => {
      offsets[id] = length;
      push(`${id} 0 obj\n`);
      if (typeof body === "string") push(body); else body.forEach(push);
      push("\nendobj\n");
    };
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    object(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
    object(4, [`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"] .map((part) => typeof part === "string" ? encoder.encode(part) : part));
    const content = "q\n842 0 0 595 0 0 cm\n/Im0 Do\nQ\n";
    object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
    const xref = length;
    push("xref\n0 6\n0000000000 65535 f \n");
    for (let id = 1; id <= 5; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return chunks;
  }

  async function renderMindMapCanvas() {
      await document.fonts?.ready;
      const width = 1684, height = 1190;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.fillStyle = "#f7f3ea"; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#211f1a"; ctx.fillRect(0, 0, width, 110);
      const exportNodes = viewMode === "tree" ? treeNodes : nodes;
      ctx.fillStyle = "#fffcf6"; ctx.font = "600 36px sans-serif"; ctx.fillText(viewMode === "tree" ? "靈感樹 · 樹狀檢視" : "靈感樹 · 心智圖", 58, 68);
      ctx.fillStyle = "#cfc9bd"; ctx.font = "20px sans-serif"; ctx.fillText(new Date().toLocaleDateString("zh-TW"), 1450, 66);
      const minX = Math.min(...exportNodes.map((node) => node.x));
      const maxX = Math.max(...exportNodes.map((node) => node.x + (node.tone === "ink" ? 204 : 180)));
      const minY = Math.min(...exportNodes.map((node) => node.y));
      const maxY = Math.max(...exportNodes.map((node) => node.y + (node.tone === "ink" ? 82 : 70)));
      const scale = Math.min(1500 / Math.max(maxX - minX, 1), 960 / Math.max(maxY - minY, 1), 1.65);
      const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
      const oy = 150 + (960 - (maxY - minY) * scale) / 2 - minY * scale;
      const exportRibbons = viewMode === "tree"
        ? createTreeBranchRibbons(exportNodes)
        : exportNodes.flatMap((node) => {
          const parent = exportNodes.find((item) => item.id === node.parent);
          if (!parent) return [];
          const parentBox = nodeBounds(parent), nodeBox = nodeBounds(node);
          const depth = depthOf(nodes, node);
          const startWidth = Math.max(4, 10 - (depth - 1) * 3);
          const curve = createCurvedRibbon(
            parent.x + parentBox.width / 2,
            parent.y + parentBox.height / 2,
            node.x + nodeBox.width / 2,
            node.y + nodeBox.height / 2,
            startWidth,
            Math.max(1.2, startWidth * .12),
            parent.id + node.id,
          );
          return [{ id: `branch-${parent.id}-${node.id}`, tone: node.tone, kind: "branch" as const, curve, path: curve.path }];
        });
      const point = (value: number[]) => [ox + value[0] * scale, oy + value[1] * scale];
      exportRibbons.forEach((ribbon) => {
        const color = ribbon.tone === "trunk" ? "#8b6b49" : ribbon.tone === "sage" ? "#7f9876" : ribbon.tone === "sun" ? "#d8ad44" : "#ed765f";
        const curve = ribbon.curve;
        const topStart = point(curve.top.start), topC1 = point(curve.top.c1), topC2 = point(curve.top.c2), topEnd = point(curve.top.end);
        const bottomStart = point(curve.bottom.start), bottomC1 = point(curve.bottom.c1), bottomC2 = point(curve.bottom.c2), bottomEnd = point(curve.bottom.end);
        ctx.fillStyle = color; ctx.globalAlpha = ribbon.kind === "trunk" ? .86 : .74; ctx.beginPath();
        ctx.moveTo(topStart[0], topStart[1]);
        ctx.bezierCurveTo(topC1[0], topC1[1], topC2[0], topC2[1], topEnd[0], topEnd[1]);
        ctx.lineTo(bottomEnd[0], bottomEnd[1]);
        ctx.bezierCurveTo(bottomC2[0], bottomC2[1], bottomC1[0], bottomC1[1], bottomStart[0], bottomStart[1]);
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      });
      exportNodes.forEach((node) => {
        const x = ox + node.x * scale, y = oy + node.y * scale;
        const w = (node.tone === "ink" ? 204 : 180) * scale, h = (node.tone === "ink" ? 82 : 70) * scale;
        ctx.fillStyle = node.tone === "ink" ? "#211f1a" : "#fffcf6";
        ctx.strokeStyle = node.tone === "sage" ? "#7f9876" : node.tone === "sun" ? "#d8ad44" : node.tone === "ink" ? "#211f1a" : "#ed765f";
        ctx.lineWidth = Math.max(3, 5 * scale); ctx.beginPath(); ctx.roundRect(x, y, w, h, 14 * scale); ctx.fill(); ctx.stroke();
        ctx.fillStyle = node.tone === "ink" ? "#ffffff" : "#211f1a"; ctx.font = `600 ${Math.max(15, 14 * scale)}px sans-serif`;
        ctx.fillText(node.text.slice(0, 18), x + 15 * scale, y + 29 * scale, w - 26 * scale);
        ctx.fillStyle = node.tone === "ink" ? "#cfc9bd" : "#746f65"; ctx.font = `${Math.max(11, 9.5 * scale)}px sans-serif`;
        ctx.fillText(node.note.slice(0, 26), x + 15 * scale, y + 51 * scale, w - 26 * scale);
      });
      return canvas;
  }

  async function exportPdf() {
    setExporting(true);
    setExportOpen(false);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    try {
      const canvas = await renderMindMapCanvas();
      const data = canvas.toDataURL("image/jpeg", .92).split(",")[1];
      const binary = atob(data); const jpeg = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) jpeg[i] = binary.charCodeAt(i);
      downloadFile(makePdfFromJpeg(jpeg, canvas.width, canvas.height), "application/pdf", "pdf");
      setToast("PDF 已下載");
    } catch {
      setToast("PDF 匯出失敗，請稍後再試");
    } finally {
      setExporting(false);
      window.setTimeout(() => setToast(""), 2200);
    }
  }

  async function exportPng() {
    setExporting(true);
    setExportOpen(false);
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    try {
      const canvas = await renderMindMapCanvas();
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG unavailable")), "image/png"));
      downloadFile([blob], "image/png", "png");
      setToast("PNG 已下載");
    } catch {
      setToast("PNG 匯出失敗，請稍後再試");
    } finally {
      setExporting(false);
      window.setTimeout(() => setToast(""), 2200);
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextEditing = Boolean(target?.closest("input, textarea, [contenteditable='true']"));
      if (!isTextEditing) {
        const historyShortcut = historyShortcutForKey(event);
        if (historyShortcut) {
          event.preventDefault();
          if (historyShortcut === "undo") undo(); else redo();
          return;
        }
      }
      if (target?.closest("input, textarea, button, [contenteditable='true']")) return;
      if (editingId !== null) {
        if (event.key === "Escape") cancelEdit();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        addSiblingNode();
      } else if (event.key === "Tab") {
        event.preventDefault();
        addNode(selected.id);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelectedNode();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Keyboard actions intentionally follow the latest selected node and map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, nodes, selectedId]);

  const statusLabel = isCloud
    ? sync === "idle" && persistence.personal ? "個人地圖" : SYNC_LABEL[sync]
    : sync === "saving" ? "儲存中…" : sync === "error" ? "儲存失敗" : persisted ? "已自動儲存" : "互動草稿";

  return (
    <main className={`app-shell ${conflict || (isCloud && (sync === "offline" || sync === "error")) ? "has-banner" : ""}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">靈</span><span>靈感樹</span><small>AI MIND STUDIO</small></div>
        <div className="document-title"><span className={`status-dot ${sync}`} />{titleEditing ? <input className="title-input" autoFocus value={titleDraft} maxLength={80} onChange={(event) => setTitleDraft(event.target.value)} onBlur={saveTitleEdit} onKeyDown={(event) => { if (event.key === "Enter") saveTitleEdit(); if (event.key === "Escape") setTitleEditing(false); }} aria-label="心智圖標題" /> : <button className="title-button" onClick={beginTitleEdit} aria-label={`修改標題：${documentTitle}`}>{documentTitle}<span aria-hidden="true">✎</span></button>} <span className="saved">{statusLabel}</span></div>
        <div className="top-actions">
          <Link className="workspace-link" href="/maps">我的地圖</Link>
          <div className="export-wrap">
            <button className="export-button" onClick={() => setExportOpen((open) => !open)} aria-haspopup="menu" aria-expanded={exportOpen} disabled={exporting}>{exporting ? "匯出中…" : "匯出"} <span>↓</span></button>
            {exportOpen && <div className="export-menu" role="menu">
              <button role="menuitem" onClick={exportMarkdown}><span className="file-icon">M↓</span><span><strong>Markdown</strong><small>保留節點階層與說明</small></span></button>
              <button role="menuitem" onClick={exportPdf}><span className="file-icon pdf">P↓</span><span><strong>PDF 文件</strong><small>輸出完整心智圖畫布</small></span></button>
              <button role="menuitem" onClick={exportPng}><span className="file-icon png">PNG</span><span><strong>PNG 圖形檔</strong><small>高解析度完整心智圖</small></span></button>
            </div>}
          </div>
          {isCloud ? (
            <button className="share-button" onClick={() => { navigator.clipboard?.writeText(location.href); flashToast(persistence.personal ? "地圖網址已複製" : "共享連結已複製"); }}>{persistence.personal ? "複製網址" : "複製連結"} <span>↗</span></button>
          ) : (
            <button className="share-button" onClick={createSharedMap} disabled={sharing}>{sharing ? "建立中…" : "建立共享連結"} <span>↗</span></button>
          )}
        </div>
      </header>

      {conflict && (
        <div className="conflict-banner" role="alert">
          <span>有人剛更新了這張圖{conflict.updatedBy ? `（${conflict.updatedBy}）` : ""}，你的變更尚未儲存。</span>
          <div className="conflict-actions">
            <button onClick={loadLatestFromConflict}>載入最新版</button>
            <button className="danger" onClick={overwriteConflict}>用我的版本覆蓋</button>
          </div>
        </div>
      )}

      {isCloud && (sync === "offline" || sync === "error") && (
        <div className={`sync-banner ${sync}`} role="status">
          <span>
            <strong>{sync === "offline" ? "目前離線" : draftRecovered ? "已復原未同步草稿" : "同步失敗"}</strong>
            {sync === "offline"
              ? "變更已安全保存在這台裝置，恢復連線後會自動重試。"
              : "變更已安全保存在這台裝置，可立即重新同步。"}
          </span>
          <button onClick={() => void saveToCloud()}>重新同步</button>
        </div>
      )}

      <section className="workspace">
        <nav className="toolrail" aria-label="心智圖工具">
          <button className="tool" onClick={() => addNode()} aria-label="在目前節點下新增節點" data-tooltip="新增節點">
            <span aria-hidden="true">＋</span>
          </button>
          <button className="tool danger" onClick={removeSelectedNode} aria-label="移除目前節點" data-tooltip="移除節點" disabled={selected.parent === null}>
            <span aria-hidden="true">−</span>
          </button>
          <span className="tool-divider" aria-hidden="true" />
          <button className="tool" onClick={undo} aria-label="復原上一步" data-tooltip="復原 · ⌘/Ctrl Z" disabled={!history.length}>
            <span aria-hidden="true">↶</span>
          </button>
          <button className="tool" onClick={redo} aria-label="重做上一步" data-tooltip="重做 · ⇧⌘Z/Ctrl Y" disabled={!future.length}>
            <span aria-hidden="true">↷</span>
          </button>
          <span className="tool-divider" aria-hidden="true" />
          <button className={`tool ${viewMode === "outline" ? "active" : ""}`} onClick={() => selectViewMode(viewMode === "outline" ? "canvas" : "outline")} aria-label={viewMode === "outline" ? "切換至心智圖模式" : "切換至大綱模式"} data-tooltip={viewMode === "outline" ? "切換至畫布" : "切換至大綱"}>
            <span aria-hidden="true">≡</span>
          </button>
          {!isCloud && <>
            <span className="tool-divider" aria-hidden="true" />
            <button className="tool" onClick={resetToSample} aria-label="清除草稿並重設為預設範例" data-tooltip="重設範例">
              <span aria-hidden="true">⟳</span>
            </button>
          </>}
        </nav>

        <div ref={canvasRef} className={`canvas ${viewMode === "outline" ? "outline-active" : ""} ${viewMode === "tree" ? "tree-active" : ""} ${panning ? "panning" : ""}`} onPointerDown={beginCanvasPan} onPointerMove={onPointerMove} onPointerUp={endPointerInteraction} onPointerCancel={endPointerInteraction}>
          <div className="canvas-commandbar">
            <div className="view-switch" role="group" aria-label="檢視模式"><button className={viewMode === "canvas" ? "active" : ""} onClick={() => selectViewMode("canvas")}>心智圖</button><button className={viewMode === "tree" ? "active" : ""} onClick={() => selectViewMode("tree")}>樹狀</button><button className={viewMode === "outline" ? "active" : ""} onClick={() => selectViewMode("outline")}>大綱</button></div>
            <label className="node-search"><span aria-hidden="true">⌕</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋節點" aria-label="搜尋節點" /></label>
            <button className="layout-button" data-testid="auto-layout-all" onClick={() => applyAutoLayout()}>智慧整理</button>
            <button className="fit-button" onClick={fitToView}>適合畫面</button>
          </div>
          {viewMode !== "outline" ? <>
          <div className="canvas-hint">{viewMode === "tree" ? "拖曳空白處平移 · 點選分枝 · 雙擊編輯" : "拖曳空白處平移 · 拖曳節點整理 · 雙擊編輯"}</div>
          <div className="map-stage" style={{ transform: `translate(${stageOffset.x + stagePan.x}px, ${stageOffset.y + stagePan.y}px) scale(${zoom / 100})` }}>
            <svg className="connections-layer" viewBox="0 0 1080 650" aria-hidden="true">
              {connections.map((line) => <path key={line.id} className={`connection ${line.kind} ${line.tone}`} d={line.path} />)}
            </svg>
            {displayNodes.map((node) => {
              const matchesSearch = normalizedSearch && `${node.text} ${node.note}`.toLocaleLowerCase("zh-TW").includes(normalizedSearch);
              const hasChildren = nodes.some((item) => item.parent === node.id);
              return (
              <article
                key={node.id}
                className={`mind-node ${node.tone} ${viewMode === "tree" ? "tree-node" : ""} ${viewMode === "tree" && !hasChildren ? "tree-leaf" : ""} ${node.id === selectedId ? "selected" : ""} ${matchesSearch ? "search-match" : ""}`}
                style={{ left: node.x, top: node.y }}
                onPointerDown={(event) => { if (editingId === node.id) return; event.stopPropagation(); setSelectedId(node.id); if (viewMode === "tree") return; drag.current = { id: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y, moved: false, before: { nodes, selectedId } }; event.currentTarget.setPointerCapture(event.pointerId); }}
                onDoubleClick={() => beginEdit(node)}
              >
                {editingId === node.id ? <div className="node-editor" onPointerDown={(event) => event.stopPropagation()}><input autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveInlineEdit(); if (event.key === "Escape") cancelEdit(); }} aria-label="節點標題" /><input value={editNote} onChange={(event) => setEditNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveInlineEdit(); if (event.key === "Escape") cancelEdit(); }} aria-label="節點說明" /><span><button onClick={saveInlineEdit}>儲存</button><button onClick={cancelEdit}>取消</button></span></div> : <div className="node-copy"><h3>{node.text}</h3><p>{node.note}</p></div>}
                {editingId !== node.id && <div className="node-actions"><button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); beginEdit(node); }} aria-label={`編輯${node.text}`}>✎</button>{hasChildren && <><button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleCollapsed(node.id); }} aria-label={`${collapsedIds.has(node.id) ? "展開" : "收合"}${node.text}`}>{collapsedIds.has(node.id) ? "▸" : "▾"}</button><button data-testid={`auto-layout-branch-${node.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); applyAutoLayout(node.id); }} aria-label={`智慧整理${node.text}分支`}>⌗</button></>}<button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addNode(node.id); }} aria-label={`在${node.text}下新增節點`}>＋</button></div>}
              </article>
            );})}
          </div>
          <div className="zoom-control"><button onClick={() => setZoom(Math.max(MIN_ZOOM, zoom - 10))} aria-label="縮小，最低 50%" title="縮小">−</button><span>{zoom}%</span><button onClick={() => setZoom(Math.min(MAX_ZOOM, zoom + 10))} aria-label="放大，最高 200%" title="放大">＋</button><button onClick={fitToView} aria-label="適合畫面" title="適合畫面">◎</button></div>
          </> : <div className="outline-view"><header><div><span>結構化大綱</span><small>拖曳同層項目排序；手機可使用上移／下移</small></div><strong>{outlineNodes.length} 個可見節點</strong></header><div className="outline-list">{outlineNodes.map(({ node, depth }) => {
            const hasChildren = nodes.some((item) => item.parent === node.id);
            const matchesSearch = normalizedSearch && `${node.text} ${node.note}`.toLocaleLowerCase("zh-TW").includes(normalizedSearch);
            const siblings = nodes.filter((item) => item.parent === node.parent);
            const siblingIndex = siblings.findIndex((item) => item.id === node.id);
            const draggable = node.parent !== null && editingId !== node.id;
            return <div
              className={`outline-row ${node.id === selectedId ? "selected" : ""} ${matchesSearch ? "search-match" : ""} ${outlineDragId === node.id ? "dragging" : ""} ${outlineDropId === node.id ? "drop-target" : ""}`}
              style={{ paddingLeft: 18 + depth * 28 }}
              key={node.id}
              draggable={draggable}
              onDragStart={(event) => { if (!draggable) return; setOutlineDragId(node.id); event.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(event) => { const source = nodes.find((item) => item.id === outlineDragId); if (source && source.parent === node.parent && source.id !== node.id) { event.preventDefault(); setOutlineDropId(node.id); } }}
              onDrop={(event) => { event.preventDefault(); dropOutlineNode(node.id); }}
              onDragEnd={() => { setOutlineDragId(null); setOutlineDropId(null); }}
            >
              <span className="outline-drag-handle" title={draggable ? "拖曳調整同層順序" : undefined} aria-hidden="true">⋮⋮</span>
              <button className="outline-collapse" onClick={() => hasChildren && toggleCollapsed(node.id)} aria-label={hasChildren ? `${collapsedIds.has(node.id) ? "展開" : "收合"}${node.text}` : undefined} disabled={!hasChildren}>{hasChildren ? collapsedIds.has(node.id) ? "▸" : "▾" : "·"}</button>
              {editingId === node.id ? <div className="outline-editor"><input autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} aria-label="節點標題" /><input value={editNote} onChange={(event) => setEditNote(event.target.value)} aria-label="節點說明" /><button onClick={saveInlineEdit}>儲存</button><button onClick={cancelEdit}>取消</button></div> : <button className="outline-copy" onClick={() => setSelectedId(node.id)} onDoubleClick={() => beginEdit(node)}><strong>{node.text}</strong><span>{node.note || "尚未加入說明"}</span></button>}
              {editingId !== node.id && <div className="outline-actions"><button onClick={() => beginEdit(node)}>編輯</button><button className="add-child-button" onClick={() => addNode(node.id)}>＋ 子節點</button><button className="reorder-button" onClick={() => moveOutlineNode(node.id, -1)} disabled={node.parent === null || siblingIndex <= 0} aria-label={`將${node.text}上移`}>↑</button><button className="reorder-button" onClick={() => moveOutlineNode(node.id, 1)} disabled={node.parent === null || siblingIndex === siblings.length - 1} aria-label={`將${node.text}下移`}>↓</button></div>}
            </div>;
          })}</div></div>}
        </div>

        {mobileAiOpen && <button className="ai-backdrop" aria-label="關閉 AI 思考夥伴" onClick={() => setMobileAiOpen(false)} />}
        <aside className={`ai-panel ${mobileAiOpen ? "mobile-open" : ""}`}>
          <button className="ai-header" onClick={() => setMobileAiOpen((open) => !open)} aria-expanded={mobileAiOpen}><div className="ai-orb">✦</div><div><span>一起想想</span><small>針對目前節點，給你下一步</small></div><span className="sheet-handle" aria-hidden="true">⌃</span></button>
          <div className="ai-content">
            <div className="focus-card"><span className={`focus-dot ${selected.tone}`} /><div><small>正在想</small><strong>{selected.text}</strong></div></div>
            <div className="simple-prompt"><label htmlFor="ai-prompt">你卡在哪裡？</label><div><textarea id="ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void askAI(); } }} placeholder="例如：我不知道該從哪一步開始" /><button onClick={() => void askAI()} aria-label="請 AI 一起想" disabled={aiLoading}>{aiLoading ? "想想中…" : "一起想"}</button></div><small>也可以留白，直接從目前節點延伸</small></div>
            <div className="suggestion-heading"><div><span className="spark">✦</span><strong>{generatedForNodeId === selected.id ? "可以這樣做" : "先從這裡開始"}</strong></div><button data-testid="rotate-suggestions" onClick={() => { setGeneratedSuggestions(null); setGeneratedForNodeId(null); setAiSummary(""); setAiError(""); setSuggestionRound((round) => round + 1); }}>換一組 ↻</button></div>
            {generatedForNodeId === selected.id && aiSummary && <p className="ai-summary">{aiSummary}</p>}
            {aiError && <div className="ai-error" role="alert"><span>{aiError}</span><button onClick={askAI}>重試</button></div>}
            <div className="suggestions" data-testid="ai-suggestions" aria-live="polite" key={`${selected.id}-${suggestionRound}`}>
              {aiSuggestions.map((suggestion) => <button className="suggestion" key={suggestion.title} onClick={() => addAiSuggestion(suggestion)}><div><strong>{suggestion.title}</strong><p>{suggestion.note}</p></div><span className="add-suggestion">＋</span></button>)}
            </div>
          </div>
        </aside>
      </section>
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
