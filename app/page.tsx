"use client";

import { useMemo, useRef, useState } from "react";

type NodeItem = {
  id: number;
  parent: number | null;
  text: string;
  note: string;
  x: number;
  y: number;
  tone: "ink" | "coral" | "sage" | "sun";
};

const initialNodes: NodeItem[] = [
  { id: 1, parent: null, text: "打造理想生活", note: "從真正重要的事開始", x: 420, y: 300, tone: "ink" },
  { id: 2, parent: 1, text: "身心健康", note: "每天保留恢復能量的空間", x: 130, y: 125, tone: "coral" },
  { id: 3, parent: 1, text: "創意工作", note: "讓好奇心帶路", x: 720, y: 115, tone: "sage" },
  { id: 4, parent: 1, text: "關係與連結", note: "主動創造深度相處", x: 120, y: 500, tone: "sun" },
  { id: 5, parent: 1, text: "持續學習", note: "每季探索一個新領域", x: 730, y: 500, tone: "coral" },
  { id: 6, parent: 2, text: "晨間散步", note: "20 分鐘，不帶手機", x: 22, y: 25, tone: "coral" },
  { id: 7, parent: 3, text: "每週創作", note: "完成比完美重要", x: 920, y: 25, tone: "sage" },
];

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

export default function Home() {
  const [nodes, setNodes] = useState(initialNodes);
  const [selectedId, setSelectedId] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<NodeItem[][]>([]);
  const [suggestionRound, setSuggestionRound] = useState(0);
  const drag = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const availableSuggestionGroups = suggestionGroups[selected.text] ?? suggestionGroups.default;
  const aiSuggestions = availableSuggestionGroups[suggestionRound % availableSuggestionGroups.length];

  const connections = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const depthOf = (node: NodeItem) => {
      let depth = 0;
      let current: NodeItem | undefined = node;
      while (current?.parent !== null) {
        depth += 1;
        current = byId.get(current.parent);
      }
      return depth;
    };
    return nodes.flatMap((node) => {
      const parent = node.parent === null ? undefined : byId.get(node.parent);
      if (!parent) return [];
      const x1 = parent.x + 90, y1 = parent.y + 35, x2 = node.x + 90, y2 = node.y + 35;
      const length = Math.hypot(x2 - x1, y2 - y1);
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      const thickness = Math.max(4, 10 - (depthOf(node) - 1) * 3);
      return [{ id: `${parent.id}-${node.id}`, x: x1, y: y1, length, angle, thickness, tone: node.tone }];
    });
  }, [nodes]);

  function checkpoint() { setHistory((items) => [...items.slice(-14), nodes]); }

  function addNode(parentId = selectedId, title = "新想法", note = "雙擊節點即可編輯") {
    checkpoint();
    const parent = nodes.find((node) => node.id === parentId) ?? nodes[0];
    const childCount = nodes.filter((node) => node.parent === parent.id).length;
    const nextId = Math.max(...nodes.map((node) => node.id)) + 1;
    const tones: NodeItem["tone"][] = ["coral", "sage", "sun"];
    const next: NodeItem = {
      id: nextId, parent: parent.id, text: title, note,
      x: Math.max(20, Math.min(900, parent.x + (parent.x < 430 ? -210 : 210))),
      y: Math.max(20, Math.min(560, parent.y - 65 + childCount * 115)),
      tone: tones[childCount % tones.length],
    };
    setNodes((items) => [...items, next]);
    setSelectedId(nextId);
    setToast(`已加入「${title}」`);
    window.setTimeout(() => setToast(""), 1800);
  }

  function editNode(node: NodeItem) {
    const text = window.prompt("編輯節點標題", node.text);
    if (!text?.trim()) return;
    const note = window.prompt("補充說明", node.note) ?? node.note;
    checkpoint();
    setNodes((items) => items.map((item) => item.id === node.id ? { ...item, text: text.trim(), note } : item));
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setNodes(previous);
    setHistory((items) => items.slice(0, -1));
    setSelectedId(previous[0]?.id ?? 1);
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

  function safeFilename(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 48) || "心智圖";
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
    const roots = nodes.filter((node) => node.parent === null);
    const lines = ["# 靈感樹心智圖", "", `> 匯出時間：${new Date().toLocaleString("zh-TW")}`, ""];
    function appendNode(node: NodeItem, depth: number) {
      lines.push(`${"#".repeat(Math.min(depth + 1, 6))} ${node.text.replace(/\n/g, " ")}`, "");
      if (node.note.trim()) lines.push(node.note.trim(), "");
      nodes.filter((item) => item.parent === node.id).forEach((child) => appendNode(child, depth + 1));
    }
    roots.forEach((root) => appendNode(root, 1));
    downloadFile(["\uFEFF", lines.join("\n")], "text/markdown;charset=utf-8", "md");
    setExportOpen(false);
    setToast("Markdown 已下載");
    window.setTimeout(() => setToast(""), 1800);
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
        let depth = 1;
        let ancestor = parent;
        while (ancestor.parent !== null) {
          depth += 1;
          ancestor = nodes.find((item) => item.id === ancestor.parent) ?? ancestor;
        }
        const x1 = ox + (parent.x + 90) * scale, y1 = oy + (parent.y + 35) * scale;
        const x2 = ox + (node.x + 90) * scale, y2 = oy + (node.y + 35) * scale;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const normalX = -Math.sin(angle), normalY = Math.cos(angle);
        const startHalf = Math.max(2, (10 - (depth - 1) * 3) * scale / 2);
        const endHalf = Math.max(.7, startHalf * .18);
        ctx.fillStyle = color; ctx.globalAlpha = .72; ctx.beginPath();
        ctx.moveTo(x1 + normalX * startHalf, y1 + normalY * startHalf);
        ctx.lineTo(x2 + normalX * endHalf, y2 + normalY * endHalf);
        ctx.lineTo(x2 - normalX * endHalf, y2 - normalY * endHalf);
        ctx.lineTo(x1 - normalX * startHalf, y1 - normalY * startHalf);
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">靈</span><span>靈感樹</span><small>AI MIND STUDIO</small></div>
        <div className="document-title"><span className="status-dot" />我的理想生活 <span className="saved">互動草稿</span></div>
        <div className="top-actions">
          <button className="icon-button" onClick={undo} disabled={!history.length} aria-label="復原">↶</button>
          <div className="export-wrap">
            <button className="export-button" onClick={() => setExportOpen((open) => !open)} aria-haspopup="menu" aria-expanded={exportOpen} disabled={exporting}>{exporting ? "匯出中…" : "匯出"} <span>↓</span></button>
            {exportOpen && <div className="export-menu" role="menu">
              <button role="menuitem" onClick={exportMarkdown}><span className="file-icon">M↓</span><span><strong>Markdown</strong><small>保留節點階層與說明</small></span></button>
              <button role="menuitem" onClick={exportPdf}><span className="file-icon pdf">P↓</span><span><strong>PDF 文件</strong><small>輸出完整心智圖畫布</small></span></button>
              <button role="menuitem" onClick={exportPng}><span className="file-icon png">PNG</span><span><strong>PNG 圖形檔</strong><small>高解析度完整心智圖</small></span></button>
            </div>}
          </div>
          <button className="share-button" onClick={() => { navigator.clipboard?.writeText(location.href); setToast("連結已複製"); }}>分享想法 <span>↗</span></button>
        </div>
      </header>

      <section className="workspace">
        <nav className="toolrail" aria-label="心智圖工具">
          <button className="tool active" aria-label="選取工具">↖</button>
          <button className="tool" onClick={() => addNode()} aria-label="新增節點">＋</button>
          <button className="tool" aria-label="加入連線">⌁</button>
          <span className="rail-rule" />
          <button className="tool" aria-label="顏色">◉</button>
          <button className="tool" aria-label="文字">T</button>
          <div className="rail-help"><button className="tool" aria-label="鍵盤快捷鍵">⌨</button><button className="tool" aria-label="說明">?</button></div>
        </nav>

        <div className="canvas" onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
          <div className="canvas-hint">拖曳節點整理思緒 · 雙擊編輯內容</div>
          <div className="map-stage" style={{ transform: `scale(${zoom / 100})` }}>
            {connections.map((line) => <span key={line.id} className={`connection ${line.tone}`} style={{ left: line.x, top: line.y, width: line.length, height: line.thickness, marginTop: -line.thickness / 2, transform: `rotate(${line.angle}deg)` }} />)}
            {nodes.map((node) => (
              <article
                key={node.id}
                className={`mind-node ${node.tone} ${node.id === selectedId ? "selected" : ""}`}
                style={{ left: node.x, top: node.y }}
                onPointerDown={(event) => { checkpoint(); setSelectedId(node.id); const rect = event.currentTarget.getBoundingClientRect(); drag.current = { id: node.id, ox: (event.clientX - rect.left) * (100 / zoom), oy: (event.clientY - rect.top) * (100 / zoom) }; event.currentTarget.setPointerCapture(event.pointerId); }}
                onDoubleClick={() => editNode(node)}
              >
                <div><h3>{node.text}</h3><p>{node.note}</p></div>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addNode(node.id); }} aria-label={`在${node.text}下新增節點`}>＋</button>
              </article>
            ))}
          </div>
          <div className="zoom-control"><button onClick={() => setZoom(Math.max(70, zoom - 10))}>−</button><span>{zoom}%</span><button onClick={() => setZoom(Math.min(130, zoom + 10))}>＋</button><button onClick={() => setZoom(100)}>◎</button></div>
        </div>

        <aside className="ai-panel">
          <div className="ai-header"><div className="ai-orb">✦</div><div><span>AI 思考夥伴</span><small>隨時為你展開更多可能</small></div><span className="online">在線</span></div>
          <div className="ai-content">
            <p className="eyebrow">目前聚焦</p>
            <div className="focus-card"><span className={`focus-dot ${selected.tone}`} /><div><strong>{selected.text}</strong><p>{selected.note}</p></div></div>
            <div className="suggestion-heading"><div><span className="spark">✦</span><strong>可以再往哪裡想？</strong></div><button data-testid="rotate-suggestions" onClick={() => { setSuggestionRound((round) => round + 1); setToast("已換一組靈感"); window.setTimeout(() => setToast(""), 1800); }}>換一組 ↻</button></div>
            <div className="suggestions" data-testid="ai-suggestions" aria-live="polite" key={`${selected.id}-${suggestionRound}`}>
              {aiSuggestions.map((suggestion, index) => <button className="suggestion" key={suggestion.title} onClick={() => addNode(selected.id, suggestion.title, suggestion.note)}><span className="suggestion-number">0{index + 1}</span><div><strong>{suggestion.title}</strong><p>{suggestion.note}</p></div><span className="add-suggestion">＋</span></button>)}
            </div>
            <div className="quick-row"><button onClick={() => setPrompt("把這個想法拆成三個具體步驟")}>拆解步驟</button><button onClick={() => setPrompt("找出我還沒想到的風險與盲點")}>找出盲點</button><button onClick={() => setPrompt("提供一個完全不同的觀點")}>換個角度</button></div>
          </div>
          <div className="prompt-box"><label htmlFor="ai-prompt">和 AI 一起想</label><div><textarea id="ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(); } }} placeholder={`例如：幫我延伸「${selected.text}」的具體做法…`} /><button onClick={askAI} aria-label="送出提示">↑</button></div><small>Enter 送出 · Shift + Enter 換行</small></div>
        </aside>
      </section>
      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
