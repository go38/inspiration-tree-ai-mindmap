# 靈感樹｜後續開發路線圖

> 文件版本：1.0
> 建立日期：2026-07-15
> 對應產品需求：見 [PRD.md](./PRD.md) §12 路線圖
> 目的：把 PRD 的方向拆成可逐項核可、可驗收的開發任務，並補上「地基」批次。

本路線圖依優先序分批，每項附上要動的檔案、做法、驗收條件與粗估工作量。
核心原則：**先抽純函式、補測試，再改行為**，讓每次修改都有測試護欄。

---

## 批次 0：先讓專案「健康」（地基，約 0.5 天）

> 目標：`npm test` 由紅轉綠、build 可信、清掉模板雜訊。
> 現況：`tests/rendered-html.test.mjs` 仍是 starter 模板殘留，斷言 loading skeleton 與
> `app/_sites-preview/`，與現行心智圖 App 完全不符，`npm test` 必然失敗；真正的心智圖
> 邏輯零測試覆蓋。這批不做完，後面每個功能都難以驗收。

| # | 任務 | 要動的檔案 | 做法 | 驗收條件 |
|---|---|---|---|---|
| 0-1 | 重寫失效測試 | `tests/rendered-html.test.mjs` | 刪掉所有 skeleton / `_sites-preview` / `codex-preview` 斷言。改為驗證 SSR 後 HTML 含心智圖標題、初始節點文字、工具列 aria-label | `npm test` 通過，且測的是真實 App |
| 0-2 | 加核心邏輯單元測試 | 新增 `tests/mindmap.test.mjs`；建議把純函式從 `app/page.tsx` 抽到 `app/lib/mindmap.ts` | 測後代連鎖刪除、`addNode` id 遞增、`safeFilename`、undo/redo 狀態轉移 | 4+ 測試通過 |
| 0-3 | 確認 build | — | 本機跑 `npm run build`（排除沙箱可能遇到的 `next.config.mjs` transport 逾時，判斷是否為環境問題） | build 成功、無框架錯誤畫面 |
| 0-4 | 清理 scaffolding | `db/`、`examples/`、`drizzle/`、`worker/` | 不必刪，但在 README 註明「保留供 P1 D1 之用」，避免誤導 | README 有說明 |

---

## 批次 1：可持續使用 = P0（最高 CP 值，約 1.5–2 天）

> 目標：把「原型」變成「能天天用的工具」。目前所有狀態存在 `useState`，重整即全失，
> 這是最大的產品缺口。

| # | 任務 | 要動的檔案 | 做法 | 驗收條件 |
|---|---|---|---|---|
| 1-1 | 本機自動保存/還原（SAV-01） | `app/page.tsx` + 新 `app/lib/storage.ts` | `useEffect` 監看 `nodes/selectedId`，debounce 寫入 localStorage；載入時還原，帶版本號與「重設為範例」按鈕 | 重整後草稿還原；PRD §14 第 1 項打勾 |
| 1-2 | 修 undo「選取即記歷史」bug | `app/page.tsx` 的 `onPointerDown`、`checkpoint` | 拖曳開始先暫存位置，只有真正位移才 commit checkpoint；純選取不進歷史 | undo 一律還原有意義的變更，不會只還原選取 |
| 1-3 | 內嵌節點編輯取代 `window.prompt` | `app/page.tsx` 的 `editNode` + CSS | 雙擊就地編輯標題與說明，Esc 取消、Enter/失焦儲存；空標題不送出 | 符合 NOD-02，且無阻塞式原生對話框 |
| 1-4 | 自動布局 / 避免重疊（CAN-06） | 新 `app/lib/layout.ts` | 實作放射/樹狀布局（依層級角度分佈），工具列加「整理」鍵，可 undo | 100 節點不重疊、可復原 |
| 1-5 | 基本鍵盤操作（P1 提前） | `app/page.tsx` | Delete=移除、Cmd/Ctrl+Z=undo、Shift+Cmd+Z=redo、Tab 切換焦點節點 | 鍵盤可完成核心編輯（PRD §14 第 2 項） |

---

## 批次 2：無登入共享地圖（團隊共看同一張圖，約 3–5 天）

