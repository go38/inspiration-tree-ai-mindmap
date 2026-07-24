"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { sortWorkspaceMapsByRecent, type WorkspaceMapSummary } from "../lib/workspace";

type WorkspaceTab = "active" | "archived";

function updatedLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近更新";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function MapWorkspace({
  initialMaps,
  displayName,
}: {
  initialMaps: WorkspaceMapSummary[];
  displayName: string;
}) {
  const [maps, setMaps] = useState(() => sortWorkspaceMapsByRecent(initialMaps));
  const [tab, setTab] = useState<WorkspaceTab>("active");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const visibleMaps = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-TW");
    return sortWorkspaceMapsByRecent(maps
      .filter((map) => tab === "archived" ? map.archivedAt !== null : map.archivedAt === null)
      .filter((map) => !normalized || map.title.toLocaleLowerCase("zh-TW").includes(normalized)));
  }, [maps, query, tab]);
  const activeCount = maps.filter((map) => map.archivedAt === null).length;
  const archivedCount = maps.length - activeCount;

  function showMessage(value: string) {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 2200);
  }

  async function createMap() {
    const title = newTitle.trim() || "未命名心智圖";
    setBusyId("create");
    try {
      const response = await fetch("/api/workspace/maps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await response.json() as { map?: WorkspaceMapSummary; error?: string };
      if (!response.ok || !data.map) {
        showMessage(data.error || "無法建立地圖");
        return;
      }
      window.location.href = `/m/${data.map.id}`;
    } catch {
      showMessage("網路連線失敗，請稍後再試");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicateMap(map: WorkspaceMapSummary) {
    setBusyId(map.id);
    try {
      const response = await fetch("/api/workspace/maps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceMapId: map.id }),
      });
      const data = await response.json() as { map?: WorkspaceMapSummary; error?: string };
      if (!response.ok || !data.map) {
        showMessage(data.error || "無法複製地圖");
        return;
      }
      setMaps((items) => sortWorkspaceMapsByRecent([data.map!, ...items]));
      setTab("active");
      showMessage(`已複製「${map.title}」`);
    } catch {
      showMessage("網路連線失敗，請稍後再試");
    } finally {
      setBusyId(null);
    }
  }

  async function patchMap(map: WorkspaceMapSummary, patch: { title?: string; archived?: boolean }) {
    setBusyId(map.id);
    try {
      const response = await fetch(`/api/workspace/maps/${map.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await response.json() as { map?: WorkspaceMapSummary; error?: string };
      if (!response.ok || !data.map) {
        showMessage(data.error || "無法更新地圖");
        return;
      }
      setMaps((items) => sortWorkspaceMapsByRecent(items.map((item) => item.id === map.id ? data.map! : item)));
      setEditingId(null);
      showMessage(patch.archived === true ? "地圖已封存" : patch.archived === false ? "地圖已恢復" : "名稱已更新");
    } catch {
      showMessage("網路連線失敗，請稍後再試");
    } finally {
      setBusyId(null);
    }
  }

  function beginRename(map: WorkspaceMapSummary) {
    setEditingId(map.id);
    setEditingTitle(map.title);
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <Link className="workspace-brand" href="/"><span>靈</span><strong>靈感樹</strong></Link>
        <div><small>個人地圖工作區</small><strong>{displayName}</strong></div>
        <Link className="workspace-back" href="/">回到目前草稿</Link>
      </header>

      <section className="workspace-content">
        <div className="workspace-heading">
          <div>
            <h1>我的心智圖</h1>
            <p>把不同主題分開整理，最近更新的地圖會排在最前面。</p>
          </div>
          <button className="workspace-create" onClick={() => setCreating(true)}>＋ 建立地圖</button>
        </div>

        {creating && (
          <form className="workspace-create-form" onSubmit={(event) => { event.preventDefault(); void createMap(); }}>
            <label htmlFor="new-map-title">新地圖名稱</label>
            <input id="new-map-title" autoFocus maxLength={120} value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="例如：第三季內容計畫" />
            <button type="submit" disabled={busyId === "create"}>{busyId === "create" ? "建立中…" : "建立並開始整理"}</button>
            <button type="button" onClick={() => { setCreating(false); setNewTitle(""); }}>取消</button>
          </form>
        )}

        <div className="workspace-controls">
          <div className="workspace-tabs" role="tablist" aria-label="地圖狀態">
            <button role="tab" aria-selected={tab === "active"} className={tab === "active" ? "active" : ""} onClick={() => setTab("active")}>使用中 <span>{activeCount}</span></button>
            <button role="tab" aria-selected={tab === "archived"} className={tab === "archived" ? "active" : ""} onClick={() => setTab("archived")}>已封存 <span>{archivedCount}</span></button>
          </div>
          <label className="workspace-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋地圖名稱" aria-label="搜尋個人地圖" /></label>
        </div>

        {visibleMaps.length ? (
          <div className="map-list">
            {visibleMaps.map((map) => (
              <article className="map-row" key={map.id}>
                <div className="map-row-mark" aria-hidden="true">枝</div>
                {editingId === map.id ? (
                  <form className="map-rename" onSubmit={(event) => { event.preventDefault(); const title = editingTitle.trim(); if (title) void patchMap(map, { title }); }}>
                    <input autoFocus maxLength={120} value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} aria-label={`重新命名${map.title}`} />
                    <button type="submit" disabled={busyId === map.id}>儲存</button>
                    <button type="button" onClick={() => setEditingId(null)}>取消</button>
                  </form>
                ) : (
                  <a className="map-main" href={`/m/${map.id}`}>
                    <strong>{map.title}</strong>
                    <span>{map.nodeCount} 個節點 · {updatedLabel(map.updatedAt)}更新</span>
                  </a>
                )}
                {editingId !== map.id && (
                  <div className="map-actions">
                    <button onClick={() => beginRename(map)}>重新命名</button>
                    <button onClick={() => void duplicateMap(map)} disabled={busyId === map.id}>複製</button>
                    <button onClick={() => void patchMap(map, { archived: map.archivedAt === null })} disabled={busyId === map.id}>{map.archivedAt === null ? "封存" : "恢復"}</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="workspace-empty">
            <span aria-hidden="true">☘</span>
            <h2>{query ? "找不到符合的地圖" : tab === "archived" ? "還沒有封存的地圖" : "建立第一張個人地圖"}</h2>
            <p>{query ? "試試其他關鍵字。" : tab === "archived" ? "封存後的地圖會安全保留在這裡。" : "每張地圖都有獨立內容，並會自動保存。"}</p>
          </div>
        )}
      </section>
      {message && <div className="toast" role="status">✓ {message}</div>}
    </main>
  );
}
