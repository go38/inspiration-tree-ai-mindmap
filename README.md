# 靈感樹｜AI 心智圖工作室

一個可以自由整理、拖曳及延伸想法的互動式心智圖網站，並提供靈感收件匣、AI 腦力激盪、自動擴寫與概念解讀，協助思路持續前進。

- 線上版本：https://inspiration-tree-ai-mindmap.go38.chatgpt.site
- 目前產品版本：`v0.28.0`
- 存取狀態：公開 Beta
- 產品需求文件：[PRD.md](./PRD.md)
- 開發路線圖：[ROADMAP.md](./ROADMAP.md)
- 完整開發紀錄：[DEVELOPMENT.md](./DEVELOPMENT.md)
- 版本紀錄：[CHANGELOG.md](./CHANGELOG.md)
- 版本管理規範：[VERSIONING.md](./VERSIONING.md)

## 本機啟動

### 環境需求

- Node.js `>=22.13.0`

### 啟動方式

```bash
npm install
npm run dev
npm run build
npm run benchmark
```

This starter does not use `wrangler.jsonc`.

## 專案結構

- `app/page.tsx`：首頁與本機草稿入口
- `app/MindMapStudio.tsx`：心智圖與 AI 協作互動
- `app/maps/`：登入使用者的個人地圖工作區
- `app/globals.css`：網站視覺與響應式版面
- `app/layout.tsx`：網站中繼資料與語言設定
- `app/lib/mindmap.ts`：心智圖純函式（節點/歷史/匯出邏輯），與 UI 解耦以利單元測試
- `app/lib/inbox.ts`：靈感種子的解析、去重、版本化本機保存與 AI 建議轉換
- `app/lib/viewState.ts`：依地圖隔離的版本化本機檢視狀態（目前保存分支收合）
- `app/lib/reuse.ts`：完整子樹複製與內建分支範本
- `app/lib/importMap.ts`：JSON／Markdown 匯入、預覽與錯誤定位
- `app/lib/preferences.ts`：版本化裝置端使用者偏好
- `app/lib/workspace.ts`：個人地圖所有權、建立、重新命名與封存驗證邏輯
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development

> `db/schema.ts`、`drizzle/`、`drizzle.config.ts` 與 D1 綁定已用於無登入共享地圖及身份隔離的個人地圖；
> `examples/d1/`、`worker/index.ts` 與 R2 scaffolding 則保留供後續資料能力使用。
> 詳見 [ROADMAP.md](./ROADMAP.md) 批次 2。

## v0.28.0 重點

- 個人地圖新增伺服器強制的分享權限，可選唯讀、可留言或可編輯，且預設不公開。
- 擁有者可隨時停用或重新產生分享連結；舊網址會立即失效。
- 訪客頁面清楚標示角色；唯讀與可留言連結不能寫入，編輯連結仍受樂觀鎖保護。

## v0.27.0 重點

- PDF 可直接交給 AI 閱讀；公開 HTTPS 網站會先安全擷取正文；影音則支援貼上或上傳 TXT、Markdown、SRT、VTT 逐字稿。
- 三種來源共用「整理 → 預覽 → 確認建立」流程，AI 不會在確認前修改目前地圖。
- 網站來源拒絕內網位址與重新導向；PDF 上限 8MB、正文與逐字稿上限 80,000 字元。

## v0.26.0 重點

- 輸入自然語言主題即可產生完整心智圖草稿，支援最多 12、24、40 個節點的精簡、標準與深入模式。
- AI 回應必須通過唯一中心、父節點先存在、識別字唯一、色調與節點上限驗證。
- 草稿先顯示標題、摘要與完整階層；使用者確認後才取代目前地圖，並保留一次復原。

## v0.25.0 重點

- 範本商城提供 11 個精選結構，涵蓋目標、專案、教育、研究、行銷、敏捷、AI 與生活規劃。
- 可依分類或關鍵字搜尋，預覽完整節點結構、作者、標籤與節點數，再一鍵套用到目前節點。
- 範本資料契約包含分類、標籤、作者與精選狀態，可在後續直接銜接公開投稿與遠端目錄。

## v0.24.0 重點

