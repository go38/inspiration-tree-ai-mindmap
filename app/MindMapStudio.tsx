"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import {
  applyTreeNodeOffsets,
  autoLayoutNodes,
  buildChildrenByParent,
  buildDepthMap,
  buildMarkdownLines,
  buildNodeSearchIndex,
  calculateAnchoredZoom,
  calculateFitTransform,
  collectSubtreeIds,
  createCanvasBranchRibbons,
  createTreeBranchRibbons,
  depthOf,
  findMatchingNodeIds,
  historyShortcutForKey,
  indentOutlineNode,
  layoutTreeViewNodes,
  moveNodeBy,
  moveSiblingNode,
  nextNodeId,
  nodeBounds,
  nodeMetricsForDepth,
  nudgeVectorForKey,
  outdentOutlineNode,
  pushHistory,
  reparentSubtree,
  reorderSiblingNodes,
  safeFilename,
  visibleNodesForCollapsed,
  type HistoryState,
  type NodeItem,
  type TreeNodeOffsets,
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
import {
  AI_ASSISTANT_COMMANDS,
  type AiAssistantCommand,
  type AiExplanation,
  type AiMode,
  type AiSuggestion,
} from "./lib/ai";
import {
  createSeedsFromLines,
  createSeedsFromSuggestions,
  loadInboxSeeds,
  saveInboxSeeds,
  type InspirationSeed,
} from "./lib/inbox";
import { loadMapViewState, saveMapViewState } from "./lib/viewState";
import { parseMapImport, type ImportFormat, type ImportResult } from "./lib/importMap";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  resetPreferences,
  savePreferences,
  type UserPreferences,
} from "./lib/preferences";
import {
  BRANCH_TEMPLATES,
  TEMPLATE_CATEGORIES,
  applyBranchTemplate,
  duplicateBranch,
  filterBranchTemplates,
  type TemplateCategory,
} from "./lib/reuse";
import {
  AI_MAP_DETAIL_OPTIONS,
  materializeAiMapDraft,
  type AiMapDetail,
  type AiMapDraft,
} from "./lib/aiMap";
import { type KnowledgeSourceType } from "./lib/knowledgeImport";
import {
  sharePermissionLabel,
  type ShareLinkSummary,
  type SharePermission,
} from "./lib/shareAccess";

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
  | {
      mode: "cloud";
      mapId: string;
      version: number;
      title: string;
      personal?: boolean;
      access?: "owner" | SharePermission;
      shareToken?: string;
    };

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
type AiAssistantMode = "expand" | "explain";
type UtilityModal = "templates" | "import" | "preferences" | "generate-map" | "knowledge-import" | "share-access" | null;
type PointerPosition = { clientX: number; clientY: number };
type AiContextMenu = { x: number; y: number; nodeId: number };
type PinchGesture = {
  lastDistance: number;
  lastCenter: PointerPosition;
};
type NodeDrag = {
  id: number;
  pointerId: number;
  mode: "canvas" | "tree";
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
  before?: HistoryState;
};

