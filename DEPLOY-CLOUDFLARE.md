# 部署到 Cloudflare Workers

本文件說明如何把「靈感樹」部署到 Cloudflare 帳號（Workers + D1）。**這是唯一的發佈
路徑**——OpenAI Sites 平台自 v0.30.0 起不再發佈。應用本身已是 Cloudflare Worker
（vinext 建置產出 `dist/server/index.js` 與 `dist/client` 靜態資源），不需要改架構。

目前正式環境：Worker `mindmap` + D1 `mindmap`，網址 https://mindmap.go38.workers.dev

## 需要準備

- 一個 Cloudflare 帳號，並啟用 `*.workers.dev` 子網域。
- 一個 **Cloudflare API Token**（權限：`Workers Scripts:Edit`、`D1:Edit`、
  `Account Settings:Read`、`Workers KV Storage:Edit`）。
- 一組 AI 金鑰，設為 Worker secret `AI_API_KEY`。AI 走 Anthropic Messages API，
  端點與模型由 `AI_BASE_URL`（預設 `https://hnd1.aihub.zeabur.ai`）與 `AI_MODEL`
  （預設 `claude-haiku-4-5`）決定；未設定金鑰時 AI 功能回 503，其餘功能照常。

> ⚠️ `OPENAI_API_KEY` 仍會被當成金鑰的後備名稱讀取，但 `OPENAI_MODEL` 刻意不再讀取——
> 沿用舊的 OpenAI 模型名稱會讓每一次 Claude 呼叫都失敗。要換模型請設 `AI_MODEL`。

## 每次發佈（現有環境）

```bash
npx wrangler login                          # 或 export CLOUDFLARE_API_TOKEN="..."
export CF_WORKER_NAME=mindmap
export CF_D1_DATABASE_NAME=mindmap
export CF_D1_DATABASE_ID=a9f7f104-352d-4cae-91a6-2f6f4e3aab73

npm run cf:d1:migrate                       # 先套 migration，再部署
npm run cf:deploy
```

**順序不能顛倒**：AI 速率限制是 fail closed，`rate_limits` 資料表不存在時三條 AI 路由
會全部回 503。沒有新 migration 時 `cf:d1:migrate` 會直接跳過，照跑無妨。

`cf:deploy` 會先用 `CF_D1_DATABASE_ID`／`CF_D1_DATABASE_NAME` 建置（把真正的 D1 id
寫進產生的 `dist/server/wrangler.json`），再 `wrangler deploy --name $CF_WORKER_NAME`。

## 從零建立新環境

```bash
export CF_WORKER_NAME=mindmap
export CF_D1_DATABASE_NAME=mindmap

npm run cf:d1:create                        # 記下輸出的 database_id
export CF_D1_DATABASE_ID="<上一步輸出的 database_id>"
npm run cf:d1:migrate
npm run cf:secret                           # 設定 AI_API_KEY（會提示貼上）
npm run cf:deploy
```

模型與端點不是機密，可在 dashboard → Workers → Settings → Variables 設
`AI_MODEL`／`AI_BASE_URL`；不設就用預設的 `claude-haiku-4-5` 與 Zeabur AI Hub。

## AI 用量上限（重要）

AI 路由花的是你自己的金鑰，而網址是公開的，因此三條 AI 路由都有速率限制，計數存在 D1 的
`rate_limits` 資料表。**部署前務必先套用 migration**（`npm run cf:d1:migrate`）：計數寫不進去
時路由會一律回 503 拒絕請求，這是刻意的 fail-closed 行為——計數器壞掉就等於沒有上限。

預設每個用戶端 IP 每分鐘 10 次、每小時 60 次、每天 200 次，另有整個 Worker 每天 1000 次的
共用上限（唯一擋得住輪換 IP 的規則）。要調整就設下列 vars，設為 `0` 代表關閉該視窗：

```bash
wrangler deploy 後於 dashboard → Settings → Variables 設定，或：
echo -n "30" | wrangler secret put AI_RATE_LIMIT_PER_MINUTE --name "$CF_WORKER_NAME"
# 其餘：AI_RATE_LIMIT_PER_HOUR、AI_RATE_LIMIT_PER_DAY、AI_RATE_LIMIT_SHARED_PER_DAY
```

## 驗證

1. 打開 https://mindmap.go38.workers.dev ，應看到心智圖工作室。
2. 建立節點、拖曳、復原都正常；純選取節點不會產生復原紀錄（v0.10.1）。
3. 建立共享連結 → 開 `/m/<id>`，確認 D1 有寫入。
4. 在 AI 面板描述卡點 → 應取得建議（代表 `AI_API_KEY` 與速率限制資料表都正常）。
5. 連續呼叫 AI 超過每分鐘上限 → 應回 429 並帶 `retry-after`，而不是 503。回 503
   代表 `rate_limits` 資料表沒建起來。

## 運作原理

- `wrangler deploy` 從專案根目錄執行時，會讀 `.wrangler/deploy/config.json`
  這個由 vinext 產生的「重導設定」，指向 `dist/server/wrangler.json`。
- `vite.config.ts` 會在建置時把 `CF_D1_DATABASE_ID`／`CF_D1_DATABASE_NAME`
  寫入該產生設定的 D1 綁定；未設定時保留 placeholder（本機開發沿用原行為）。
- `.wrangler-remote.jsonc` 只給 `wrangler d1 migrations apply --remote` 使用，
  由 `scripts/cf-remote-config.mjs` 依環境變數產生，已列入 `.gitignore`。

## 疑難排解

- **`could not read Username`**：未設定 `CLOUDFLARE_API_TOKEN` 也未 `wrangler login`。
- **AI 全部回 503**：`AI_API_KEY` 未設定，或 `rate_limits` 資料表不存在（未套 migration）——
  兩者的回應碼相同但訊息不同，看 `code` 是 `AI_NOT_CONFIGURED` 還是 `RATE_LIMIT_UNAVAILABLE`。
- **共享地圖 500**：D1 未建立或未套 migration；重跑 `npm run cf:d1:migrate`。
- **在 iCloud 同步的專案目錄建置極慢**：先把專案複製到本機非同步路徑再建置。