- 右鍵任何畫布或大綱節點即可開啟 AI Assistant，直接執行展開想法、找風險、SWOT、OKR、Brainstorm、簡化、英譯與摘要。
- 節點操作列提供「✦」替代入口；分析結果先在既有 AI 面板預覽，可逐項／整組加入，或寫回節點說明。
- 八種指令沿用伺服器端結構化輸出、節點 ID 白名單與既有復原機制，不讓 AI 未經確認直接改圖。

## v0.23.0 重點

- 可複製目前節點與完整子樹，或套用 SMART 目標、決策分析、每週回顧範本；所有操作都可一次復原。
- 支援 JSON／Markdown 檔案與貼上匯入，確認前顯示格式、標題、節點數，並將錯誤定位到行或節點。
- 裝置端保存預設檢視、AI 面板、縮放與減少動態偏好，並提供一鍵重設；JSON 匯出可完整往返。

## v0.22.0 重點

- 新增可重複執行的 100／300／500 節點效能基準，涵蓋拖曳狀態更新、搜尋、文字輸入、畫面衍生資料與樹狀布局。
- 搜尋改用延後值維持輸入優先度；大綱階層、子節點數量與同層資料改為共用索引，移除大型地圖中的重複全圖掃描。
- 本機開發可使用 `/performance-benchmark?nodes=500` 進行實際畫面驗證；正式環境不公開此入口。

## v0.21.0 重點

- 觸控裝置上所有主要操作至少 44×44px；節點操作列改為浮出於選取卡片下方。
- 可用 Tab 聚焦節點、方向鍵移動（Shift 加大步距），每個拖曳操作都有鍵盤或按鈕替代路徑。
- 焦點與選取外框提高對比，200% 瀏覽器縮放下不再裁切面板。

## v0.20.0 重點

- 心智圖與樹狀畫布支援滑鼠滾輪／觸控板縮放與觸控螢幕雙指縮放，縮放錨點為游標或雙指中心。

## v0.19.1 重點

- AI 擴寫草稿面板加入清楚且穩定的垂直捲動軸，桌面與手機都能完整瀏覽並點選第五組及後續建議。

## v0.19.0 重點

- 「適合畫面」會扣除工具列與手機 AI 面板的安全範圍，以中心主題為錨點完整顯示可見節點；大型地圖最低可縮至 10%。
- 智慧整理依子樹規模分配扇區，中心、第一層與第二層以後分別使用大、中、小卡片，畫面、碰撞、連線與匯出共用同一尺寸規格。
- 選取具有子節點的節點時會顯示明確的「收合 N／展開 N」控制；狀態依地圖保存在目前裝置，不會同步或建立復原紀錄。

## v0.18.1 重點

- AI 擴寫草稿支援連續挑選多項；加入一項後仍保留原節點焦點與整組草稿。
- 已加入的草稿會顯示完成狀態並停止重複點選，其餘建議可繼續逐項加入同一節點。

## v0.18.0 重點

- 智慧整理改用環狀扇區，節點平均分散到中心四周。
- 心智圖連線從卡片邊界出入，整理後不交叉、不堆疊在節點中心。
- 樹狀檢視加入木質漸層、樹皮紋理、枝條輪廓與自然分叉。

## v0.17.0 重點

- 新增「靈感收件匣」：可貼上多行筆記或快速輸入零碎想法，每行先形成一顆尚未分類的種子。
- 支援「標題｜補充」自動拆分、項目符號清理、重複想法過濾，以及每張心智圖獨立的裝置端保存。
- 種子可選擇任一節點作為目的分支，按下「種到分支」才建立正式節點，並沿用既有復原與自動儲存。
- 「AI 幫我想」會依目前節點與輸入方向進行開放式腦力激盪；產生的內容先進收件匣，不會直接改動心智圖。

## v0.16.0 重點

- 心智圖拖曳改為以 `requestAnimationFrame` 合併高頻座標更新，拖曳期間停用位置動畫，節點可立即跟隨滑鼠。
- 拖曳開始時加入文字選取防護與小幅移動門檻，避免誤選整片內容或純點選產生無意義位置變更。
- 樹狀檢視現在可拖曳節點微調樹冠；偏移量與心智圖座標分離，樹枝會同步重繪，智慧整理可恢復自動樹冠。

## v0.15.0 重點

