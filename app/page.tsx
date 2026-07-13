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

const suggestions: Record<string, { title: string; note: string }[]> = {
  default: [
    { title: "設計每週回顧", note: "固定 30 分鐘整理進展與下一步" },
    { title: "定義成功畫面", note: "寫下三個月後想看見的具體改變" },
    { title: "建立微小習慣", note: "把第一步縮小到兩分鐘就能開始" },
  ],
  身心健康: [
    { title: "睡眠儀式", note: "睡前一小時降低光線與資訊刺激" },
    { title: "能量日誌", note: "記錄一週內提升與消耗能量的活動" },
    { title: "每週運動約會", note: "預先安排兩次喜歡的身體活動" },
  ],
  創意工作: [
    { title: "靈感收件匣", note: "把碎片想法集中到單一入口" },
    { title: "無評判草稿", note: "先用 20 分鐘大量產出，再進行篩選" },
    { title: "跨域刺激", note: "每週從陌生領域帶回一個新觀點" },
  ],
};

export default function Home() {
  const [nodes, setNodes] = useState(initialNodes);
  const [selectedId, setSelectedId] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState<NodeItem[][]>([]);
  const drag = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const selected = nodes.find((node) => node.id === selectedId) ?? nodes[0];
  const aiSuggestions = suggestions[selected.text] ?? suggestions.default;

  const connections = useMemo(() => nodes.flatMap((node) => {
    const parent = nodes.find((item) => item.id === node.parent);
    if (!parent) return [];
    const x1 = parent.x + 90, y1 = parent.y + 35, x2 = node.x + 90, y2 = node.y + 35;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return [{ id: `${parent.id}-${node.id}`, x: x1, y: y1, length, angle, tone: node.tone }];
  }), [nodes]);

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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">靈</span><span>靈感樹</span><small>AI MIND STUDIO</small></div>
        <div className="document-title"><span className="status-dot" />我的理想生活 <span className="saved">互動草稿</span></div>
        <div className="top-actions">
          <button className="icon-button" onClick={undo} disabled={!history.length} aria-label="復原">↶</button>
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
            {connections.map((line) => <span key={line.id} className={`connection ${line.tone}`} style={{ left: line.x, top: line.y, width: line.length, transform: `rotate(${line.angle}deg)` }} />)}
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
            <div className="suggestion-heading"><div><span className="spark">✦</span><strong>可以再往哪裡想？</strong></div><button onClick={() => setToast("已換一組靈感")}>換一組 ↻</button></div>
            <div className="suggestions">
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
