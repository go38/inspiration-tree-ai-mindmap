# 部署到 Cloudflare Workers

本文件說明如何把「靈感樹」部署到 Cloudflare 帳號（Workers + D1）。**這是唯一的發佈
路徑**——OpenAI Sites 平台自 v0.30.0 起不再發佈。應用本身已是 Cloudflare Worker
（vinext 建置產出 `dist/server/index.js` 與 `dist/client` 靜態資源），不需要改架構。

目前正式環境：Worker `mindmap` + D1 `mindmap`，正式網址 https://mind.milifun.net
（Custom Domain）；舊網址 https://mindmap.go38.workers.dev 仍指向同一個 Worker 與同一個 D1。

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
export CF_CUSTOM_DOMAIN=mind.milifun.net    # 少了這個 workers.dev 後門會被打開，見「自訂網域」

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

## 自訂網域

`mind.milifun.net` 是綁在 Worker 上的 **Custom Domain**（`milifun.net` 這個 zone 託管在同一個
Cloudflare 帳號，DNS 記錄與憑證都由 Cloudflare 自動處理）。分享連結用 `location.origin` 組成，
從哪個網域開就產生哪個網域的連結。

`workers.dev` 與 Preview URL 都已關閉，`mindmap.go38.workers.dev` 現在回 404。密碼閘門寫在
Worker 裡，所以就算它開著也擋得住；關掉是為了只留一個正式網址，分享連結、速率限制與紀錄
不會分散在兩個網域上。（若哪天改用 Cloudflare Access 之類的邊緣防護，關掉它就從「整齊」變成
「必要」——Access 保護不到 zone 以外的 workers.dev 子網域。）

**`CF_CUSTOM_DOMAIN` 一定要設**。wrangler 的預設是「部署設定裡沒有 `routes` 就把 workers.dev
打開」，所以少設這個環境變數的那一次發佈，會安靜地把後門重新開起來。`vite.config.ts` 讀到這個
變數時，會把下面這段寫進產生的 `dist/server/wrangler.json`：

```jsonc
{
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "mind.milifun.net", "custom_domain": true }]
}
```

要改網域或臨時修正線上狀態，不必重新發佈程式，套一份只含這些欄位的暫時設定檔即可：

```bash
npx wrangler triggers deploy -c /tmp/wrangler-domain.jsonc   # 內容同上，另加 name 與 compatibility_date
```

## 存取控制（站台密碼）

工作室本體與三條 AI 路由需要密碼才能進，分享頁維持免登入。實作是 Worker 進入點的一道
Basic auth 閘門（[`worker/index.ts`](./worker/index.ts) → [`app/lib/siteAuth.ts`](./app/lib/siteAuth.ts)），
用瀏覽器自己的登入對話框，不需要 Zero Trust、身分提供者或任何儀表板設定。

```bash
npm run cf:secret:site        # 設定 SITE_PASSWORD（會提示貼上，不留在 shell 歷史）
```

secret 一存好就立即生效，不必重新發佈。要改密碼就重跑一次；要暫時關掉閘門：
`wrangler secret delete SITE_PASSWORD --name mindmap`。

- **`SITE_PASSWORD` 沒設＝閘門關閉**，全站照舊開放。這是刻意的：本機開發與 `npm run dev`
  不必為了跑起來而配密碼。代價是正式環境漏設就等於沒鎖，所以下面的驗證步驟要實際確認 401。
- 使用者名稱不檢查，只比對密碼，隨便填都行。
- 免密碼的路徑只有 `/m/*`、`/s/*`、`/assets/*`、`/_vinext/image` 與根目錄那幾個 `.svg`。
  `/assets/*` 一定要放行，否則分享頁本身打得開、JS 與 CSS 卻被擋，畫面會壞掉。
- 閘門在 Worker 的第一行就擋掉請求，未通過的請求碰不到 AI 路由，也不會寫 D1。

驗證：

```bash
curl -o /dev/null -w '%{http_code}\n' https://mind.milifun.net/            # 401
curl -o /dev/null -w '%{http_code}\n' -u :"$PASSWORD" https://mind.milifun.net/   # 200
curl -o /dev/null -w '%{http_code}\n' https://mind.milifun.net/m/<分享 id>  # 200，免密碼
```

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

1. 打開 https://mind.milifun.net ，輸入站台密碼後應看到心智圖工作室；
   https://mindmap.go38.workers.dev 應回 404。
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
  `CF_CUSTOM_DOMAIN` 同理，會寫入 `routes` 並把 `workers_dev`／`preview_urls` 關掉；
  未設定時整段不出現，本機開發不受影響。
- `.wrangler-remote.jsonc` 只給 `wrangler d1 migrations apply --remote` 使用，
  由 `scripts/cf-remote-config.mjs` 依環境變數產生，已列入 `.gitignore`。

## 疑難排解

- **`could not read Username`**：未設定 `CLOUDFLARE_API_TOKEN` 也未 `wrangler login`。
- **AI 全部回 503**：`AI_API_KEY` 未設定，或 `rate_limits` 資料表不存在（未套 migration）——
  兩者的回應碼相同但訊息不同，看 `code` 是 `AI_NOT_CONFIGURED` 還是 `RATE_LIMIT_UNAVAILABLE`。
- **共享地圖 500**：D1 未建立或未套 migration；重跑 `npm run cf:d1:migrate`。
- **`mindmap.go38.workers.dev` 又活了**：那次發佈忘了 `export CF_CUSTOM_DOMAIN`，wrangler 把
  workers.dev 重新打開了。補設變數重跑 `npm run cf:deploy`，或直接套一次 triggers 設定檔。
- **分享頁打得開但畫面壞掉**：`siteAuth.ts` 的免密碼路徑清單漏了 `/assets/*`，JS／CSS 被 401
  擋掉。
- **正式站不用密碼就進得去**：`SITE_PASSWORD` 沒設或被刪掉了；`wrangler secret list --name mindmap`
  確認，再跑 `npm run cf:secret:site`。
- **在 iCloud 同步的專案目錄建置極慢**：先把專案複製到本機非同步路徑再建置。