> 目標：讓小團隊「開同一個網址就看到同一張圖」。決策定案（2026-07-15）：**留在 OpenAI
> Sites + 啟用 D1**，不搬雲、**不做登入**——Sites 的 workspace 存取原則已負責「誰能進站」，
> 地圖以不可猜的網址定位即可共享。先做「非即時共享」（最新儲存版本 + 版本樂觀鎖防覆蓋）；
> 即時協作留到批次 5。
>
> 架構要點：整張圖以單一 JSON 欄位存進 D1（此規模最簡單、夠用），`version` 欄位既是衝突
> 偵測，也是日後升級即時協作的同步基準。

| # | 任務 | 狀態 | 要動的檔案 | 驗收條件 |
|---|---|---|---|---|
| 2-1 | D1 schema + migration | ✅ 完成 | `db/schema.ts`、`.openai/hosting.json`、`drizzle` | migration 產出、本機 D1 建表（SQL 層已驗證） |
| 2-2 | 地圖 CRUD API | ✅ 完成 | `app/api/maps/route.ts`、`app/api/maps/[id]/route.ts` | 端到端冒煙測試綠燈（201→GET→200→409→400） |
| 2-3 | `/m/[id]` 共享頁 | ✅ 完成 | `app/m/[id]/page.tsx` | 由 D1 載入、共用 `MindMapStudio` 元件 |
| 2-4 | localStorage 分模式 | ✅ 完成 | `app/MindMapStudio.tsx` | 本機頁用 localStorage、共享頁以 D1 為準（雲端離線緩衝留待日後） |
| 2-5 | 衝突提示 UI | ✅ 完成 | `app/MindMapStudio.tsx` | 409 顯示橫幅：載入最新版／用我的版本覆蓋 |
| 2-6 | 抽出共用元件 | ✅ 完成 | `app/MindMapStudio.tsx`、`app/lib/sampleMap.ts`、`app/page.tsx` | 本機頁與共享頁共用同一 studio，行為由測試護欄守護 |

> 進度（2026-07-15）：2-1～2-6 已實作於 `batch-2-shared-maps`，資料層與 API 已端到端驗證；
> UI 重構待一次本機 `npm run build` + `npm run dev` 端到端確認。首頁「建立共享連結」會把目前
> 地圖 POST 成雲端副本並導向 `/m/[id]`，即團隊共享入口。

> 免費彩蛋：即使不做登入，workspace 網站仍會自動帶 `oai-authenticated-user-email` header，
> 可零成本填 `updatedBy`（顯示「最後由 ○○○ 編輯」），日後要做「我的地圖列表」也能直接用。

---

## 批次 3：真 AI 串接（約 2–3 天）

> 目前 `suggestionGroups` 是硬編碼，只有 `default`、`身心健康`、`創意工作` 三組有資料，其餘
> 節點都退回 default。此批與批次 2 獨立，可並行或之後做。

| # | 任務 | 要動的檔案 | 做法 | 驗收條件 |
|---|---|---|---|---|
| 3-1 | 伺服器端 AI API（AI-05/06） | 新 `app/api/suggest/route.ts` | 收 {當前節點, 祖先路徑, 使用者提示}，呼叫模型要求結構化 JSON（多個 `{title, note}`），server 驗證後回傳；金鑰只在 server（Workers secret）；含逾時/配額/格式錯誤處理 | 取代硬編碼 `suggestionGroups`；錯誤有可理解提示 |

---

## 批次 4：帳號與個人化（選配，視需求再啟動）

- ChatGPT SIWC 登入（用現成 `app/chatgpt-auth.ts`，`requireChatGPTUser` + `force-dynamic`）。
- 「我的地圖」列表——可先用 `oai-authenticated-user-email` header 分組，免真的建 auth。
- 編輯者標記、地圖權限（誰可編輯 / 誰唯讀）。

## 批次 5：即時協作與進階分享 = P2（大工程）

- Durable Objects + WebSocket 即時同步、多人游標。
- CRDT/OT 衝突解析（承接批次 2 的 `version` 基準）。
- 唯讀分享連結（SHR-02）、權限/到期/撤銷、留言與版本歷史。
- JSON／Markdown 匯入與範本庫。

---

## 建議執行順序

1. **批次 0 → 1 已完成**（測試護欄 + 本機自動保存），已合併進 `main`。
2. **批次 2（無登入共享地圖）為目前主線**：本機可用 vite 模擬的 D1 綁定開發，發佈時才接真 D1。
3. **批次 3（真 AI）可與批次 2 並行或之後**，彼此獨立。
4. 每次改行為前，先確保測試護欄到位；共享頁的 API 需補 D1 讀寫與衝突測試。