const MIN_ZOOM = 10;
const MAX_ZOOM = 200;
// Arrow presses closer together than this stay inside one undo entry.
const NUDGE_BURST_MS = 700;
// Just past the .24s node position transition in globals.css.
const NUDGE_SETTLE_MS = 260;
const TREE_TONE_COLORS: Record<"trunk" | NodeItem["tone"], string> = {
  trunk: "#7a5635",
  ink: "#725035",
  coral: "#d8755e",
  sage: "#718c69",
  sun: "#c99d3e",
};

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
  const cloudAccess = persistence.mode === "cloud" ? persistence.access ?? "owner" : "owner";
  const canEdit = cloudAccess === "owner" || cloudAccess === "edit";
  const isOwner = cloudAccess === "owner";
  const [nodes, setNodes] = useState(startNodes);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [zoom, setZoom] = useState(100);
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  const [suggestionRound, setSuggestionRound] = useState(0);
  const [persisted, setPersisted] = useState(false);
  const [sync, setSync] = useState<SyncState>("idle");
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [conflict, setConflict] = useState<ServerMap | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLinkSummary | null>(null);
  const [sharePermission, setSharePermission] = useState<SharePermission>("view");
  const [shareActive, setShareActive] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [documentTitle, setDocumentTitle] = useState(persistence.mode === "cloud" ? persistence.title : "我的理想生活");
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  const [utilityModal, setUtilityModal] = useState<UtilityModal>(null);
  const [importSource, setImportSource] = useState("");
  const [importFormat, setImportFormat] = useState<ImportFormat>("auto");
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferencesDraft, setPreferencesDraft] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateCategory, setTemplateCategory] = useState<"全部" | TemplateCategory>("全部");
  const [previewTemplateId, setPreviewTemplateId] = useState(BRANCH_TEMPLATES.find((template) => template.featured)?.id ?? BRANCH_TEMPLATES[0]?.id ?? "");
  const [aiMapPrompt, setAiMapPrompt] = useState("");
  const [aiMapDetail, setAiMapDetail] = useState<AiMapDetail>("standard");
  const [aiMapDraft, setAiMapDraft] = useState<AiMapDraft | null>(null);
  const [aiMapLoading, setAiMapLoading] = useState(false);
  const [aiMapError, setAiMapError] = useState("");
  const [knowledgeSourceType, setKnowledgeSourceType] = useState<KnowledgeSourceType>("pdf");
  const [knowledgeUrl, setKnowledgeUrl] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeFilename, setKnowledgeFilename] = useState("");
  const [knowledgeFileData, setKnowledgeFileData] = useState("");
  const [knowledgeDraft, setKnowledgeDraft] = useState<AiMapDraft | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxDraft, setInboxDraft] = useState("");
  const [inboxSeeds, setInboxSeeds] = useState<InspirationSeed[]>([]);
  const [inboxTargetId, setInboxTargetId] = useState(initialSelectedId);
  const [inboxAiLoading, setInboxAiLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());
  const [aiMode, setAiMode] = useState<AiAssistantMode>("expand");
  const [aiContextMenu, setAiContextMenu] = useState<AiContextMenu | null>(null);
  const [activeAiCommand, setActiveAiCommand] = useState("");
  const [generatedSuggestions, setGeneratedSuggestions] = useState<AiSuggestion[] | null>(null);
  const [generatedForNodeId, setGeneratedForNodeId] = useState<number | null>(null);
  const [expansionSummary, setExpansionSummary] = useState("");
  const [aiExplanation, setAiExplanation] = useState<AiExplanation | null>(null);
  const [explanationForNodeId, setExplanationForNodeId] = useState<number | null>(null);
  const [explanationSummary, setExplanationSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [stageOffset, setStageOffset] = useState({ x: 0, y: 0 });
  const [stagePan, setStagePan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [treeOffsets, setTreeOffsets] = useState<TreeNodeOffsets>({});
  const [outlineDragId, setOutlineDragId] = useState<number | null>(null);
  const [outlineDropId, setOutlineDropId] = useState<number | null>(null);
  const [transplantingId, setTransplantingId] = useState<number | null>(null);
  const [transplantParentId, setTransplantParentId] = useState<number | null>(null);
  const drag = useRef<NodeDrag | null>(null);
  const panDrag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const pointerFrame = useRef<number | null>(null);
  const pendingPointer = useRef<PointerPosition | null>(null);
  const nudgeBurst = useRef<number | null>(null);
  const nudgeSettle = useRef<number | null>(null);
  const viewportFrame = useRef<number | null>(null);
  const pendingViewport = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const touchPointers = useRef<Map<number, PointerPosition>>(new Map());
  const pinchGesture = useRef<PinchGesture | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const commandBarRef = useRef<HTMLDivElement | null>(null);
  const zoomControlRef = useRef<HTMLDivElement | null>(null);
  const hydrated = useRef(false);
  const inboxHydrated = useRef(false);
  const skipNextViewStateSave = useRef(true);
  const saveTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const version = useRef(persistence.mode === "cloud" ? persistence.version : 1);
  const nodesRef = useRef(nodes);
  const selectedIdRef = useRef(selectedId);
  const documentTitleRef = useRef(documentTitle);
  const zoomRef = useRef(zoom);
  const stageOffsetRef = useRef(stageOffset);
  const stagePanRef = useRef(stagePan);
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
  useEffect(() => {
    zoomRef.current = zoom;
    stageOffsetRef.current = stageOffset;
    stagePanRef.current = stagePan;
  }, [stageOffset, stagePan, zoom]);
  // Preferences live in localStorage, which the server cannot read, so they can
  // only be applied after mount — a useState initializer here would render
  // different markup on the server and client and break hydration. React
  // batches these into a single re-render.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const saved = loadPreferences();
    setPreferences(saved);
    setPreferencesDraft(saved);
    setViewMode(saved.defaultView);
    setMobileAiOpen(saved.aiPanelOpen);
    setZoom(saved.zoom);
    /* eslint-enable react-hooks/set-state-in-effect */
    zoomRef.current = saved.zoom;
  }, []);
  useEffect(() => {
    if (!aiContextMenu) return;
    const close = () => setAiContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", close);
    };
  }, [aiContextMenu]);
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const inboxScope = persistence.mode === "cloud" ? persistence.mapId : "local";
  const viewStateScope = inboxScope;
  const inboxTarget = nodes.find((node) => node.id === inboxTargetId) ?? selected;
  const availableSuggestionGroups = suggestionGroups[selected.text] ?? suggestionGroups.default;
  const fallbackSuggestions = availableSuggestionGroups[suggestionRound % availableSuggestionGroups.length];
  const aiSuggestions: AiSuggestion[] = generatedForNodeId === selected.id && generatedSuggestions ? generatedSuggestions : fallbackSuggestions.map((item) => ({ ...item, sourceNodeIds: [selected.id] }));
  const generatedExpansion = generatedForNodeId === selected.id && generatedSuggestions ? generatedSuggestions : [];
  const existingChildTitles = new Set(nodes.filter((node) => node.parent === selected.id).map((node) => node.text.trim().toLocaleLowerCase("zh-TW")));
  const pendingExpansion = generatedExpansion.filter((suggestion) => !existingChildTitles.has(suggestion.title.trim().toLocaleLowerCase("zh-TW")));
  const visibleExplanation = explanationForNodeId === selected.id ? aiExplanation : null;
  const filteredTemplates = useMemo(
    () => filterBranchTemplates(BRANCH_TEMPLATES, templateQuery, templateCategory),
    [templateCategory, templateQuery],
  );
  const previewTemplate = BRANCH_TEMPLATES.find((template) => template.id === previewTemplateId)
    ?? filteredTemplates[0]
    ?? BRANCH_TEMPLATES[0];
  const generatedMapNodes = useMemo(
    () => aiMapDraft ? materializeAiMapDraft(aiMapDraft) : [],
    [aiMapDraft],
  );
  const knowledgeMapNodes = useMemo(
    () => knowledgeDraft ? materializeAiMapDraft(knowledgeDraft) : [],
    [knowledgeDraft],
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const childrenByParent = useMemo(() => buildChildrenByParent(nodes), [nodes]);
  const depthById = useMemo(() => buildDepthMap(nodes), [nodes]);
  const childCountById = useMemo(
    () => new Map([...childrenByParent].map(([id, children]) => [id, children.length])),
    [childrenByParent],
  );
  const visibleNodes = useMemo(
    () => visibleNodesForCollapsed(nodes, collapsedIds),
    [collapsedIds, nodes],
  );
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const baseTreeNodes = useMemo(
    () => viewMode === "tree" ? layoutTreeViewNodes(visibleNodes) : [],
    [viewMode, visibleNodes],
  );
  const treeNodes = useMemo(
    () => applyTreeNodeOffsets(baseTreeNodes, treeOffsets),
    [baseTreeNodes, treeOffsets],
  );
  const displayNodes = viewMode === "tree" ? treeNodes : visibleNodes;
  const outlineNodes = useMemo(() => {
    const ordered: { node: NodeItem; depth: number }[] = [];
    const root = nodes.find((node) => node.parent === null);
    const append = (node: NodeItem, depth: number) => {
      ordered.push({ node, depth });
      if (collapsedIds.has(node.id)) return;
      (childrenByParent.get(node.id) ?? []).forEach((child) => append(child, depth + 1));
    };
    if (root) append(root, 0);
    return ordered;
  }, [childrenByParent, collapsedIds, nodes]);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchIndex = useMemo(() => buildNodeSearchIndex(nodes), [nodes]);
  const searchMatchIds = useMemo(
    () => findMatchingNodeIds(searchIndex, deferredSearchQuery),
    [deferredSearchQuery, searchIndex],
  );
  const transplantingNode = transplantingId === null
    ? undefined
    : nodes.find((node) => node.id === transplantingId);
  const transplantCandidates = useMemo(() => {
    if (transplantingId === null) return [];
    const blockedIds = collectSubtreeIds(nodes, transplantingId);
    return nodes.filter((node) => !blockedIds.has(node.id));
  }, [nodes, transplantingId]);

  const connections = useMemo(() => {
    if (viewMode === "tree") {
      return createTreeBranchRibbons(displayNodes).map((ribbon) => ({
        id: ribbon.id,
        path: ribbon.path,
        centerPath: ribbon.centerPath,
        tone: ribbon.tone,
        kind: ribbon.kind,
        start: {
          x: (ribbon.curve.top.start[0] + ribbon.curve.bottom.start[0]) / 2,
          y: (ribbon.curve.top.start[1] + ribbon.curve.bottom.start[1]) / 2,
        },
        end: {
          x: (ribbon.curve.top.end[0] + ribbon.curve.bottom.end[0]) / 2,
          y: (ribbon.curve.top.end[1] + ribbon.curve.bottom.end[1]) / 2,
        },
      }));
    }
    return createCanvasBranchRibbons(displayNodes).map((ribbon) => ({
      id: ribbon.id,
      path: ribbon.path,
      centerPath: "",
      tone: ribbon.tone,
      kind: ribbon.kind,
      start: ribbon.start,
      end: ribbon.end,
    }));
  }, [displayNodes, viewMode]);

  function flashToast(message: string, ms = 1800) {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => {
      setToast("");
      toastTimer.current = null;
    }, ms);
  }

  async function saveToCloud() {
    if (persistence.mode !== "cloud" || !canEdit) return;
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
        headers: {
          "content-type": "application/json",
          ...(persistence.shareToken ? { "x-share-token": persistence.shareToken } : {}),
        },
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
    if (persistence.mode === "cloud" && canEdit) {
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
    } else if (persistence.mode === "local") {
      setSync("saving");
      setPersisted(false);
    }
    const delay = isCloud ? 800 : 400;
    saveTimer.current = window.setTimeout(() => {
      if (persistence.mode === "cloud" && canEdit) {
        void saveToCloud();
      } else if (persistence.mode === "local") {
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
    } else if (canEdit) {
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
  }, [canEdit]);

  useEffect(() => {
    setInboxSeeds(loadInboxSeeds(inboxScope));
    inboxHydrated.current = true;
  }, [inboxScope]);

  useEffect(() => {
    if (!inboxHydrated.current) return;
    saveInboxSeeds(inboxScope, inboxSeeds);
  }, [inboxScope, inboxSeeds]);

  useEffect(() => {
    skipNextViewStateSave.current = true;
    const saved = loadMapViewState(viewStateScope);
    setCollapsedIds(new Set(saved.collapsedIds));
  }, [viewStateScope]);

  useEffect(() => {
    if (skipNextViewStateSave.current) {
      skipNextViewStateSave.current = false;
      return;
    }
    saveMapViewState(viewStateScope, collapsedIds);
  }, [collapsedIds, viewStateScope]);

  useEffect(() => {
    const validIds = new Set(nodes.map((node) => node.id));
    const cleanedIds = [...collapsedIds].filter((id) => validIds.has(id));

    if (cleanedIds.length !== collapsedIds.size) {
      setCollapsedIds(new Set(cleanedIds));
    }
  }, [collapsedIds, nodes]);

  useEffect(() => {
    if (persistence.mode !== "cloud" || !canEdit) return;
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
  }, [canEdit, persistence]);

  useEffect(() => () => {
    if (pointerFrame.current !== null) window.cancelAnimationFrame(pointerFrame.current);
    if (viewportFrame.current !== null) window.cancelAnimationFrame(viewportFrame.current);
    if (nudgeBurst.current !== null) window.clearTimeout(nudgeBurst.current);
    if (nudgeSettle.current !== null) window.clearTimeout(nudgeSettle.current);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function resetToSample() {
    if (!window.confirm("確定要清除目前草稿並回到預設範例嗎？此動作可以復原。")) return;
    checkpoint();
    setNodes(initialNodes);
    setSelectedId(1);
    setTreeOffsets({});
    setCollapsedIds(new Set());
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
      if (response.status === 401) {
        window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent("/")}`);
        return;
      }
      if (!response.ok) {
        flashToast("建立失敗，請稍後再試", 2400);
        return;
      }
      const data = (await response.json()) as { id: string };
      window.location.assign(`/m/${data.id}`);
    } catch {
      flashToast("建立失敗，請稍後再試", 2400);
    } finally {
      setSharing(false);
    }
  }

  async function openShareAccess() {
    if (persistence.mode !== "cloud" || !isOwner) return;
    setShareLoading(true);
    setShareError("");
    setUtilityModal("share-access");
    try {
      const response = await fetch(`/api/maps/${persistence.mapId}/share`);
      const data = await response.json() as { share?: ShareLinkSummary | null; error?: string };
      if (!response.ok) {
        setShareError(data.error || "無法讀取分享設定");
        return;
      }
      setShareLink(data.share ?? null);
      setSharePermission(data.share?.permission ?? "view");
      setShareActive(data.share?.active ?? false);
    } catch {
      setShareError("網路連線失敗，請稍後再試。");
    } finally {
      setShareLoading(false);
    }
  }

  async function updateShareAccess(regenerate = false) {
    if (persistence.mode !== "cloud" || !isOwner || shareLoading) return;
    setShareLoading(true);
    setShareError("");
    try {
      const response = await fetch(`/api/maps/${persistence.mapId}/share`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: shareActive, permission: sharePermission, regenerate }),
      });
      const data = await response.json() as { share?: ShareLinkSummary; error?: string };
      if (!response.ok || !data.share) {
        setShareError(data.error || "無法更新分享設定");
        return;
      }
      setShareLink(data.share);
      setShareActive(data.share.active);
      setSharePermission(data.share.permission);
      flashToast(data.share.active ? `分享已開啟：${sharePermissionLabel(data.share.permission)}` : "分享已關閉");
    } catch {
      setShareError("網路連線失敗，分享設定未變更。");
    } finally {
      setShareLoading(false);
    }
  }

  function loadLatestFromConflict() {
    if (!conflict) return;
    const roots = conflict.nodes.filter((node) => node.parent === null);
    setNodes(conflict.nodes);
    setTreeOffsets({});
    setCollapsedIds(new Set());
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
    if (!canEdit) return;
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

  function duplicateSelectedBranch() {
    const result = duplicateBranch(nodes, selected.id);
    if (!result) {
      flashToast("中心節點不能複製，請先選擇一個分支");
      return;
    }
    checkpoint();
    setNodes(result.nodes);
    setSelectedId(result.rootId);
    flashToast(`已複製「${selected.text}」及完整子樹，可復原`, 2400);
  }

  function insertTemplate(templateId: string) {
    const template = BRANCH_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const result = applyBranchTemplate(nodes, selected.id, template);
    if (!result) return;
    checkpoint();
    setNodes(result.nodes);
    setSelectedId(result.rootId);
    setCollapsedIds((current) => {
      const next = new Set(current);
      next.delete(selected.id);
      return next;
    });
    setUtilityModal(null);
    flashToast(`已在「${selected.text}」套用${template.title}範本，可復原`, 2600);
  }

  function openAiMapGenerator() {
    setAiMapError("");
    setUtilityModal("generate-map");
  }

  async function generateAiMap() {
    if (aiMapLoading || aiMapPrompt.trim().length < 3) return;
    setAiMapLoading(true);
    setAiMapError("");
    setAiMapDraft(null);
    try {
      const response = await fetch("/api/generate-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: aiMapPrompt.trim(), detail: aiMapDetail }),
      });
      const data = await response.json() as { draft?: AiMapDraft; error?: string };
      if (!response.ok || !data.draft) {
        setAiMapError(data.error || "AI 暫時無法產生心智圖，請稍後再試。");
        return;
      }
      setAiMapDraft(data.draft);
      flashToast(`AI 已建立 ${data.draft.nodes.length} 個節點的草稿`);
    } catch {
      setAiMapError("網路連線失敗，目前地圖沒有被變更。");
    } finally {
      setAiMapLoading(false);
    }
  }

  function applyGeneratedMap() {
    if (!aiMapDraft || !generatedMapNodes.length) return;
    checkpoint();
    const root = generatedMapNodes.find((node) => node.parent === null) ?? generatedMapNodes[0];
    setNodes(generatedMapNodes);
    setSelectedId(root.id);
    setDocumentTitle(aiMapDraft.title);
    setTreeOffsets({});
    setCollapsedIds(new Set());
    setUtilityModal(null);
    flashToast(`已建立「${aiMapDraft.title}」，可復原`, 2600);
  }

  function openKnowledgeImport() {
    setKnowledgeError("");
    setUtilityModal("knowledge-import");
  }

  function readKnowledgeFile(file: File | undefined) {
    if (!file) return;
    setKnowledgeError("");
    setKnowledgeDraft(null);
    if (knowledgeSourceType === "pdf") {
      if (file.type !== "application/pdf" || file.size > 8_000_000) {
        setKnowledgeError("請選擇 8MB 以下的 PDF 文件。");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setKnowledgeFilename(file.name);
        setKnowledgeFileData(typeof reader.result === "string" ? reader.result : "");
      };
      reader.onerror = () => setKnowledgeError("PDF 讀取失敗，請重新選擇檔案。");
      reader.readAsDataURL(file);
      return;
    }
    void file.text().then((text) => {
      setKnowledgeFilename(file.name);
      setKnowledgeContent(text.slice(0, 80_000));
    });
  }

  async function generateKnowledgeMap() {
    if (knowledgeLoading) return;
    setKnowledgeLoading(true);
    setKnowledgeError("");
    setKnowledgeDraft(null);
    try {
      const response = await fetch("/api/knowledge-import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: knowledgeSourceType,
          url: knowledgeUrl.trim(),
          content: knowledgeContent.trim(),
          filename: knowledgeFilename,
          fileData: knowledgeFileData,
        }),
      });
      const data = await response.json() as { draft?: AiMapDraft; error?: string };
      if (!response.ok || !data.draft) {
        setKnowledgeError(data.error || "知識來源暫時無法整理。");
        return;
      }
      setKnowledgeDraft(data.draft);
      flashToast(`已從知識來源整理 ${data.draft.nodes.length} 個節點`);
    } catch {
      setKnowledgeError("網路連線失敗，目前地圖沒有被變更。");
    } finally {
      setKnowledgeLoading(false);
    }
  }

  function applyKnowledgeMap() {
    if (!knowledgeDraft || !knowledgeMapNodes.length) return;
    checkpoint();
    const root = knowledgeMapNodes.find((node) => node.parent === null) ?? knowledgeMapNodes[0];
    setNodes(knowledgeMapNodes);
    setSelectedId(root.id);
    setDocumentTitle(knowledgeDraft.title);
    setTreeOffsets({});
    setCollapsedIds(new Set());
    setUtilityModal(null);
    flashToast(`已從知識來源建立「${knowledgeDraft.title}」，可復原`, 2800);
  }

  function previewImport(source = importSource, format = importFormat) {
    const result = parseMapImport(source, format);
    setImportPreview(result);
    return result;
  }

  async function readImportFile(file: File | undefined) {
    if (!file) return;
    const source = await file.text();
    const format: ImportFormat = file.name.toLowerCase().endsWith(".json") ? "json" : file.name.toLowerCase().endsWith(".md") || file.name.toLowerCase().endsWith(".markdown") ? "markdown" : "auto";
    setImportSource(source);
    setImportFormat(format);
    previewImport(source, format);
  }

  function applyImport() {
    const result = importPreview?.ok ? importPreview : previewImport();
    if (!result.ok) return;
    checkpoint();
    setNodes(result.nodes);
    setSelectedId(result.nodes.find((node) => node.parent === null)?.id ?? result.nodes[0].id);
    setDocumentTitle(result.title);
    setCollapsedIds(new Set());
    setTreeOffsets({});
    setImportSource("");
    setImportPreview(null);
    setUtilityModal(null);
    flashToast(`已匯入 ${result.nodes.length} 個節點，可復原`, 2400);
  }

  function openPreferences() {
    setPreferencesDraft(preferences);
    setUtilityModal("preferences");
  }

  function applyPreferences(next = preferencesDraft) {
    if (!savePreferences(next)) {
      flashToast("偏好無法儲存，請檢查瀏覽器儲存空間");
      return;
    }
    setPreferences(next);
    setPreferencesDraft(next);
    setViewMode(next.defaultView);
    setMobileAiOpen(next.aiPanelOpen);
    setZoom(next.zoom);
    zoomRef.current = next.zoom;
    setUtilityModal(null);
    flashToast("使用者偏好已儲存");
  }

  function restoreDefaultPreferences() {
    const defaults = resetPreferences();
    setPreferences(defaults);
    setPreferencesDraft(defaults);
    setViewMode(defaults.defaultView);
    setMobileAiOpen(defaults.aiPanelOpen);
    setZoom(defaults.zoom);
    zoomRef.current = defaults.zoom;
    flashToast("偏好已重設");
  }

  function openInbox() {
    setInboxTargetId(selected.id);
    setInboxError("");
    setInboxOpen(true);
  }

  function captureInboxSeeds() {
    const created = createSeedsFromLines(inboxDraft, inboxSeeds);
    if (!created.length) {
      setInboxError(inboxDraft.trim() ? "這些想法已在收件匣中，或沒有可辨識的內容。" : "請先輸入一行或多行想法。");
      return;
    }
    setInboxSeeds((items) => [...items, ...created]);
    setInboxDraft("");
    setInboxError("");
    flashToast(`已收進 ${created.length} 顆靈感種子`);
  }

  async function brainstormInbox() {
    if (inboxAiLoading) return;
    setInboxAiLoading(true);
    setInboxError("");
    const direction = inboxDraft.trim().slice(0, 620);
    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "diverge",
          prompt: direction
            ? `請延伸以下零碎想法，提出適合先放進靈感收件匣、稍後再分類的不同方向：${direction}`
            : "請針對目前節點進行開放式腦力激盪，提出適合先放進靈感收件匣、稍後再分類的不同方向。",
          focusNodeId: selected.id,
          contextNodeIds: [],
          nodes,
        }),
      });
      const data = await response.json() as { suggestions?: AiSuggestion[]; error?: string };
      if (!response.ok || !data.suggestions?.length) {
        setInboxError(data.error || "AI 暫時沒有產生可用的靈感，請稍後再試。");
        return;
      }
      const created = createSeedsFromSuggestions(data.suggestions, inboxSeeds);
      if (!created.length) {
        setInboxError("AI 提供的想法已經在收件匣裡了，可以換個方向再試。");
        return;
      }
      setInboxSeeds((items) => [...items, ...created]);
      setInboxError("");
      flashToast(`AI 帶回 ${created.length} 顆新種子`);
    } catch {
      setInboxError("網路連線失敗，原有種子沒有被變更。請稍後再試。");
    } finally {
      setInboxAiLoading(false);
    }
  }

  function plantInboxSeed(seed: InspirationSeed) {
    const target = nodes.find((node) => node.id === inboxTarget.id) ?? selected;
    addNode(target.id, seed.title, seed.note || "從靈感收件匣種下的想法");
    setInboxSeeds((items) => items.filter((item) => item.id !== seed.id));
    setCollapsedIds((current) => {
      if (!current.has(target.id)) return current;
      const next = new Set(current);
      next.delete(target.id);
      return next;
    });
  }

  function removeInboxSeed(seedId: string) {
    setInboxSeeds((items) => items.filter((item) => item.id !== seedId));
    flashToast("種子已從收件匣移除");
  }

  function clearInbox() {
    if (!inboxSeeds.length || !window.confirm(`確定要清空 ${inboxSeeds.length} 顆尚未分類的種子嗎？`)) return;
    setInboxSeeds([]);
    flashToast("靈感收件匣已清空");
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
    if (!canEdit) return;
    const target = nodes.find((node) => node.id === selectedId);
    if (!target || target.parent === null) {
      flashToast("中心節點不能移除");
      return;
    }
    checkpoint();
    const removedIds = collectSubtreeIds(nodes, target.id);
    setNodes((items) => items.filter((node) => !removedIds.has(node.id)));
    setTreeOffsets((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => !removedIds.has(Number(id))),
    ));
    setCollapsedIds((current) => new Set([...current].filter((id) => !removedIds.has(id))));
    setSelectedId(target.parent);
    flashToast(removedIds.size > 1 ? `已移除「${target.text}」及 ${removedIds.size - 1} 個子節點` : `已移除「${target.text}」`, 2200);
  }

  function toggleCollapsed(id: number) {
    const isCollapsing = !collapsedIds.has(id);
    if (isCollapsing) {
      const hiddenSubtree = collectSubtreeIds(nodes, id);
      if (hiddenSubtree.has(selectedId)) setSelectedId(id);
    }
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function beginTransplant(node: NodeItem) {
    if (node.parent === null) return;
    const blockedIds = collectSubtreeIds(nodes, node.id);
    const alternative = nodes.find((candidate) => !blockedIds.has(candidate.id) && candidate.id !== node.parent);
    setTransplantingId(node.id);
    setTransplantParentId(alternative?.id ?? node.parent);
  }

  function closeTransplant() {
    setTransplantingId(null);
    setTransplantParentId(null);
  }

  function applyTransplant() {
    if (!transplantingNode || transplantParentId === null) return;
    const parent = nodes.find((node) => node.id === transplantParentId);
    const moved = reparentSubtree(nodes, transplantingNode.id, transplantParentId);
    if (!parent || moved === nodes) {
      flashToast("請選擇不同的安全位置");
      return;
    }
    checkpoint();
    const arranged = autoLayoutNodes(moved);
    setNodes(arranged);
    setSelectedId(transplantingNode.id);
    setCollapsedIds((current) => {
      if (!current.has(parent.id)) return current;
      const next = new Set(current);
      next.delete(parent.id);
      return next;
    });
    closeTransplant();
    const message = `已將「${transplantingNode.text}」移植到「${parent.text}」，可復原`;
    if (viewMode === "outline") {
      flashToast(message, 2400);
    } else {
      const nextDisplay = viewMode === "tree"
        ? applyTreeNodeOffsets(layoutTreeViewNodes(arranged), treeOffsets)
        : arranged;
      window.requestAnimationFrame(() => fitNodesToView(nextDisplay, message, viewMode === "tree" ? 110 : MAX_ZOOM, viewMode));
    }
  }

  function addAiSuggestion(suggestion: AiSuggestion) {
    const duplicate = nodes.some((node) => node.parent === selected.id && node.text.trim().toLocaleLowerCase("zh-TW") === suggestion.title.trim().toLocaleLowerCase("zh-TW"));
    if (duplicate) {
      flashToast(`「${suggestion.title}」已在這個分支中`);
      return;
    }
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
    setSelectedId(parent.id);
    flashToast(`已加入「${suggestion.title}」`);
  }

  function addAllAiSuggestions() {
    if (!pendingExpansion.length) {
      flashToast("這組擴寫已全部加入");
      return;
    }
    checkpoint();
    const parent = selected;
    const firstId = nextNodeId(nodes);
    const existingChildren = nodes.filter((node) => node.parent === parent.id).length;
    const tones: NodeItem["tone"][] = ["coral", "sage", "sun"];
    const created = pendingExpansion.map((suggestion, index): NodeItem => ({
      id: firstId + index,
      parent: parent.id,
      text: suggestion.title,
      note: suggestion.note,
      x: Math.max(20, Math.min(900, parent.x + (parent.x < 430 ? -210 : 210))),
      y: Math.max(20, Math.min(560, parent.y - 65 + (existingChildren + index) * 115)),
      tone: tones[(existingChildren + index) % tones.length],
    }));
    const arranged = autoLayoutNodes([...nodes, ...created]);
    setNodes(arranged);
    setSelectedId(parent.id);
    setCollapsedIds((current) => {
      if (!current.has(parent.id)) return current;
      const next = new Set(current);
      next.delete(parent.id);
      return next;
    });
    window.requestAnimationFrame(() => {
      if (viewMode === "outline") {
        flashToast(`AI 已擴寫 ${created.length} 個子節點，可復原`, 2400);
        return;
      }
      const nextDisplay = viewMode === "tree"
        ? applyTreeNodeOffsets(layoutTreeViewNodes(arranged), treeOffsets)
        : arranged;
      fitNodesToView(nextDisplay, `AI 已擴寫 ${created.length} 個子節點，可復原`, viewMode === "tree" ? 110 : MAX_ZOOM, viewMode);
    });
  }

  function applyExplanationToNode() {
    if (!visibleExplanation || !explanationSummary) return;
    checkpoint();
    setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, note: explanationSummary } : node));
    flashToast("概念解釋已設為節點說明，可復原", 2200);
  }

  function fitNodesToView(
    items: NodeItem[],
    message = "已將心智圖調整至畫面中央",
    maximumZoom = MAX_ZOOM,
    mode: ViewMode = viewMode,
  ) {
    if (!items.length) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const commandRect = commandBarRef.current?.getBoundingClientRect();
    const zoomRect = zoomControlRef.current?.getBoundingClientRect();
    const top = Math.max(24, commandRect ? commandRect.bottom - rect.top + 18 : 86);
    const mobileBottom = window.innerWidth <= 760 ? 86 : 24;
    const bottom = Math.max(
      mobileBottom,
      zoomRect ? rect.bottom - zoomRect.top + 16 : 70,
    );
    const root = items.find((node) => node.parent === null) ?? items[0];
    const fit = calculateFitTransform(
      items,
      root.id,
      { width: rect.width, height: rect.height, top, right: 24, bottom, left: 24 },
      {
        depthById: buildDepthMap(items),
        maximumZoom,
        minimumZoom: MIN_ZOOM,
        targetYRatio: mode === "tree" ? .82 : .5,
      },
    );
    zoomRef.current = fit.zoom;
    stageOffsetRef.current = fit.offset;
    stagePanRef.current = { x: 0, y: 0 };
    setZoom(fit.zoom);
    setStageOffset(fit.offset);
    setStagePan({ x: 0, y: 0 });
    flashToast(message);
  }

  function fitToView() {
    fitNodesToView(displayNodes, viewMode === "tree" ? "已將整棵靈感樹調整至畫面中央" : undefined, viewMode === "tree" ? 110 : MAX_ZOOM, viewMode);
  }

  function selectViewMode(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "outline") return;
    const nextDisplay = mode === "tree"
      ? applyTreeNodeOffsets(layoutTreeViewNodes(visibleNodes), treeOffsets)
      : visibleNodes;
    window.requestAnimationFrame(() => {
      fitNodesToView(nextDisplay, mode === "tree" ? "已切換至樹狀檢視" : "已切換至心智圖檢視", mode === "tree" ? 110 : MAX_ZOOM, mode);
    });
  }

  function cycleViewMode() {
    const nextMode: ViewMode = viewMode === "canvas" ? "tree" : viewMode === "tree" ? "outline" : "canvas";
    selectViewMode(nextMode);
  }

  function applyAutoLayout(branchRootId?: number) {
    if (viewMode === "tree") {
      const resetIds = branchRootId === undefined ? null : collectSubtreeIds(nodes, branchRootId);
      const nextOffsets = resetIds === null
        ? {}
        : Object.fromEntries(Object.entries(treeOffsets).filter(([id]) => !resetIds.has(Number(id))));
      setTreeOffsets(nextOffsets);
      fitNodesToView(
        applyTreeNodeOffsets(baseTreeNodes, nextOffsets),
        branchRootId === undefined ? "樹冠已依層級自動整理" : "分枝已依層級展開",
        110,
        "tree",
      );
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
    if (!canEdit) return;
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

  function applyPointerPosition(position: PointerPosition) {
    const activePan = panDrag.current;
    if (activePan) {
      const nextPan = {
        x: activePan.originX + position.clientX - activePan.startX,
        y: activePan.originY + position.clientY - activePan.startY,
      };
      stagePanRef.current = nextPan;
      setStagePan(nextPan);
      return;
    }
    const activeDrag = drag.current;
    if (!activeDrag) return;
    const deltaX = (position.clientX - activeDrag.startX) * (100 / zoom);
    const deltaY = (position.clientY - activeDrag.startY) * (100 / zoom);
    if (!activeDrag.moved && Math.hypot(deltaX, deltaY) < 3) return;
    const x = activeDrag.originX + deltaX;
    const y = activeDrag.originY + deltaY;
    activeDrag.moved = true;
    if (activeDrag.mode === "tree") {
      setTreeOffsets((current) => ({ ...current, [activeDrag.id]: { x, y } }));
      return;
    }
    setNodes((items) => items.map((item) => item.id === activeDrag.id ? { ...item, x, y } : item));
  }

  function flushPointerFrame(position?: PointerPosition) {
    if (pointerFrame.current !== null) {
      window.cancelAnimationFrame(pointerFrame.current);
      pointerFrame.current = null;
    }
    const next = position ?? pendingPointer.current;
    pendingPointer.current = null;
    if (next) applyPointerPosition(next);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!panDrag.current && !drag.current) return;
    pendingPointer.current = { clientX: event.clientX, clientY: event.clientY };
    if (pointerFrame.current !== null) return;
    pointerFrame.current = window.requestAnimationFrame(() => {
      pointerFrame.current = null;
      const next = pendingPointer.current;
      pendingPointer.current = null;
      if (next) applyPointerPosition(next);
    });
  }

  function queueViewportUpdate(nextZoom: number, nextPan: { x: number; y: number }) {
    const next = { zoom: nextZoom, pan: nextPan };
    pendingViewport.current = next;
    zoomRef.current = nextZoom;
    stagePanRef.current = nextPan;
    if (viewportFrame.current !== null) return;
    viewportFrame.current = window.requestAnimationFrame(() => {
      viewportFrame.current = null;
      const pending = pendingViewport.current;
      pendingViewport.current = null;
      if (!pending) return;
      setZoom(pending.zoom);
      setStagePan(pending.pan);
    });
  }

  function zoomAtClientPoint(
    nextZoom: number,
    anchor: PointerPosition,
    anchorShift = { x: 0, y: 0 },
  ) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || viewMode === "outline") return;
    const clampedZoom = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom)) * 10) / 10;
    if (clampedZoom === zoomRef.current && anchorShift.x === 0 && anchorShift.y === 0) return;
    const offset = stageOffsetRef.current;
    const pan = stagePanRef.current;
    const anchored = calculateAnchoredZoom(
      zoomRef.current,
      clampedZoom,
      { x: anchor.clientX, y: anchor.clientY },
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      { x: offset.x + pan.x, y: offset.y + pan.y },
    );
    const nextTotalOffset = {
      x: anchored.totalOffset.x + anchorShift.x,
      y: anchored.totalOffset.y + anchorShift.y,
    };
    queueViewportUpdate(clampedZoom, {
      x: nextTotalOffset.x - offset.x,
      y: nextTotalOffset.y - offset.y,
    });
  }

  function zoomFromControls(delta: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAtClientPoint(zoomRef.current + delta, {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
  }

  function onCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (viewMode === "outline") return;
    const target = event.target as HTMLElement;
    if (target.closest(".canvas-commandbar, .zoom-control, .node-editor")) return;
    event.preventDefault();
    const modeMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1;
    const pixelDelta = Math.max(-240, Math.min(240, event.deltaY * modeMultiplier));
    const nextZoom = zoomRef.current * Math.exp(-pixelDelta * .002);
    zoomAtClientPoint(nextZoom, { clientX: event.clientX, clientY: event.clientY });
  }

  function touchPair() {
    return [...touchPointers.current.values()].slice(0, 2);
  }

  function touchPairMetrics(points: PointerPosition[]) {
    const [first, second] = points;
    return {
      distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
      center: {
        clientX: (first.clientX + second.clientX) / 2,
        clientY: (first.clientY + second.clientY) / 2,
      },
    };
  }

  function onCanvasPointerDownCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || viewMode === "outline") return;
    touchPointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (touchPointers.current.size !== 2) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointerFrame.current !== null) window.cancelAnimationFrame(pointerFrame.current);
    pointerFrame.current = null;
    pendingPointer.current = null;
    const activeDrag = drag.current;
    if (activeDrag?.mode === "canvas" && activeDrag.moved && activeDrag.before) {
      setHistory((items) => pushHistory(items, activeDrag.before!));
      setFuture([]);
    }
    drag.current = null;
    panDrag.current = null;
    setDraggingId(null);
    setPanning(false);
    const metrics = touchPairMetrics(touchPair());
    pinchGesture.current = { lastDistance: metrics.distance, lastCenter: metrics.center };
  }

  function onCanvasPointerMoveCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !touchPointers.current.has(event.pointerId)) return;
    touchPointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    const gesture = pinchGesture.current;
    if (!gesture || touchPointers.current.size < 2) return;
    event.preventDefault();
    const metrics = touchPairMetrics(touchPair());
    if (gesture.lastDistance <= 0 || metrics.distance <= 0) return;
    const nextZoom = zoomRef.current * (metrics.distance / gesture.lastDistance);
    zoomAtClientPoint(
      nextZoom,
      gesture.lastCenter,
      {
        x: metrics.center.clientX - gesture.lastCenter.clientX,
        y: metrics.center.clientY - gesture.lastCenter.clientY,
      },
    );
    gesture.lastDistance = metrics.distance;
    gesture.lastCenter = metrics.center;
  }

  function onCanvasPointerEndCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    touchPointers.current.delete(event.pointerId);
    if (touchPointers.current.size < 2) pinchGesture.current = null;
  }

  function beginCanvasPan(event: React.PointerEvent<HTMLDivElement>) {
    if (viewMode === "outline" || event.button !== 0 || touchPointers.current.size > 1) return;
    const target = event.target as HTMLElement;
    if (target.closest(".mind-node, .canvas-commandbar, .zoom-control")) return;
    event.preventDefault();
    panDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: stagePan.x, originY: stagePan.y };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endPointerInteraction(event: React.PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (active?.pointerId === event.pointerId || panDrag.current?.pointerId === event.pointerId) {
      flushPointerFrame({ clientX: event.clientX, clientY: event.clientY });
    }
    // Record a single checkpoint on release, holding the pre-drag snapshot, but
    // only when a canvas node actually moved. Tree offsets are view-only.
    if (active?.mode === "canvas" && active.moved && active.before) {
      setHistory((items) => pushHistory(items, active.before));
      setFuture([]);
    }
    if (active?.pointerId === event.pointerId) {
      drag.current = null;
      setDraggingId(null);
    }
    if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null;
    setPanning(false);
  }

  function beginNodeDrag(event: React.PointerEvent<HTMLElement>, node: NodeItem) {
    if (editingId === node.id || event.button !== 0 || touchPointers.current.size > 1) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(node.id);
    const treeOffset = treeOffsets[node.id] ?? { x: 0, y: 0 };
    drag.current = {
      id: node.id,
      pointerId: event.pointerId,
      mode: viewMode === "tree" ? "tree" : "canvas",
      startX: event.clientX,
      startY: event.clientY,
      originX: viewMode === "tree" ? treeOffset.x : node.x,
      originY: viewMode === "tree" ? treeOffset.y : node.y,
      moved: false,
      before: viewMode === "canvas" ? { nodes, selectedId } : undefined,
    };
    setDraggingId(node.id);
    // preventDefault above suppresses the implicit focus, so take it explicitly:
    // arrow-key moves need the pressed node to actually hold focus.
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  /**
   * Pan just enough to keep a focused node inside the usable canvas.
   *
   * Tabbing through the map would otherwise land on nodes hidden behind the
   * command bar, the zoom controls, or the current pan offset.
   */
  function keepNodeInView(element: HTMLElement) {
    const canvas = canvasRef.current;
    if (!canvas || viewMode === "outline") return;
    const view = canvas.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const safeLeft = view.left + 16;
    const safeRight = view.right - 16;
    const safeTop = view.top + (commandBarRef.current?.offsetHeight ?? 38) + 26;
    const safeBottom = view.bottom - (zoomControlRef.current?.offsetHeight ?? 44) - 28;
    let dx = 0;
    let dy = 0;
    // Large nodes cannot fit entirely: align their leading edge instead.
    if (box.left < safeLeft) dx = safeLeft - box.left;
    else if (box.right > safeRight) dx = Math.max(safeRight - box.right, safeLeft - box.left);
    if (box.top < safeTop) dy = safeTop - box.top;
    else if (box.bottom > safeBottom) dy = Math.max(safeBottom - box.bottom, safeTop - box.top);
    if (dx === 0 && dy === 0) return;
    const pan = stagePanRef.current;
    queueViewportUpdate(zoomRef.current, { x: pan.x + dx, y: pan.y + dy });
  }

  /**
   * Keyboard alternative to dragging (P0-14): arrow keys move the selected node.
   *
   * Consecutive presses form one burst so a long move still costs a single undo
   * entry, exactly like releasing a pointer drag.
   */
  function nudgeSelectedNode(delta: { x: number; y: number }) {
    if (viewMode === "tree") {
      // Tree offsets are view-only, so they follow the drag rule of not
      // entering the undo history.
      setTreeOffsets((current) => {
        const offset = current[selectedId] ?? { x: 0, y: 0 };
        return { ...current, [selectedId]: { x: offset.x + delta.x, y: offset.y + delta.y } };
      });
    } else {
      if (nudgeBurst.current === null) checkpoint();
      else window.clearTimeout(nudgeBurst.current);
      nudgeBurst.current = window.setTimeout(() => { nudgeBurst.current = null; }, NUDGE_BURST_MS);
      setNodes((current) => moveNodeBy(current, selectedId, delta));
    }
    // Follow the node only once its position transition has settled, so the
    // measured rectangle is the final one.
    if (nudgeSettle.current !== null) window.clearTimeout(nudgeSettle.current);
    nudgeSettle.current = window.setTimeout(() => {
      nudgeSettle.current = null;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.classList.contains("mind-node")) keepNodeInView(focused);
    }, NUDGE_SETTLE_MS);
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

  function changeOutlineDepth(nodeId: number, direction: "indent" | "outdent") {
    const changed = direction === "indent"
      ? indentOutlineNode(nodes, nodeId)
      : outdentOutlineNode(nodes, nodeId);
    if (changed === nodes) {
      flashToast(direction === "indent" ? "前方沒有可縮排的同層節點" : "目前已是最外層分支");
      return;
    }
    checkpoint();
    const arranged = autoLayoutNodes(changed);
    const moved = arranged.find((node) => node.id === nodeId);
    setNodes(arranged);
    setSelectedId(nodeId);
    if (moved?.parent !== null && moved?.parent !== undefined) {
      setCollapsedIds((current) => {
        if (!current.has(moved.parent!)) return current;
        const next = new Set(current);
        next.delete(moved.parent!);
        return next;
      });
    }
    flashToast(direction === "indent" ? "分支已縮排並重新整理，可復原" : "分支已凸排並重新整理，可復原", 2200);
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

  async function requestAI(
    focusNode: NodeItem,
    requestedMode: AiMode,
    requestedPrompt: string,
    commandLabel = "",
  ) {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError("");
    setSelectedId(focusNode.id);
    setActiveAiCommand(commandLabel);
    setAiMode(requestedMode === "explain" ? "explain" : "expand");
    setMobileAiOpen(true);
    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: requestedMode, prompt: requestedPrompt.trim(), focusNodeId: focusNode.id, contextNodeIds: [], nodes }),
      });
      const data = await response.json() as { summary?: string; suggestions?: AiSuggestion[]; explanation?: AiExplanation; error?: string };
      if (!response.ok || !data.summary) {
        setAiError(data.error || "AI 暫時無法回應，請稍後再試。");
        return;
      }
      if (requestedMode !== "explain") {
        if (!data.suggestions?.length) {
          setAiError("AI 擴寫內容不完整，請再試一次。");
          return;
        }
        setGeneratedSuggestions(data.suggestions);
        setGeneratedForNodeId(focusNode.id);
        setExpansionSummary(data.summary);
        flashToast(`AI「${commandLabel || "展開想法"}」已準備 ${data.suggestions.length} 個結果`);
      } else {
        if (!data.explanation) {
          setAiError("AI 概念解釋不完整，請再試一次。");
          return;
        }
        setAiExplanation(data.explanation);
        setExplanationForNodeId(focusNode.id);
        setExplanationSummary(data.summary);
        flashToast(`AI 已完成「${commandLabel || "概念解讀"}」`);
      }
      setPrompt("");
    } catch {
      setAiError("網路連線失敗，心智圖內容沒有被變更。請稍後重試。");
    } finally {
      setAiLoading(false);
    }
  }

  async function askAI(requestedMode: AiAssistantMode = aiMode) {
    await requestAI(selected, requestedMode, prompt, requestedMode === "expand" ? "展開想法" : "概念解讀");
  }

  function openAiContextMenu(event: ReactMouseEvent, node: NodeItem) {
    event.preventDefault();
    event.stopPropagation();
    const width = 226;
    const height = 424;
    const targetRect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX || targetRect.right;
    const pointerY = event.clientY || targetRect.bottom;
    setSelectedId(node.id);
    setAiContextMenu({
      nodeId: node.id,
      x: Math.max(8, Math.min(pointerX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(pointerY, window.innerHeight - height - 8)),
    });
  }

  function runAiAssistantCommand(commandId: AiAssistantCommand) {
    const command = AI_ASSISTANT_COMMANDS.find((item) => item.id === commandId);
    const focusNode = aiContextMenu ? nodeById.get(aiContextMenu.nodeId) : selected;
    setAiContextMenu(null);
    if (!command || !focusNode) return;
    void requestAI(focusNode, command.mode, command.prompt, command.label);
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

  function exportJson() {
    downloadFile(
      [JSON.stringify({ version: 1, title: documentTitle, nodes }, null, 2)],
      "application/json;charset=utf-8",
      "json",
    );
    setExportOpen(false);
    flashToast("JSON 已下載");
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
      const exportDepths = buildDepthMap(exportNodes);
      const minX = Math.min(...exportNodes.map((node) => node.x));
      const maxX = Math.max(...exportNodes.map((node) => node.x + nodeBounds(node, exportDepths.get(node.id) ?? 1).width));
      const minY = Math.min(...exportNodes.map((node) => node.y));
      const maxY = Math.max(...exportNodes.map((node) => node.y + nodeBounds(node, exportDepths.get(node.id) ?? 1).height));
      const scale = Math.min(1500 / Math.max(maxX - minX, 1), 960 / Math.max(maxY - minY, 1), 1.65);
      const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
      const oy = 150 + (960 - (maxY - minY) * scale) / 2 - minY * scale;
      const exportRibbons = viewMode === "tree"
        ? createTreeBranchRibbons(exportNodes)
        : createCanvasBranchRibbons(exportNodes);
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
        const metrics = nodeMetricsForDepth(exportDepths.get(node.id) ?? 1);
        const w = metrics.width * scale, h = metrics.height * scale;
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
      if (event.key === "Escape" && transplantingId !== null) {
        event.preventDefault();
        closeTransplant();
        return;
      }
      const isTextEditing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      if (!canEdit && !isTextEditing) return;
      if (!isTextEditing) {
        const historyShortcut = historyShortcutForKey(event);
        if (historyShortcut) {
          event.preventDefault();
          if (historyShortcut === "undo") undo(); else redo();
          return;
        }
      }
      if (target?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      if (editingId !== null) {
        if (event.key === "Escape") cancelEdit();
        return;
      }
      // Arrow keys only take over inside the map, so page scrolling elsewhere
      // keeps working for keyboard users.
      const nudge = viewMode === "outline" ? null : nudgeVectorForKey(event.key, event.shiftKey);
      if (nudge && target?.closest(".mind-node, .canvas")) {
        event.preventDefault();
        nudgeSelectedNode(nudge);
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
  }, [canEdit, editingId, nodes, selectedId, transplantingId, viewMode]);

  const statusLabel = isCloud
    ? !isOwner ? sharePermissionLabel(cloudAccess as SharePermission) : sync === "idle" && persistence.personal ? "個人地圖" : SYNC_LABEL[sync]
    : sync === "saving" ? "儲存中…" : sync === "error" ? "儲存失敗" : persisted ? "已自動儲存" : "互動草稿";
  const nextViewLabel = viewMode === "canvas" ? "樹狀" : viewMode === "tree" ? "大綱" : "心智圖";

  return (
    <main className={`app-shell ${!isOwner ? "has-access-banner" : ""} ${!canEdit ? "read-only" : ""} ${preferences.reducedMotion ? "reduce-motion" : ""} ${conflict || (isCloud && (sync === "offline" || sync === "error")) ? "has-banner" : ""}`}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">靈</span><span>靈感樹</span><small>AI MIND STUDIO</small></div>
        <div className="document-title"><span className={`status-dot ${sync}`} />{titleEditing ? <input className="title-input" autoFocus value={titleDraft} maxLength={80} onChange={(event) => setTitleDraft(event.target.value)} onBlur={saveTitleEdit} onKeyDown={(event) => { if (event.key === "Enter") saveTitleEdit(); if (event.key === "Escape") setTitleEditing(false); }} aria-label="心智圖標題" /> : <button className="title-button" onClick={beginTitleEdit} disabled={!canEdit} aria-label={canEdit ? `修改標題：${documentTitle}` : `心智圖標題：${documentTitle}`}>{documentTitle}{canEdit && <span aria-hidden="true">✎</span>}</button>} <span className="saved">{statusLabel}</span></div>
        <div className="top-actions">
          <Link className="workspace-link" href="/maps">我的地圖</Link>
          <div className="export-wrap">
            <button className="export-button" onClick={() => setExportOpen((open) => !open)} aria-haspopup="menu" aria-expanded={exportOpen} disabled={exporting}>{exporting ? "匯出中…" : "匯出"} <span>↓</span></button>
            {exportOpen && <div className="export-menu" role="menu">
              <button role="menuitem" onClick={exportJson}><span className="file-icon">J↓</span><span><strong>JSON</strong><small>可再次匯入的完整地圖</small></span></button>
              <button role="menuitem" onClick={exportMarkdown}><span className="file-icon">M↓</span><span><strong>Markdown</strong><small>保留節點階層與說明</small></span></button>
              <button role="menuitem" onClick={exportPdf}><span className="file-icon pdf">P↓</span><span><strong>PDF 文件</strong><small>輸出完整心智圖畫布</small></span></button>
              <button role="menuitem" onClick={exportPng}><span className="file-icon png">PNG</span><span><strong>PNG 圖形檔</strong><small>高解析度完整心智圖</small></span></button>
            </div>}
          </div>
          {isCloud ? isOwner && persistence.personal ? (
            <button className="share-button" onClick={() => void openShareAccess()}>分享設定 <span>↗</span></button>
          ) : (
            <button className="share-button" onClick={() => { navigator.clipboard?.writeText(location.href); flashToast("共享連結已複製"); }}>複製連結 <span>↗</span></button>
          ) : (
            <button className="share-button" onClick={createSharedMap} disabled={sharing}>{sharing ? "建立中…" : "儲存至雲端"} <span>↗</span></button>
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

      {!isOwner && <div className={`access-banner ${cloudAccess}`} role="status"><strong>{sharePermissionLabel(cloudAccess as SharePermission)}</strong><span>{cloudAccess === "edit" ? "你可以修改這張地圖，所有變更會同步給其他訪客。" : cloudAccess === "comment" ? "留言功能將於下一階段開放；目前可瀏覽與匯出。" : "你可以瀏覽、搜尋與匯出，但不能修改內容。"}</span></div>}
      <section className="workspace">
        {/* aria-disabled is ignored on role=navigation, so read-only access is
            expressed with a native disabled state on each tool instead. */}
        <nav className="toolrail" aria-label="心智圖工具">
          <div className="toolrail-group">
            <button className="tool tool-primary" onClick={() => addNode()} aria-label="在目前節點下新增節點" data-tooltip="新增節點" disabled={!canEdit}>
              <span aria-hidden="true">＋</span>
            </button>
            <button className="tool ai-map-tool" onClick={openAiMapGenerator} aria-label="使用 AI 自動產生心智圖" data-tooltip="AI 自動產圖" disabled={!canEdit}>
              <span aria-hidden="true">✣</span>
            </button>
            <button className={`tool inbox-tool ${inboxOpen ? "active" : ""}`} onClick={openInbox} aria-label={`開啟靈感收件匣，目前有 ${inboxSeeds.length} 顆種子`} data-tooltip="靈感收件匣" disabled={!canEdit}>
              <span aria-hidden="true">⌑</span>
              {inboxSeeds.length > 0 && <small className="inbox-badge">{Math.min(inboxSeeds.length, 99)}</small>}
            </button>
          </div>
          <div className="toolrail-group toolrail-bottom">
            <div className="history-tools" aria-label="編輯紀錄">
              <button className="tool" onClick={undo} aria-label="復原上一步" data-tooltip="復原 · ⌘/Ctrl Z" disabled={!canEdit || !history.length}><span aria-hidden="true">↶</span></button>
              <button className="tool" onClick={redo} aria-label="重做上一步" data-tooltip="重做 · ⇧⌘Z/Ctrl Y" disabled={!canEdit || !future.length}><span aria-hidden="true">↷</span></button>
            </div>
            <button className={`tool ${viewMode !== "canvas" ? "active" : ""}`} onClick={cycleViewMode} aria-label={`切換至${nextViewLabel}模式`} data-tooltip={`下一個：${nextViewLabel}`}>
              <span aria-hidden="true">≡</span>
            </button>
            <button className={`tool ${toolMenuOpen ? "active" : ""}`} onClick={() => setToolMenuOpen((open) => !open)} aria-label="開啟更多工具" aria-haspopup="menu" aria-expanded={toolMenuOpen} data-tooltip="更多工具">
              <span aria-hidden="true">•••</span>
            </button>
          </div>
        </nav>

        {toolMenuOpen && <>
          <button className="tool-menu-backdrop" aria-label="關閉更多工具" onClick={() => setToolMenuOpen(false)} />
          <div className="tool-menu" role="menu" aria-label="更多工具">
            <header><strong>更多工具</strong><span>整理、匯入與設定</span></header>
            <div className="tool-menu-section">
              <button role="menuitem" onClick={() => { duplicateSelectedBranch(); setToolMenuOpen(false); }} disabled={!canEdit || selected.parent === null}><span>⧉</span><strong>複製分支</strong></button>
              <button role="menuitem" className="danger" onClick={() => { removeSelectedNode(); setToolMenuOpen(false); }} disabled={!canEdit || selected.parent === null}><span>−</span><strong>移除節點</strong></button>
              <button role="menuitem" onClick={() => { setUtilityModal("templates"); setToolMenuOpen(false); }} disabled={!canEdit}><span>▦</span><strong>分支範本</strong></button>
            </div>
            <div className="tool-menu-section">
              <button role="menuitem" onClick={() => { setImportPreview(null); setUtilityModal("import"); setToolMenuOpen(false); }} disabled={!canEdit}><span>⇩</span><strong>匯入內容</strong></button>
              <button role="menuitem" onClick={() => { openKnowledgeImport(); setToolMenuOpen(false); }} disabled={!canEdit}><span>◫</span><strong>知識匯入</strong></button>
              <button role="menuitem" onClick={() => { openPreferences(); setToolMenuOpen(false); }}><span>⚙</span><strong>使用者偏好</strong></button>
              {!isCloud && <button role="menuitem" onClick={() => { resetToSample(); setToolMenuOpen(false); }}><span>⟳</span><strong>重設範例</strong></button>}
            </div>
          </div>
        </>}

        {inboxOpen && <button className="inbox-backdrop" aria-label="關閉靈感收件匣" onClick={() => setInboxOpen(false)} />}
        <aside className={`inbox-drawer ${inboxOpen ? "open" : ""}`} aria-hidden={!inboxOpen} inert={!inboxOpen} data-testid="inspiration-inbox">
          <header className="inbox-header">
            <div className="inbox-mark" aria-hidden="true">種</div>
            <div><h2>靈感收件匣</h2><p>先收下，再決定要長在哪個分支</p></div>
            <button type="button" onClick={() => setInboxOpen(false)} aria-label="關閉靈感收件匣">×</button>
          </header>
          <div className="inbox-body">
            <section className="inbox-composer">
              <label htmlFor="inbox-draft">把零碎想法倒進來</label>
              <textarea
                id="inbox-draft"
                value={inboxDraft}
                onChange={(event) => setInboxDraft(event.target.value)}
                placeholder={"每行一個想法，例如：\n訪談三位使用者\n重新整理首頁文案\n找一個更簡單的名稱"}
              />
              <small>可貼上多行筆記；「標題｜補充」會自動拆成標題與說明。</small>
              <div className="inbox-compose-actions">
                <button type="button" className="ai" onClick={() => void brainstormInbox()} disabled={inboxAiLoading}>
                  <span aria-hidden="true">✦</span>{inboxAiLoading ? "AI 發想中…" : "AI 幫我想"}
                </button>
                <button type="button" className="primary" onClick={captureInboxSeeds}>收進來</button>
              </div>
            </section>
            {inboxError && <div className="inbox-error" role="alert">{inboxError}</div>}
            <section className="inbox-queue">
              <div className="inbox-queue-heading">
                <div><strong>等待分類</strong><span>{inboxSeeds.length} 顆種子</span></div>
                {inboxSeeds.length > 0 && <button type="button" onClick={clearInbox}>清空</button>}
              </div>
              <label className="inbox-target" htmlFor="inbox-target">
                <span>要種到哪個分支？</span>
                <select id="inbox-target" value={inboxTarget.id} onChange={(event) => setInboxTargetId(Number(event.target.value))}>
                  {nodes.map((node) => <option value={node.id} key={node.id}>{`${"　".repeat(depthOf(nodes, node))}${node.text}`}</option>)}
                </select>
              </label>
              {inboxSeeds.length > 0 ? <div className="seed-list" aria-live="polite">
                {inboxSeeds.map((seed) => <article className="seed-card" key={seed.id}>
                  <div className="seed-copy">
                    <span className={`seed-source ${seed.source}`}>{seed.source === "ai" ? "AI 靈感" : "快速記下"}</span>
                    <strong>{seed.title}</strong>
                    {seed.note && <p>{seed.note}</p>}
                  </div>
                  <div className="seed-actions">
                    <button type="button" className="plant" onClick={() => plantInboxSeed(seed)} aria-label={`將${seed.title}種到${inboxTarget.text}分支`}>種到分支 <span aria-hidden="true">→</span></button>
                    <button type="button" className="remove" onClick={() => removeInboxSeed(seed.id)} aria-label={`移除種子：${seed.title}`}>×</button>
                  </div>
                </article>)}
              </div> : <div className="inbox-empty">
                <span aria-hidden="true">⌑</span>
                <strong>這裡還沒有種子</strong>
                <p>先貼上幾行筆記，或請 AI 從目前節點帶回一些新方向。</p>
              </div>}
            </section>
          </div>
        </aside>

        <div
          ref={canvasRef}
          className={`canvas ${viewMode === "outline" ? "outline-active" : ""} ${viewMode === "tree" ? "tree-active" : ""} ${panning ? "panning" : ""} ${draggingId !== null ? "dragging-node" : ""}`}
          role="region"
          aria-label="心智圖畫布，可拖曳平移、使用滑鼠滾輪或雙指縮放；以 Tab 選取節點後，方向鍵可移動節點，按住 Shift 移動更多"
          data-testid="mind-map-canvas"
          onWheel={onCanvasWheel}
          onPointerDownCapture={onCanvasPointerDownCapture}
          onPointerMoveCapture={onCanvasPointerMoveCapture}
          onPointerUpCapture={onCanvasPointerEndCapture}
          onPointerCancelCapture={onCanvasPointerEndCapture}
          onPointerDown={beginCanvasPan}
          onPointerMove={onPointerMove}
          onPointerUp={endPointerInteraction}
          onPointerCancel={endPointerInteraction}
        >
          <div ref={commandBarRef} className="canvas-commandbar">
            <div className="view-switch" role="group" aria-label="檢視模式"><button className={viewMode === "canvas" ? "active" : ""} onClick={() => selectViewMode("canvas")}>心智圖</button><button className={viewMode === "tree" ? "active" : ""} onClick={() => selectViewMode("tree")}>樹狀</button><button className={viewMode === "outline" ? "active" : ""} onClick={() => selectViewMode("outline")}>大綱</button></div>
            <label className="node-search"><span aria-hidden="true">⌕</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋節點" aria-label="搜尋節點" /></label>
            <button className="layout-button" data-testid="auto-layout-all" onClick={() => applyAutoLayout()}>智慧整理</button>
            <button className="fit-button" onClick={fitToView}>適合畫面</button>
          </div>
          {viewMode !== "outline" ? <>
          <div className="canvas-hint">{viewMode === "tree" ? "拖曳平移 · 滾輪／雙指縮放 · 拖曳或方向鍵微調樹冠" : "拖曳平移 · 滾輪／雙指縮放 · 拖曳或方向鍵移動節點"}</div>
          <div className="map-stage" style={{ transform: `translate(${stageOffset.x + stagePan.x}px, ${stageOffset.y + stagePan.y}px) scale(${zoom / 100})` }}>
            <svg className="connections-layer" viewBox="0 0 1080 650" aria-hidden="true">
              {viewMode === "tree" && <defs>{connections.map((line) => (
                <linearGradient
                  key={`gradient-${line.id}`}
                  id={`tree-gradient-${line.id}`}
                  gradientUnits="userSpaceOnUse"
                  x1={line.start.x}
                  y1={line.start.y}
                  x2={line.end.x}
                  y2={line.end.y}
                >
                  <stop offset="0%" stopColor={line.kind === "trunk" ? "#604127" : "#745238"} />
                  <stop offset={line.kind === "trunk" ? "72%" : "38%"} stopColor={line.kind === "trunk" ? "#8e6844" : "#896443"} />
                  <stop offset="100%" stopColor={TREE_TONE_COLORS[line.tone]} />
                </linearGradient>
              ))}</defs>}
              {connections.map((line) => viewMode === "tree" ? (
                <g key={line.id} className={`tree-connection ${line.kind}`}>
                  <path className="tree-connection-outline" d={line.path} />
                  <path className={`connection ${line.kind} ${line.tone}`} style={{ fill: `url(#tree-gradient-${line.id})` }} d={line.path} />
                  <path className="tree-bark-line" d={line.centerPath} />
                  {line.kind === "trunk" && <circle className="tree-knot" cx={line.end.x} cy={line.end.y} r="4.2" />}
                </g>
              ) : <path key={line.id} className={`connection ${line.kind} ${line.tone}`} d={line.path} />)}
            </svg>
            {displayNodes.map((node) => {
              const matchesSearch = searchMatchIds.has(node.id);
              const childCount = childCountById.get(node.id) ?? 0;
              const hasChildren = childCount > 0;
              const visualLevel = nodeMetricsForDepth(depthById.get(node.id) ?? 1).level;
              const isCollapsed = collapsedIds.has(node.id);
              return (
              <article
                key={node.id}
                className={`mind-node ${node.tone} level-${visualLevel} ${viewMode === "tree" ? "tree-node" : ""} ${viewMode === "tree" && !hasChildren ? "tree-leaf" : ""} ${node.id === selectedId ? "selected" : ""} ${node.id === draggingId ? "dragging" : ""} ${isCollapsed ? "collapsed" : ""} ${matchesSearch ? "search-match" : ""}`}
                style={{ left: node.x, top: node.y }}
                tabIndex={0}
                onPointerDown={(event) => beginNodeDrag(event, node)}
                onFocus={(event) => { if (event.target !== event.currentTarget) return; setSelectedId(node.id); keepNodeInView(event.currentTarget); }}
                onDoubleClick={() => beginEdit(node)}
                onContextMenu={(event) => openAiContextMenu(event, node)}
              >
                {editingId === node.id ? <div className="node-editor" onPointerDown={(event) => event.stopPropagation()}><input autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveInlineEdit(); if (event.key === "Escape") cancelEdit(); }} aria-label="節點標題" /><input value={editNote} onChange={(event) => setEditNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveInlineEdit(); if (event.key === "Escape") cancelEdit(); }} aria-label="節點說明" /><span><button onClick={saveInlineEdit}>儲存</button><button onClick={cancelEdit}>取消</button></span></div> : <div className="node-copy"><h3>{node.text}</h3><p>{node.note}</p></div>}
                {editingId !== node.id && node.id === selectedId && hasChildren && <button
                  type="button"
                  className="branch-collapse-toggle"
                  data-testid={`collapse-branch-${node.id}`}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? "展開" : "收合"}${node.text}分支，共 ${childCount} 個直屬子節點`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => { event.stopPropagation(); toggleCollapsed(node.id); }}
                ><span aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>{isCollapsed ? "展開" : "收合"} {childCount}</button>}
                {editingId !== node.id && <div className="node-actions">
                  <button className="node-ai-button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => openAiContextMenu(event, node)} aria-label={`對${node.text}使用 AI Assistant`} aria-haspopup="menu">✦</button>
                  <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); beginEdit(node); }} aria-label={`編輯${node.text}`}>✎</button>
                  {hasChildren && <button data-testid={`auto-layout-branch-${node.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); applyAutoLayout(node.id); }} aria-label={`智慧整理${node.text}分支`}>⌗</button>}
                  {node.parent !== null && <button data-testid={`transplant-node-${node.id}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); beginTransplant(node); }} aria-label={`移植${node.text}分支`} aria-haspopup="dialog">⇢</button>}
                  <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addNode(node.id); }} aria-label={`在${node.text}下新增節點`}>＋</button>
                </div>}
              </article>
            );})}
          </div>
          <div ref={zoomControlRef} className="zoom-control"><button onClick={() => zoomFromControls(-10)} aria-label="縮小，最低 10%" title="縮小">−</button><span>{Math.round(zoom)}%</span><button onClick={() => zoomFromControls(10)} aria-label="放大，最高 200%" title="放大">＋</button><button onClick={fitToView} aria-label="適合畫面" title="適合畫面">◎</button></div>
          </> : <div className="outline-view"><header><div><span>結構化大綱</span><small>拖曳同層排序；使用縮排／凸排調整分支層級</small></div><strong>{outlineNodes.length} 個可見節點</strong></header><div className="outline-list">{outlineNodes.map(({ node, depth }) => {
            const hasChildren = childCountById.has(node.id);
            const matchesSearch = searchMatchIds.has(node.id);
            const siblings = node.parent === null ? [node] : (childrenByParent.get(node.parent) ?? []);
            const siblingIndex = siblings.findIndex((item) => item.id === node.id);
            const parent = node.parent === null ? undefined : nodeById.get(node.parent);
            const previousSibling = siblingIndex > 0 ? siblings[siblingIndex - 1] : undefined;
            const canOutdent = Boolean(parent && parent.parent !== null);
            const draggable = node.parent !== null && editingId !== node.id;
            return <div
              className={`outline-row ${node.id === selectedId ? "selected" : ""} ${matchesSearch ? "search-match" : ""} ${outlineDragId === node.id ? "dragging" : ""} ${outlineDropId === node.id ? "drop-target" : ""}`}
              onContextMenu={(event) => openAiContextMenu(event, node)}
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
              {editingId !== node.id && <div className="outline-actions">
                {node.parent !== null && <button className="transplant-outline-button" data-testid={`outline-transplant-node-${node.id}`} onClick={() => beginTransplant(node)} aria-haspopup="dialog">移植</button>}
                <button className="edit-outline-button" onClick={() => beginEdit(node)}>編輯</button>
                <button className="add-child-button" onClick={() => addNode(node.id)}>＋ 子節點</button>
                <button className="structure-button" data-testid={`outdent-node-${node.id}`} onClick={() => changeOutlineDepth(node.id, "outdent")} disabled={!canOutdent} aria-label={`將${node.text}凸排一層`} title="凸排一層">←</button>
                <button className="structure-button" data-testid={`indent-node-${node.id}`} onClick={() => changeOutlineDepth(node.id, "indent")} disabled={!previousSibling} aria-label={previousSibling ? `將${node.text}縮排到${previousSibling.text}下方` : `無法縮排${node.text}`} title="縮排到前一個同層節點">→</button>
                <button className="reorder-button" onClick={() => moveOutlineNode(node.id, -1)} disabled={node.parent === null || siblingIndex <= 0} aria-label={`將${node.text}上移`}>↑</button>
                <button className="reorder-button" onClick={() => moveOutlineNode(node.id, 1)} disabled={node.parent === null || siblingIndex === siblings.length - 1} aria-label={`將${node.text}下移`}>↓</button>
              </div>}
            </div>;
          })}</div></div>}
        </div>

        {mobileAiOpen && <button className="ai-backdrop" aria-label="關閉 AI 思考夥伴" onClick={() => setMobileAiOpen(false)} />}
        <aside className={`ai-panel ${mobileAiOpen ? "mobile-open" : ""}`}>
          <button className="ai-header" onClick={() => setMobileAiOpen((open) => !open)} aria-expanded={mobileAiOpen}><div className="ai-orb">✦</div><div><span>AI 思考助手</span><small>自動擴寫，也快速讀懂概念</small></div><span className="sheet-handle" aria-hidden="true">⌃</span></button>
          <div className="ai-content">
            <div className="focus-card"><span className={`focus-dot ${selected.tone}`} /><div><small>目前節點</small><strong>{selected.text}</strong>{selected.note && <p>{selected.note}</p>}</div></div>
            {activeAiCommand && <div className="active-ai-command"><span aria-hidden="true">✦</span>節點指令：{activeAiCommand}</div>}
            <div className="ai-mode-switch" role="tablist" aria-label="AI 輔助功能">
              <button type="button" role="tab" aria-selected={aiMode === "expand"} className={aiMode === "expand" ? "active" : ""} data-testid="ai-mode-expand" onClick={() => { setAiMode("expand"); setAiError(""); }} disabled={aiLoading}><strong>自動擴寫</strong><span>生成互補子節點</span></button>
              <button type="button" role="tab" aria-selected={aiMode === "explain"} className={aiMode === "explain" ? "active" : ""} data-testid="ai-mode-explain" onClick={() => { setAiMode("explain"); setAiError(""); }} disabled={aiLoading}><strong>概念解讀</strong><span>說明重點與關聯</span></button>
            </div>
            <div className="simple-prompt"><label htmlFor="ai-prompt">{aiMode === "expand" ? "想往哪個方向延伸？" : "想從什麼角度理解？"}</label><div><textarea id="ai-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askAI(); } }} placeholder={aiMode === "expand" ? "例如：加入更具體的行動與衡量方式" : "例如：用初學者也能理解的方式說明"} /><button onClick={() => void askAI()} aria-label={aiMode === "expand" ? "請 AI 自動擴寫目前節點" : "請 AI 解讀目前節點"} disabled={aiLoading}>{aiLoading ? "處理中…" : aiMode === "expand" ? "生成擴寫" : "解讀節點"}</button></div><small>留白也可以，AI 會依節點與上下層脈絡直接處理</small></div>
            {aiError && <div className="ai-error" role="alert"><span>{aiError}</span><button onClick={() => void askAI()}>重試</button></div>}
            {aiMode === "expand" ? <>
              <div className="suggestion-heading"><div><span className="spark">✦</span><strong>{generatedForNodeId === selected.id ? "AI 擴寫草稿" : "靈感起點"}</strong></div><button data-testid="rotate-suggestions" onClick={() => { setGeneratedSuggestions(null); setGeneratedForNodeId(null); setExpansionSummary(""); setAiError(""); setSuggestionRound((round) => round + 1); }}>換一組 ↻</button></div>
              {generatedForNodeId === selected.id && expansionSummary && <p className="ai-summary">{expansionSummary}</p>}
              <div className="suggestions" data-testid="ai-suggestions" aria-live="polite" key={`${selected.id}-${suggestionRound}`}>
                {aiSuggestions.map((suggestion) => {
                  const suggestionKey = suggestion.title.trim().toLocaleLowerCase("zh-TW");
                  const isAdded = existingChildTitles.has(suggestionKey);
                  return <button
                    className={`suggestion${isAdded ? " added" : ""}`}
                    key={suggestion.title}
                    data-added={isAdded}
                    onClick={() => addAiSuggestion(suggestion)}
                    aria-label={isAdded ? `已加入擴寫節點：${suggestion.title}` : `加入擴寫節點：${suggestion.title}`}
                    disabled={isAdded}
                  >
                    <div><strong>{suggestion.title}</strong><p>{suggestion.note}</p>{isAdded && <small>已加入目前節點</small>}</div>
                    <span className="add-suggestion" aria-hidden="true">{isAdded ? "✓" : "＋"}</span>
                  </button>;
                })}
              </div>
              {generatedForNodeId === selected.id && <div className="suggestion-actions"><button type="button" className="primary" data-testid="ai-expand-all" onClick={addAllAiSuggestions} disabled={!pendingExpansion.length}>{pendingExpansion.length ? `全部加入圖中（${pendingExpansion.length}）` : "已全部加入圖中"}</button></div>}
            </> : visibleExplanation ? <section className="concept-explanation" data-testid="concept-explanation" aria-live="polite">
              <header><span className="spark">✦</span><div><small>AI 概念解讀</small><strong>{explanationSummary}</strong></div></header>
              <div className="concept-definition"><small>一句話理解</small><p>{visibleExplanation.definition}</p></div>
              <div className="concept-points"><small>核心重點</small><ul>{visibleExplanation.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul></div>
              {visibleExplanation.connections.length > 0 && <div className="concept-connections"><small>與圖中概念的關聯</small><ul>{visibleExplanation.connections.map((connection) => <li key={`${connection.nodeId}-${connection.relation}`}><strong>{nodes.find((node) => node.id === connection.nodeId)?.text ?? `節點 ${connection.nodeId}`}</strong><span>{connection.relation}</span></li>)}</ul></div>}
              <div className="concept-question"><small>繼續想想</small><p>{visibleExplanation.question}</p></div>
              <footer><button type="button" data-testid="apply-explanation-note" onClick={applyExplanationToNode}>設為節點說明</button></footer>
            </section> : <div className="ai-empty"><span aria-hidden="true">◎</span><strong>快速讀懂這個節點</strong><p>AI 會根據標題、說明與上下層關係，整理白話定義、核心重點及圖中關聯。</p></div>}
          </div>
        </aside>
      </section>
      {aiContextMenu && <div
        className="ai-context-menu"
        role="menu"
        aria-label={`對「${nodeById.get(aiContextMenu.nodeId)?.text ?? "節點"}」使用 AI`}
        data-testid="ai-context-menu"
        style={{ left: aiContextMenu.x, top: aiContextMenu.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <header><span>✦</span><div><strong>AI Assistant</strong><small>{nodeById.get(aiContextMenu.nodeId)?.text}</small></div></header>
        <div className="ai-context-actions">
          {AI_ASSISTANT_COMMANDS.map((command, index) => <button
            type="button"
            role="menuitem"
            key={command.id}
            data-command={command.id}
            className={index === 5 ? "section-start" : ""}
            onClick={() => runAiAssistantCommand(command.id)}
            disabled={aiLoading}
          ><span aria-hidden="true">{command.icon}</span><strong>{command.label}</strong><small aria-hidden="true">›</small></button>)}
        </div>
        <footer>右鍵節點即可再次開啟</footer>
      </div>}
      {transplantingNode && <div className="modal-backdrop" onMouseDown={closeTransplant}>
        <section className="transplant-modal" role="dialog" aria-modal="true" aria-labelledby="transplant-title" data-testid="transplant-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <span className="modal-kicker">移植分支</span>
          <h2 id="transplant-title">把「{transplantingNode.text}」移到哪裡？</h2>
          <p>這個節點與所有子節點會一起移動，畫布會自動重新整理。整次操作只建立一筆歷史，可直接復原。</p>
          <label className="transplant-field" htmlFor="transplant-parent">
            <span>新的父節點</span>
            <select id="transplant-parent" autoFocus value={transplantParentId ?? ""} onChange={(event) => setTransplantParentId(Number(event.target.value))} data-testid="transplant-parent-select">
              {transplantCandidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{`${"　".repeat(depthOf(nodes, candidate))}${candidate.text}${candidate.id === transplantingNode.parent ? "（目前位置）" : ""}`}</option>)}
            </select>
          </label>
          <div className="transplant-route" aria-live="polite">
            <span>{nodes.find((node) => node.id === transplantingNode.parent)?.text ?? "目前位置"}</span>
            <strong aria-hidden="true">→</strong>
            <span>{nodes.find((node) => node.id === transplantParentId)?.text ?? "請選擇位置"}</span>
          </div>
          <footer>
            <button type="button" onClick={closeTransplant}>取消</button>
            <button type="button" className="primary" onClick={applyTransplant} disabled={transplantParentId === transplantingNode.parent} data-testid="confirm-transplant">移植並整理</button>
          </footer>
        </section>
      </div>}
      {utilityModal === "templates" && <div className="modal-backdrop" onMouseDown={() => setUtilityModal(null)}>
        <section className="utility-modal template-marketplace" role="dialog" aria-modal="true" aria-labelledby="template-title" data-testid="template-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <header className="marketplace-header">
            <div><span className="modal-kicker">TEMPLATE MARKETPLACE</span><h2 id="template-title">範本商城</h2><p>選擇成熟的思考結構，套用到「{selected.text}」下方。</p></div>
            <button type="button" onClick={() => setUtilityModal(null)} aria-label="關閉範本商城">×</button>
          </header>
          <div className="marketplace-toolbar">
            <label><span aria-hidden="true">⌕</span><input value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} placeholder="搜尋範本、用途或標籤" aria-label="搜尋範本商城" /></label>
            <span>{filteredTemplates.length} 個範本</span>
          </div>
          <nav className="template-categories" aria-label="範本分類">
            {TEMPLATE_CATEGORIES.map((category) => <button type="button" key={category} className={templateCategory === category ? "active" : ""} onClick={() => setTemplateCategory(category)}>{category}</button>)}
          </nav>
          <div className="marketplace-layout">
            <div className="template-grid" aria-live="polite">
              {filteredTemplates.map((template) => <article key={template.id} className={previewTemplate?.id === template.id ? "selected" : ""}>
                <button type="button" className="template-card-main" onClick={() => setPreviewTemplateId(template.id)} aria-label={`預覽${template.title}`}>
                  <span className="template-icon" aria-hidden="true">{template.icon}</span>
                  <span className="template-category">{template.featured ? "精選 · " : ""}{template.category}</span>
                  <strong>{template.title}</strong>
                  <p>{template.description}</p>
                  <small>{template.nodes.length} 個節點 · {template.author}</small>
                </button>
                <button type="button" className="template-use" onClick={() => insertTemplate(template.id)}>使用範本</button>
              </article>)}
              {!filteredTemplates.length && <div className="template-empty"><span>⌕</span><strong>找不到相符範本</strong><p>換個關鍵字或選擇「全部」分類。</p></div>}
            </div>
            {previewTemplate && <aside className="template-preview" aria-label="範本預覽">
              <div className="preview-heading"><span>{previewTemplate.icon}</span><div><small>{previewTemplate.category} · {previewTemplate.author}</small><strong>{previewTemplate.title}</strong></div></div>
              <p>{previewTemplate.description}</p>
              <div className="preview-tree">
                {previewTemplate.nodes.map((node) => {
                  const parent = node.parentKey ? previewTemplate.nodes.find((candidate) => candidate.key === node.parentKey) : null;
                  return <div key={node.key} className={node.parentKey === null ? "root" : ""}><span aria-hidden="true">{node.parentKey === null ? "●" : "└"}</span><div><strong>{node.text}</strong><small>{parent ? `位於「${parent.text}」下` : "範本根節點"}</small></div></div>;
                })}
              </div>
              <div className="preview-tags">{previewTemplate.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <button type="button" className="primary marketplace-apply" onClick={() => insertTemplate(previewTemplate.id)}>套用到「{selected.text}」</button>
            </aside>}
          </div>
        </section>
      </div>}
      {utilityModal === "generate-map" && <div className="modal-backdrop" onMouseDown={() => !aiMapLoading && setUtilityModal(null)}>
        <section className="utility-modal ai-map-modal" role="dialog" aria-modal="true" aria-labelledby="ai-map-title" data-testid="ai-map-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <header className="ai-map-modal-header">
            <div><span className="modal-kicker">AI MAP GENERATOR</span><h2 id="ai-map-title">AI 自動產圖</h2><p>描述你想規劃或理解的主題，先預覽完整結構，再決定是否建立。</p></div>
            <button type="button" onClick={() => setUtilityModal(null)} aria-label="關閉 AI 自動產圖" disabled={aiMapLoading}>×</button>
          </header>
          <div className="ai-map-workspace">
            <section className="ai-map-form">
              <label htmlFor="ai-map-prompt"><span>你想建立什麼？</span><textarea id="ai-map-prompt" value={aiMapPrompt} onChange={(event) => { setAiMapPrompt(event.target.value); setAiMapError(""); }} placeholder={"例如：我要設計一門 MikroTik VLAN 實作課程，包含觀念、Bridge、DHCP、Firewall、Lab 與評量"} maxLength={1200} autoFocus /></label>
              <fieldset><legend>詳細程度</legend><div className="ai-map-detail-options">
                {(Object.entries(AI_MAP_DETAIL_OPTIONS) as [AiMapDetail, (typeof AI_MAP_DETAIL_OPTIONS)[AiMapDetail]][]).map(([id, option]) => <label key={id} className={aiMapDetail === id ? "selected" : ""}><input type="radio" name="ai-map-detail" value={id} checked={aiMapDetail === id} onChange={() => setAiMapDetail(id)} /><strong>{option.label}</strong><span>{option.description}</span></label>)}
              </div></fieldset>
              <button type="button" className="generate-map-button" onClick={() => void generateAiMap()} disabled={aiMapLoading || aiMapPrompt.trim().length < 3}><span aria-hidden="true">✦</span>{aiMapLoading ? "AI 正在組織結構…" : aiMapDraft ? "重新產生草稿" : "產生心智圖草稿"}</button>
              <small>AI 可能犯錯；套用前請檢查節點結構與內容。</small>
              {aiMapError && <div className="ai-map-error" role="alert">{aiMapError}</div>}
            </section>
            <section className="ai-map-preview" aria-live="polite">
              {aiMapDraft ? <>
                <header><div><span>草稿預覽</span><strong>{aiMapDraft.title}</strong></div><small>{aiMapDraft.nodes.length} 個節點</small></header>
                <p>{aiMapDraft.summary}</p>
                <div className="generated-outline">
                  {generatedMapNodes.map((node) => <article key={node.id} style={{ paddingLeft: `${depthOf(generatedMapNodes, node) * 18}px` }}><span aria-hidden="true">{node.parent === null ? "●" : "└"}</span><div><strong>{node.text}</strong><small>{node.note}</small></div></article>)}
                </div>
                <footer><span>套用會取代目前地圖，但可復原一次。</span><button type="button" className="primary" onClick={applyGeneratedMap}>建立這張心智圖</button></footer>
              </> : <div className="ai-map-empty"><span aria-hidden="true">✣</span><strong>{aiMapLoading ? "正在長出心智圖…" : "你的心智圖草稿會出現在這裡"}</strong><p>{aiMapLoading ? "AI 正在安排中心主題、主要分支與細節。" : "輸入明確的主題、對象與期待成果，通常會得到更好的結構。"}</p></div>}
            </section>
          </div>
        </section>
      </div>}
      {utilityModal === "knowledge-import" && <div className="modal-backdrop" onMouseDown={() => !knowledgeLoading && setUtilityModal(null)}>
        <section className="utility-modal ai-map-modal knowledge-modal" role="dialog" aria-modal="true" aria-labelledby="knowledge-import-title" data-testid="knowledge-import-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <header className="ai-map-modal-header">
            <div><span className="modal-kicker">KNOWLEDGE IMPORT</span><h2 id="knowledge-import-title">PDF／網站／影音知識匯入</h2><p>讓 AI 從來源擷取重點，先預覽心智圖草稿，確認後才套用。</p></div>
            <button type="button" onClick={() => setUtilityModal(null)} aria-label="關閉知識匯入" disabled={knowledgeLoading}>×</button>
          </header>
          <div className="ai-map-workspace knowledge-workspace">
            <section className="ai-map-form knowledge-form">
              <div className="knowledge-source-tabs" role="tablist" aria-label="知識來源">
                {([["pdf", "PDF"], ["website", "網站"], ["transcript", "影音逐字稿"]] as [KnowledgeSourceType, string][]).map(([type, label]) => <button key={type} type="button" role="tab" aria-selected={knowledgeSourceType === type} className={knowledgeSourceType === type ? "active" : ""} onClick={() => { setKnowledgeSourceType(type); setKnowledgeDraft(null); setKnowledgeError(""); }}>{label}</button>)}
              </div>
              {knowledgeSourceType === "pdf" && <>
                <label className="knowledge-file-picker"><span>選擇 PDF 文件</span><input type="file" accept=".pdf,application/pdf" onChange={(event) => readKnowledgeFile(event.target.files?.[0])} /></label>
                <div className={`knowledge-source-status ${knowledgeFileData ? "ready" : ""}`}><strong>{knowledgeFileData ? knowledgeFilename : "尚未選擇文件"}</strong><span>上限 8MB；文件會傳送至 AI 服務進行整理。</span></div>
              </>}
              {knowledgeSourceType === "website" && <label className="knowledge-field"><span>公開網站網址</span><input type="url" inputMode="url" value={knowledgeUrl} onChange={(event) => { setKnowledgeUrl(event.target.value); setKnowledgeDraft(null); setKnowledgeError(""); }} placeholder="https://example.com/article" autoFocus /><small>僅支援公開 HTTPS 網頁；需登入或以 JavaScript 動態載入的內容可能無法讀取。</small></label>}
              {knowledgeSourceType === "transcript" && <>
                <label className="knowledge-field"><span>影音網址（選填，作為來源標示）</span><input type="url" inputMode="url" value={knowledgeUrl} onChange={(event) => setKnowledgeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label>
                <label className="knowledge-file-picker compact"><span>上傳字幕或逐字稿</span><input type="file" accept=".txt,.md,.srt,.vtt,text/plain,text/markdown,text/vtt" onChange={(event) => readKnowledgeFile(event.target.files?.[0])} /></label>
                <label className="knowledge-field"><span>或貼上逐字稿</span><textarea value={knowledgeContent} onChange={(event) => { setKnowledgeContent(event.target.value.slice(0, 80_000)); setKnowledgeDraft(null); setKnowledgeError(""); }} placeholder="貼上影片或 Podcast 的字幕、逐字稿…" maxLength={80_000} /></label>
              </>}
              <button type="button" className="generate-map-button" onClick={() => void generateKnowledgeMap()} disabled={knowledgeLoading || (knowledgeSourceType === "pdf" ? !knowledgeFileData : knowledgeSourceType === "website" ? !knowledgeUrl.trim().startsWith("https://") : knowledgeContent.trim().length < 20)}><span aria-hidden="true">✦</span>{knowledgeLoading ? "AI 正在閱讀來源…" : knowledgeDraft ? "重新整理草稿" : "整理成心智圖草稿"}</button>
              {knowledgeSourceType === "transcript" && <small>目前不會繞過平台登入或擷取私人字幕；請提供你有權使用的逐字稿。</small>}
              {knowledgeError && <div className="ai-map-error" role="alert">{knowledgeError}</div>}
            </section>
            <section className="ai-map-preview" aria-live="polite">
              {knowledgeDraft ? <>
                <header><div><span>知識草稿預覽</span><strong>{knowledgeDraft.title}</strong></div><small>{knowledgeDraft.nodes.length} 個節點</small></header>
                <p>{knowledgeDraft.summary}</p>
                <div className="generated-outline">
                  {knowledgeMapNodes.map((node) => <article key={node.id} style={{ paddingLeft: `${depthOf(knowledgeMapNodes, node) * 18}px` }}><span aria-hidden="true">{node.parent === null ? "●" : "└"}</span><div><strong>{node.text}</strong><small>{node.note}</small></div></article>)}
                </div>
                <footer><span>套用會取代目前地圖，但可復原一次。</span><button type="button" className="primary" onClick={applyKnowledgeMap}>建立這張心智圖</button></footer>
              </> : <div className="ai-map-empty"><span aria-hidden="true">◫</span><strong>{knowledgeLoading ? "正在閱讀與整理…" : "來源摘要與心智圖會出現在這裡"}</strong><p>{knowledgeLoading ? "AI 正在辨識主題、論點、步驟與限制。" : "選擇 PDF、貼上公開網址，或提供影音逐字稿開始整理。"}</p></div>}
            </section>
          </div>
        </section>
      </div>}
      {utilityModal === "import" && <div className="modal-backdrop" onMouseDown={() => setUtilityModal(null)}>
        <section className="utility-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" data-testid="import-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <span className="modal-kicker">匯入內容</span>
          <h2 id="import-title">JSON／Markdown 匯入</h2>
          <p>先預覽格式、標題與節點數，確認後才會取代目前地圖；完成後仍可復原。</p>
          <div className="import-controls">
            <label><span>格式</span><select value={importFormat} onChange={(event) => { const format = event.target.value as ImportFormat; setImportFormat(format); setImportPreview(null); }}><option value="auto">自動判斷</option><option value="json">JSON</option><option value="markdown">Markdown</option></select></label>
            <label className="file-picker"><span>或選擇檔案</span><input type="file" accept=".json,.md,.markdown,application/json,text/markdown" onChange={(event) => void readImportFile(event.target.files?.[0])} /></label>
          </div>
          <label className="import-source"><span>貼上內容</span><textarea value={importSource} onChange={(event) => { setImportSource(event.target.value); setImportPreview(null); }} placeholder={'# 中心主題\n## 第一個分支\n分支說明'} /></label>
          {importPreview && <div className={`import-preview ${importPreview.ok ? "valid" : "invalid"}`} role="status">
            {importPreview.ok
              ? <><strong>可匯入：{importPreview.title}</strong><span>{importPreview.format.toUpperCase()} · {importPreview.nodes.length} 個節點</span></>
              : <><strong>無法匯入</strong><span>{importPreview.line ? `第 ${importPreview.line} 行：` : importPreview.node ? `第 ${importPreview.node} 個節點：` : ""}{importPreview.message}</span></>}
          </div>}
          <footer>
            <button type="button" onClick={() => setUtilityModal(null)}>取消</button>
            <button type="button" onClick={() => previewImport()}>產生預覽</button>
            <button type="button" className="primary" onClick={applyImport} disabled={!importPreview?.ok}>匯入並取代</button>
          </footer>
        </section>
      </div>}
      {utilityModal === "share-access" && <div className="modal-backdrop" onMouseDown={() => !shareLoading && setUtilityModal(null)}>
        <section className="utility-modal share-access-modal" role="dialog" aria-modal="true" aria-labelledby="share-access-title" data-testid="share-access-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <header className="share-access-header">
            <div><span className="modal-kicker">CONTROLLED SHARING</span><h2 id="share-access-title">分享權限</h2><p>預設不公開；只有持有啟用連結的人能依指定角色存取。</p></div>
            <button type="button" onClick={() => setUtilityModal(null)} aria-label="關閉分享設定" disabled={shareLoading}>×</button>
          </header>
          <label className="share-toggle">
            <span><strong>啟用分享連結</strong><small>{shareActive ? "連結目前可以使用" : "其他人目前無法透過連結存取"}</small></span>
            <input type="checkbox" checked={shareActive} onChange={(event) => setShareActive(event.target.checked)} disabled={shareLoading} />
          </label>
          <fieldset className="share-role-options" disabled={shareLoading || !shareActive}>
            <legend>訪客權限</legend>
            {([
              ["view", "唯讀", "可瀏覽、搜尋與匯出，不可修改"],
              ["comment", "可留言", "保留留言角色；P2-03 開放討論"],
              ["edit", "可編輯", "可修改節點與標題，變更同步儲存"],
            ] as [SharePermission, string, string][]).map(([permission, label, detail]) => <label key={permission} className={sharePermission === permission ? "selected" : ""}><input type="radio" name="share-permission" checked={sharePermission === permission} onChange={() => setSharePermission(permission)} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}
          </fieldset>
          {shareLink && <div className={`share-link-box ${shareLink.active ? "active" : ""}`}>
            <label htmlFor="share-link-value">分享網址</label>
            <div><input id="share-link-value" readOnly value={`${location.origin}${shareLink.url}`} /><button type="button" onClick={() => { void navigator.clipboard?.writeText(`${location.origin}${shareLink.url}`); flashToast("共享連結已複製"); }} disabled={!shareLink.active}>複製</button></div>
          </div>}
          {shareError && <div className="ai-map-error" role="alert">{shareError}</div>}
          <div className="share-security-note"><span aria-hidden="true">◆</span><p><strong>權限由伺服器強制執行</strong>關閉分享後，既有網址會立即失效。重新產生連結則會永久淘汰舊網址。</p></div>
          <footer>
            {shareLink && <button type="button" onClick={() => void updateShareAccess(true)} disabled={shareLoading}>重新產生連結</button>}
            <button type="button" onClick={() => setUtilityModal(null)} disabled={shareLoading}>取消</button>
            <button type="button" className="primary" onClick={() => void updateShareAccess()} disabled={shareLoading}>{shareLoading ? "儲存中…" : "儲存分享設定"}</button>
          </footer>
        </section>
      </div>}
      {utilityModal === "preferences" && <div className="modal-backdrop" onMouseDown={() => setUtilityModal(null)}>
        <section className="utility-modal preferences-modal" role="dialog" aria-modal="true" aria-labelledby="preferences-title" data-testid="preferences-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <span className="modal-kicker">使用者偏好</span>
          <h2 id="preferences-title">每次開啟時的預設狀態</h2>
          <p>設定只保存在這台裝置，不會改變其他人的共享檢視。</p>
          <label><span>預設檢視</span><select value={preferencesDraft.defaultView} onChange={(event) => setPreferencesDraft((current) => ({ ...current, defaultView: event.target.value as UserPreferences["defaultView"] }))}><option value="canvas">心智圖</option><option value="tree">樹狀</option><option value="outline">大綱</option></select></label>
          <label><span>預設縮放</span><div className="preference-range"><input type="range" min="10" max="200" step="10" value={preferencesDraft.zoom} onChange={(event) => setPreferencesDraft((current) => ({ ...current, zoom: Number(event.target.value) }))} /><strong>{preferencesDraft.zoom}%</strong></div></label>
          <label className="preference-toggle"><input type="checkbox" checked={preferencesDraft.aiPanelOpen} onChange={(event) => setPreferencesDraft((current) => ({ ...current, aiPanelOpen: event.target.checked }))} /><span>預設展開 AI 面板</span></label>
          <label className="preference-toggle"><input type="checkbox" checked={preferencesDraft.reducedMotion} onChange={(event) => setPreferencesDraft((current) => ({ ...current, reducedMotion: event.target.checked }))} /><span>減少介面動態效果</span></label>
          <footer>
            <button type="button" onClick={restoreDefaultPreferences}>重設</button>
            <button type="button" onClick={() => setUtilityModal(null)}>取消</button>
            <button type="button" className="primary" onClick={() => applyPreferences()}>儲存偏好</button>
          </footer>
        </section>
      </div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
