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

## 批次 2：真 AI 與帳號資料 = P1（約 3–5 天）

> 目標：把假 AI 換成真 AI、資料上雲。目前 `suggestionGroups` 是硬編碼，只有 `default`、
> `身心健康`、`創意工作` 三組有資料，其餘節點都退回 default。牽涉後端與金鑰，建議批次 1
> 穩定後再做。2-1 可獨立先上，不必等帳號系統。

| # | 任務 | 要動的檔案 | 做法 | 驗收條件 |
|---|---|---|---|---|
| 2-1 | 伺服器端 AI API（AI-05/06） | 新 `app/api/suggest/route.ts` | 收 {當前節點, 祖先路徑, 使用者提示}，呼叫模型要求結構化 JSON（多個 `{title, note}`），server 驗證後回傳；金鑰只在 server；含逾時/配額/格式錯誤處理 | 取代硬編碼 `suggestionGroups`；錯誤有可理解提示 |
| 2-2 | ChatGPT 登入 | 用現成 `app/chatgpt-auth.ts` | 帳號頁/個人心智圖列表加 `requireChatGPTUser`，並 `export const dynamic = "force-dynamic"` | 匿名頁維持匿名、登入頁受保護 |
| 2-3 | D1 雲端保存（SAV-02/03） | `db/schema.ts`、`.openai/hosting.json` | 依 PRD §8.2 建表（MindMap / MindMapNode / ShareLink / AIRequest），hosting 開 d1，`npm run db:generate` 產 migration；含版本號防覆蓋 | 登入者可建立/命名/管理多份心智圖 |
| 2-4 | 重構 page.tsx | `app/page.tsx` → hooks/元件 | 抽 `useMindMap`、`useHistory`、`<MindNode>`、`<Connections>`、`<AiPanel>`；451 行單檔拆分 | 邏輯分層、無行為回歸（靠批次 0 測試守護） |

---

## 批次 3：分享與協作 = P2

維持 PRD 規劃：唯讀分享連結（SHR-02）、權限/到期/撤銷、留言與版本歷史、
多人即時協作、JSON/Markdown 匯入與範本庫。

---

## 建議執行順序

1. **批次 0 → 1 優先**：目前 `npm test` 是紅的、資料不落地，這兩件是「沙上蓋樓」的根因。
   合計約 2 天，就能把專案從 demo 推進到可日用，風險最低。
2. **批次 2 的 AI（2-1）可獨立先上**，不必等帳號/雲端（2-2/2-3）。
3. 每次改行為前，先確保批次 0 的測試護欄到位。