- AI 思考助手新增「自動擴寫」，會依目前節點、上層脈絡與既有子節點生成互補草稿，可逐一或一次全部加入心智圖。
- 一次加入整組擴寫只建立一筆歷史，完成後自動整理畫布；若不符合需求可直接復原。
- 新增「概念解讀」，以白話整理節點定義、核心重點、圖中關聯與延伸問題，並可將精簡摘要設為節點說明。

## v0.14.0 重點

- 非中心節點可透過卡片內的「移植」操作，連同完整子樹移到另一個安全父節點；目前父節點、節點自身與後代節點不會成為非法目標。
- 大綱模式加入縮排與凸排，可快速把分支移入前一個同層節點，或移回上一層；手機同樣提供明確按鈕。
- 所有層級變更會自動整理畫布，且整次操作只建立一筆可復原／重做的歷史。

## v0.13.0 重點

- 新增「樹狀」檢視：中心主題位於底部，厚實主幹向上延伸，彩色粗枝在不同高度分岔並逐步收細，節點依父子階層形成自然樹冠。
- 心智圖、樹狀與大綱共用同一份節點資料；切換樹狀檢視不會改寫原本的自由畫布位置。
- 樹狀檢視支援搜尋、分支收合、節點編輯／新增、智慧整理、縮放、平移及 PNG／PDF 匯出。

## v0.12.0 重點

- 支援 `Cmd/Ctrl+Z` 復原，以及 `Cmd/Ctrl+Shift+Z`、`Ctrl+Y` 重做；文字輸入框維持瀏覽器原生復原行為。
- 雲端同步失敗或離線時，未同步內容會先保存為地圖專屬的裝置草稿。
- 重新連線後會自動重試，也可從狀態提示手動重新同步；重開頁面可復原未同步草稿。

## v0.11.1 重點

- 節點的編輯、收合、智慧整理與新增操作改為卡片內的緊湊操作列，不再突出節點邊界。
- 桌面採 24px 圓形按鈕，手機採 28px，並在滑入、選取或鍵盤聚焦時提高辨識度。

## v0.11.0 重點

- 畫布提供「智慧整理」，可整理整張圖；有子節點的節點可只整理該分支。
- 自動布局會固定中心／分支根節點、維持左右階層方向、避開其他節點，且整次操作只建立一筆可復原紀錄。
- `/maps` 提供身份綁定的個人地圖工作區，可建立、重新命名、複製、搜尋、封存及恢復地圖，並依最近更新排序。
- 個人地圖以 ChatGPT 使用者 email 在伺服器端隔離；既有無擁有者共享連結維持相容。

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## 常用指令

- `npm run dev`: start local development（預設 http://localhost:3000）
- `npm run build`: verify the vinext build output
- `npm test`: build then run every `tests/*.test.mjs` suite
- `npm run db:generate`: generate Drizzle migrations after schema changes
- `npm run db:migrate:local`: 套用 migration 到本機模擬的 D1（`.wrangler` 狀態）

## 共享地圖 API（本機驗證）

`mind_maps` 表存在真正的 D1；本機 `npm run dev` 用 miniflare 模擬綁定，但模擬的 D1
一開始是空的，需先套用 migration：

```bash
npm run db:generate     # 首次或改 schema 後：產生 drizzle/*.sql
npm run db:migrate:local # 套用到本機 D1（讀 .wrangler-local.jsonc，僅供本機）
npm run dev
```

冒煙測試（換成 dev 實際埠號）：

```bash
# 建立 → 回傳 {id, version:1}
curl -X POST localhost:3000/api/maps -H 'content-type: application/json' \
  -d '{"title":"測試","nodes":[{"id":1,"parent":null,"text":"中心","note":"","x":0,"y":0,"tone":"ink"}]}'

# 讀取（用上一步的 id）
curl localhost:3000/api/maps/<id>

# 樂觀鎖：先用 version:1 存回成功（→ version:2），再用 version:1 存回應得 409
curl -X PUT localhost:3000/api/maps/<id> -H 'content-type: application/json' \
  -d '{"title":"改","version":1,"nodes":[{"id":1,"parent":null,"text":"中心2","note":"","x":0,"y":0,"tone":"ink"}]}'
```

> `.wrangler-local.jsonc` 只在 `--config` 明確指定時使用，不影響 vite 內嵌的綁定設定與部署。
> 部署到 Sites 時由平台套用 migration，不需這個檔案。

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
