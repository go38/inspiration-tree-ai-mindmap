"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildMarkdownLines,
  collectSubtreeIds,
  createCurvedRibbon,
  depthOf,
  nextNodeId,
  pushHistory,
  safeFilename,
  type HistoryState,
  type NodeItem,
} from "./lib/mindmap";
import { initialNodes } from "./lib/sampleMap";
import { clearDraft, loadDocumentTitle, loadDraft, saveDocumentTitle, saveDraft } from "./lib/storage";

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
  | { mode: "cloud"; mapId: string; version: number; title: string };

type ServerMap = {
  id: string;
  title: string;
  nodes: NodeItem[];
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};

type SyncState = "idle" | "saving" | "saved" | "conflict" | "error";
type ViewMode = "canvas" | "outline";

const SYNC_LABEL: Record<SyncState, string> = {
  idle: "雲端共享",
  saving: "儲存中…",
  saved: "已同步",
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
  const [suggestionSelection, setSuggestionSelection] = useState<Set<string>>(() => new Set());
  const [suggestionPreviewOpen, setSuggestionPreviewOpen] = useState(false);
  const [stageOffset, setStageOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const version = useRef(persistence.mode === "cloud" ? persistence.version : 1);
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const availableSuggestionGroups = suggestionGroups[selected.text] ?? suggestionGroups.default;
  const aiSuggestions = availableSuggestionGroups[suggestionRound % availableSuggestionGroups.length];

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
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return visibleNodes.flatMap((node) => {
      const parent = node.parent === null ? undefined : byId.get(node.parent);
      if (!parent || !visibleNodeIds.has(parent.id)) return [];
      const x1 = parent.x + 90, y1 = parent.y + 35, x2 = node.x + 90, y2 = node.y + 35;
      const thickness = Math.max(4, 10 - (depthOf(nodes, node) - 1) * 3);
      const curve = createCurvedRibbon(x1, y1, x2, y2, thickness, Math.max(1.2, thickness * .12), parent.id + node.id);
      return [{ id: `${parent.id}-${node.id}`, path: curve.path, tone: node.tone }];
    });
  }, [nodes, visibleNodeIds, visibleNodes]);

  function flashToast(message: string, ms = 1800) {
    setToast(message);
    window.setTimeout(() => setToast(""), ms);
  }

  async function saveToCloud() {
    if (persistence.mode !== "cloud") return;
    setSync("saving");
    try {
      const response = await fetch(`/api/maps/${persistence.mapId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: documentTitle, version: version.current, nodes }),
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
      setSync("saved");
    } catch {
      setSync("error");
    }
  }

  // Debounced autosave. Skips until the initial restore has run so a freshly
  // loaded page never overwrites the source of truth on mount.
  useEffect(() => {
    if (!hydrated.current) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    setSync("saving");
    if (!isCloud) setPersisted(false);
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

  // Local mode restores its draft once after mount (cloud data comes from the
  // server props, so there is nothing to restore there).
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
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function toggleSuggestion(title: string) {
    setSuggestionSelection((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }

  function addSelectedSuggestions() {
    const chosen = aiSuggestions.filter((item) => suggestionSelection.has(item.title));
    if (!chosen.length) return;
    checkpoint();
    const parent = selected;
    const existingChildren = nodes.filter((node) => node.parent === parent.id).length;
    let id = nextNodeId(nodes);
    const tones: NodeItem["tone"][] = ["coral", "sage", "sun"];
    const created = chosen.map((item, index) => ({
      id: id++, parent: parent.id, text: item.title, note: item.note,
      x: Math.max(20, Math.min(900, parent.x + (parent.x < 430 ? -210 : 210))),
      y: Math.max(20, Math.min(560, parent.y - 65 + (existingChildren + index) * 115)),
      tone: tones[(existingChildren + index) % tones.length],
    }));
    setNodes((items) => [...items, ...created]);
    setSelectedId(created[0].id);
    setSuggestionSelection(new Set());
    setSuggestionPreviewOpen(false);
    flashToast(`已加入 ${created.length} 個 AI 靈感`);
  }

  function fitToView() {
    if (!visibleNodes.length) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const minX = Math.min(...visibleNodes.map((node) => node.x));
    const maxX = Math.max(...visibleNodes.map((node) => node.x + (node.tone === "ink" ? 204 : 180)));
    const minY = Math.min(...visibleNodes.map((node) => node.y));
    const maxY = Math.max(...visibleNodes.map((node) => node.y + (node.tone === "ink" ? 82 : 70)));
    const nextZoom = rect
      ? Math.round(Math.max(70, Math.min(130, Math.min((rect.width - 70) / Math.max(maxX - minX, 1), (rect.height - 90) / Math.max(maxY - minY, 1)) * 100)) / 10) * 10
      : 100;
    setZoom(nextZoom);
    setStageOffset({ x: 540 - (minX + maxX) / 2, y: 325 - (minY + maxY) / 2 });
    flashToast("已將心智圖調整至畫面中央");
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
    if (!drag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (100 / zoom) - drag.current.ox;
    const y = (event.clientY - rect.top) * (100 / zoom) - drag.current.oy;
    setNodes((items) => items.map((item) => item.id === drag.current?.id ? { ...item, x, y } : item));
  }

  function askAI() {
    const idea = prompt.trim();
    if (!idea) return;
    addNode(selected.id, idea, `AI 已依「${selected.text}」整理為可繼續發展的方向`);
    setPrompt("");
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
      ctx.fillStyle = "#fffcf6"; ctx.font = "600 36px sans-serif"; ctx.fillText("靈感樹 · 心智圖", 58, 68);
      ctx.fillStyle = "#cfc9bd"; ctx.font = "20px sans-serif"; ctx.fillText(new Date().toLocaleDateString("zh-TW"), 1450, 66);
      const minX = Math.min(...nodes.map((node) => node.x));
      const maxX = Math.max(...nodes.map((node) => node.x + (node.tone === "ink" ? 204 : 180)));
      const minY = Math.min(...nodes.map((node) => node.y));
      const maxY = Math.max(...nodes.map((node) => node.y + (node.tone === "ink" ? 82 : 70)));
      const scale = Math.min(1500 / Math.max(maxX - minX, 1), 960 / Math.max(maxY - minY, 1), 1.65);
      const ox = (width - (maxX - minX) * scale) / 2 - minX * scale;
      const oy = 150 + (960 - (maxY - minY) * scale) / 2 - minY * scale;
      nodes.forEach((node) => {
        const parent = nodes.find((item) => item.id === node.parent);
        if (!parent) return;
        const color = node.tone === "sage" ? "#7f9876" : node.tone === "sun" ? "#d8ad44" : "#ed765f";
        const depth = depthOf(nodes, node);
        const x1 = ox + (parent.x + 90) * scale, y1 = oy + (parent.y + 35) * scale;
        const x2 = ox + (node.x + 90) * scale, y2 = oy + (node.y + 35) * scale;
        const startWidth = Math.max(4, 10 - (depth - 1) * 3) * scale;
        const curve = createCurvedRibbon(x1, y1, x2, y2, startWidth, Math.max(1.4, startWidth * .12), parent.id + node.id);
        ctx.fillStyle = color; ctx.globalAlpha = .72; ctx.beginPath();
        ctx.moveTo(curve.top.start[0], curve.top.start[1]);
        ctx.bezierCurveTo(curve.top.c1[0], curve.top.c1[1], curve.top.c2[0], curve.top.c2[1], curve.top.end[0], curve.top.end[1]);
        ctx.lineTo(curve.bottom.end[0], curve.bottom.end[1]);
        ctx.bezierCurveTo(curve.bottom.c2[0], curve.bottom.c2[1], curve.bottom.c1[0], curve.bottom.c1[1], curve.bottom.start[0], curve.bottom.start[1]);
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      });
      nodes.forEach((node) => {
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

  const statusLabel = isCloud ? SYNC_LABEL[sync] : sync === "saving" ? "儲存中…" : sync === "error" ? "儲存失敗" : persisted ? "已自動儲存" : "互動草稿";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">靈</span><span>靈感樹</span><small>AI MIND STUDIO</small></div>
        <div className="document-title"><span className={`status-dot ${sync}`} />{titleEditing ? <input className="title-input" autoFocus value={titleDraft} maxLength={80} onChange={(event) => setTitleDraft(event.target.value)} onBlur={saveTitleEdit} onKeyDown={(event) => { if (event.key === "Enter") saveTitleEdit(); if (event.key === "Escape") setTitleEditing(false); }} aria-label="心智圖標題" /> : <button className="title-button" onClick={beginTitleEdit} aria-label={`修改標題：${documentTitle}`}>{documentTitle}<span aria-hidden="true">✎</span></button>} <span className="saved">{statusLabel}</span></div>
        <div className="top-actions">
          <div className="export-wrap">
            <button className="export-button" onClick={() => setExportOpen((open) => !open)} aria-haspopup="menu" aria-expanded={exportOpen} disabled={exporting}>{exporting ? "匯出中…" : "匯出"} <span>↓</span></button>
            {exportOpen && <div className="export-menu" role="menu">
              <button role="menuitem" onClick={exportMarkdown}><span className="file-icon">M↓</span><span><strong>Markdown</strong><small>保留節點階層與說明</small></span></button>
              <button role="menuitem" onClick={exportPdf}><span className="file-icon pdf">P↓</span><span><strong>PDF 文件</strong><small>輸出完整心智圖畫布</small></span></button>
              <button role="menuitem" onClick={exportPng}><span className="file-icon png">PNG</span><span><strong>PNG 圖形檔</strong><small>高解析度完整心智圖</small></span></button>
            </div>}
          </div>
          {isCloud ? (
            <button className="share-button" onClick={() => { navigator.clipboard?.writeText(location.href); flashToast("共享連結已複製"); }}>複製連結 <span>↗</span></button>
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

      <section className="workspace">
        <nav className="toolrail" aria-label="心智圖工具">
          <button className="tool" onClick={() => addNode()} aria-label="在目前節點下新增節點">
            <span aria-hidden="true">＋</span><small>新增</small>
          </button>
          <button className="tool danger" onClick={removeSelectedNode} aria-label="移除目前節點" disabled={selected.parent === null}>
            <span aria-hidden="true">−</span><small>移除</small>
          </button>
          <span className="tool-divider" aria-hidden="true" />
          <button className="tool" onClick={undo} aria-label="復原上一步" disabled={!history.length}>
            <span aria-hidden="true">↶</span><small>復原</small>
          </button>
          <button className="tool" onClick={redo} aria-label="重做上一步" disabled={!future.length}>
            <span aria-hidden="true">↷</span><small>重做</small>
          </button>
          <span className="tool-divider" aria-hidden="true" />
          <button className={`tool ${viewMode === "outline" ? "active" : ""}`} onClick={() => setViewMode((mode) => mode === "canvas" ? "outline" : "canvas")} aria-label={viewMode === "canvas" ? "切換至大綱模式" : "切換至心智圖模式"}>
            <span aria-hidden="true">≡</span><small>{viewMode === "canvas" ? "大綱" : "畫布"}</small>
          </button>
          {!isCloud && <>
            <span className="tool-divider" aria-hidden="true" />
            <button className="tool" onClick={resetToSample} aria-label="清除草稿並重設為預設範例">
              <span aria-hidden="true">⟳</span><small>重設</small>
            </button>
          </>}
        </nav>

        <div ref={canvasRef} className={`canvas ${viewMode === "outline" ? "outline-active" : ""}`} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
          <div className="canvas-commandbar">
            <div className="view-switch" role="group" aria-label="檢視模式"><button className={viewMode === "canvas" ? "active" : ""} onClick={() => setViewMode("canvas")}>心智圖</button><button className={viewMode === "outline" ? "active" : ""} onClick={() => setViewMode("outline")}>大綱</button></div>
            <label className="node-search"><span aria-hidden="true">⌕</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="搜尋節點" aria-label="搜尋節點" /></label>
            <button className="fit-button" onClick={fitToView}>適合畫面</button>
          </div>
          {viewMode === "canvas" ? <>
          <div className="canvas-hint">拖曳整理 · 雙擊編輯 · Enter 同層 · Tab 子節點</div>
          <div className="map-stage" style={{ transform: `translate(${stageOffset.x}px, ${stageOffset.y}px) scale(${zoom / 100})` }}>
            <svg className="connections-layer" viewBox="0 0 1080 650" aria-hidden="true">
              {connections.map((line) => <path key={line.id} className={`connection ${line.tone}`} d={line.path} />)}
            </svg>
            {visibleNodes.map((node) => {
              const matchesSearch = normalizedSearch && `${node.text} ${node.note}`.toLocaleLowerCase("zh-TW").includes(normalizedSearch);
              const hasChildren = nodes.some((item) => item.parent === node.id);
              return (
              <article
                key={node.id}
                className={`mind-node ${node.tone} ${node.id === selectedId ? "selected" : ""} ${matchesSearch ? "search-match" : ""}`}
                style={{ left: node.x, top: node.y }}
                onPointerDown={(event) => { if (editingId === node.id) return; checkpoint(); setSelectedId(node.id); const rect = event.currentTarget.getBoundingClientRect(); drag.current = { id: node.id, ox: (event.clientX - rect.left) * (100 / zoom), oy: (event.clientY - rect.top) * (100 / zoom) }; event.currentTarget.setPointerCapture(event.pointerId); }}
                onDoubleClick={() => beginEdit(node)}
              >
                {editingId === node.id ? <div className="node-editor" onPointerDown={(event) => event.stopPropagation()}><input autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveInlineEdit(); if (event.key === "Escape") cancelEdit(); }} aria-label="節點標題" /><input value={editNote} onChange={(event) => setEditNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveInlineEdit(); if (event.key === "Escape") cancelEdit(); }} aria-label="節點說明" /><span><button onClick={saveInlineEdit}>儲存</button><button onClick={cancelEdit}>取消</button></span></div> : <div><h3>{node.text}</h3><p>{node.note}</p></div>}
                {editingId !== node.id && <div className="node-actions"><button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); beginEdit(node); }} aria-label={`編輯${node.text}`}>✎</button>{hasChildren && <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleCollapsed(node.id); }} aria-label={`${collapsedIds.has(node.id) ? "展開" : "收合"}${node.text}`}>{collapsedIds.has(node.id) ? "▸" : "▾"}</button>}<button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); addNode(node.id); }} aria-label={`在${node.text}下新增節點`}>＋</button></div>}
              </article>
            );})}
          </div>
          <div className="zoom-control"><button onClick={() => setZoom(Math.max(70, zoom - 10))} aria-label="縮小">−</button><span>{zoom}%</span><button onClick={() => setZoom(Math.min(130, zoom + 10))} aria-label="放大">＋</button><button onClick={fitToView} aria-label="適合畫面">◎</button></div>
          </> : <div className="outline-view"><header><div><span>結構化大綱</span><small>點選節點後可直接編輯或新增子節點</small></div><strong>{outlineNodes.length} 個可見節點</strong></header><div className="outline-list">{outlineNodes.map(({ node, depth }) => {
            const hasChildren = nodes.some((item) => item.parent === node.id);
            const matchesSearch = normalizedSearch && `${node.text} ${node.note}`.toLocaleLowerCase("zh-TW").includes(normalizedSearch);
            return <div className={`outline-row ${node.id === selectedId ? "selected" : ""} ${matchesSearch ? "search-match" : ""}`} style={{ paddingLeft: 18 + depth * 28 }} key={node.id}>
              <button className="outline-collapse" onClick={() => hasChildren && toggleCollapsed(node.id)} aria-label={hasChildren ? `${collapsedIds.has(node.id) ? "展開" : "收合"}${node.text}` : undefined} disabled={!hasChildren}>{hasChildren ? collapsedIds.has(node.id) ? "▸" : "▾" : "·"}</button>
              {editingId === node.id ? <div className="outline-editor"><input autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} aria-label="節點標題" /><input value={editNote} onChange={(event) => setEditNote(event.target.value)} aria-label="節點說明" /><button onClick={saveInlineEdit}>儲存</button><button onClick={cancelEdit}>取消</button></div> : <button className="outline-copy" onClick={() => setSelectedId(node.id)} onDoubleClick={() => beginEdit(node)}><strong>{node.text}</strong><span>{node.note || "尚未加入說明"}</span></button>}
              {editingId !== node.id && <div className="outline-actions"><button onClick={() => beginEdit(node)}>編輯</button><button onClick={() => addNode(node.id)}>＋ 子節點</button></div>}
            </div>;
          })}</div></div>}
        </div>

        {mobileAiOpen && <button className="ai-backdrop" aria-label="關閉 AI 思考夥伴" onClick={() => setMobileAiOpen(false)} />}
        <aside className={`ai-panel ${mobileAiOpen ? "mobile-open" : ""}`}>
          <button className="ai-header" onClick={() => setMobileAiOpen((open) => !open)} aria-expanded={mobileAiOpen}><div className="ai-orb">✦</div><div><span>AI 思考夥伴</span><small>隨時為你展開更多可能</small></div><span className="online">在線</span><span className="sheet-handle" aria-hidden="true">⌃</span></button>
          <div className="ai-content">
            <p className="eyebrow">目前聚焦</p>
            <div className="focus-card"><span className={`focus-dot ${selected.tone}`} /><div><strong>{selected.text}</strong><p>{selected.note}</p></div></div>
            <div className="suggestion-heading"><div><span className="spark">✦</span><strong>選擇想加入的靈感</strong></div><button data-testid="rotate-suggestions" onClick={() => { setSuggestionSelection(new Set()); setSuggestionRound((round) => round + 1); flashToast("已換一組靈感"); }}>換一組 ↻</button></div>
            <div className="suggestions" data-testid="ai-suggestions" aria-live="polite" key={`${selected.id}-${suggestionRound}`}>
              {aiSuggestions.map((suggestion, index) => <button className={`suggestion ${suggestionSelection.has(suggestion.title) ? "selected" : ""}`} aria-pressed={suggestionSelection.has(suggestion.title)} key={suggestion.title} onClick={() => toggleSuggestion(suggestion.title)}><span className="suggestion-number">0{index + 1}</span><div><strong>{suggestion.title}</strong><p>{suggestion.note}</p></div><span className="add-suggestion">{suggestionSelection.has(suggestion.title) ? "✓" : "＋"}</span></button>)}
            </div>
            <div className="suggestion-actions"><button onClick={() => setSuggestionSelection(new Set(aiSuggestions.map((item) => item.title)))}>全選</button><button className="primary" disabled={!suggestionSelection.size} onClick={() => setSuggestionPreviewOpen(true)}>預覽加入（{suggestionSelection.size}）</button></div>
            <div className="quick-row"><button onClick={() => setPrompt("把這個想法拆成三個具體步驟")}>拆解步驟</button><button onClick={() => setPrompt("找出我還沒想到的風險與盲點")}>找出盲點</button><button onClick={() => setPrompt("提供一個完全不同的觀點")}>換個角度</button></div>
          </div>
          <div className="prompt-box"><label htmlFor="ai-prompt">和 AI 一起想</label><div><textarea id="ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(); } }} placeholder={`例如：幫我延伸「${selected.text}」的具體做法…`} /><button onClick={askAI} aria-label="送出提示">↑</button></div><small>Enter 送出 · Shift + Enter 換行</small></div>
        </aside>
      </section>
      {suggestionPreviewOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSuggestionPreviewOpen(false); }}><section className="suggestion-modal" role="dialog" aria-modal="true" aria-labelledby="suggestion-preview-title"><span className="modal-kicker">AI 建議預覽</span><h2 id="suggestion-preview-title">加入「{selected.text}」的子節點</h2><p>確認後會一次加入下列 {suggestionSelection.size} 個靈感，之後仍可復原。</p><div>{aiSuggestions.filter((item) => suggestionSelection.has(item.title)).map((item) => <article key={item.title}><strong>{item.title}</strong><span>{item.note}</span></article>)}</div><footer><button onClick={() => setSuggestionPreviewOpen(false)}>返回調整</button><button className="primary" onClick={addSelectedSuggestions}>確認加入</button></footer></section></div>}
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
