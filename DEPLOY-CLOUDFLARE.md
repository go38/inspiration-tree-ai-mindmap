# 部署到 Cloudflare Workers

本文件說明如何把「靈感樹」直接部署到你自己的 Cloudflare 帳號（Workers + D1），
獨立於 OpenAI Sites 平台。應用本身已是 Cloudflare Worker（vinext 建置產出
`dist/server/index.js` 與 `dist/client` 靜態資源），因此不需要改架構。

## 需要準備

- 一個 Cloudflare 帳號，並啟用 `*.workers.dev` 子網域。
- 一個 **Cloudflare API Token**（權限：`Workers Scripts:Edit`、`D1:Edit`、
  `Account Settings:Read`、`Workers KV Storage:Edit`）。
- 一組真正的 **OpenAI API 金鑰**（`sk-...`）。AI 建議會直接呼叫
  `https://api.openai.com/v1/responses`；未設定金鑰時網站仍可用，只會退回離線示範建議。

> ⚠️ 模型名稱：程式預設 `OPENAI_MODEL=gpt-5.6-luna`，那是 Sites 平台的內部模型，
> 在公開 OpenAI 帳號不存在。請務必用 `OPENAI_MODEL` 覆寫成你帳號可用的模型
> （例如 `gpt-4o-mini`），否則 AI 呼叫會失敗、退回離線建議。

## 一次性設定

```bash
# 1) 驗證（擇一）
export CLOUDFLARE_API_TOKEN="<你的 API Token>"
# 或在自己的機器互動登入： npx wrangler login

# 2) 命名（可自訂；預設 inspiration-tree-ai-mindmap）
export CF_WORKER_NAME="inspiration-tree-ai-mindmap"
export CF_D1_DATABASE_NAME="inspiration-tree-ai-mindmap"

# 3) 建立 D1 資料庫，記下輸出的 database_id
npm run cf:d1:create
export CF_D1_DATABASE_ID="<上一步輸出的 database_id>"

# 4) 對遠端 D1 套用 migration（建立 maps 資料表）
npm run cf:d1:migrate

# 5) 設定 OpenAI 金鑰為 Worker secret（會提示貼上）
npm run cf:secret
```

## 部署

```bash
# 每次要發佈時：
export CLOUDFLARE_API_TOKEN="..."           # 若非互動登入
export CF_WORKER_NAME="inspiration-tree-ai-mindmap"
export CF_D1_DATABASE_NAME="inspiration-tree-ai-mindmap"
export CF_D1_DATABASE_ID="<database_id>"
# 建議設定真正的模型：
# wrangler deploy 時 vars 由 dashboard/secret 管理，OPENAI_MODEL 可用下列指令設定一次
#   wrangler deploy 後：npx wrangler versions ... 或用 dashboard 設 vars
npm run cf:deploy
```

`cf:deploy` 會先用 `CF_D1_DATABASE_ID`／`CF_D1_DATABASE_NAME` 建置（把真正的 D1
id 寫進產生的 `dist/server/wrangler.json`），再 `wrangler deploy --name $CF_WORKER_NAME`。
完成後網址為 `https://<CF_WORKER_NAME>.<你的子網域>.workers.dev`。

### 設定 OPENAI_MODEL（重要）

`OPENAI_MODEL` 不是機密，可用非機密 var 設定。最簡單的方式是部署後在 Cloudflare
dashboard → Workers → 你的 Worker → Settings → Variables 新增
`OPENAI_MODEL = gpt-4o-mini`（或你要用的模型）。或改用 secret：

```bash
echo -n "gpt-4o-mini" | wrangler secret put OPENAI_MODEL --name "$CF_WORKER_NAME"
```

## 驗證

1. 打開 `https://<CF_WORKER_NAME>.<子網域>.workers.dev`，應看到心智圖工作室。
2. 建立節點、拖曳、復原都正常；純選取節點不會產生復原紀錄（v0.10.1）。
3. 建立共享連結 → 開 `/m/<id>`，確認 D1 有寫入。
4. 在 AI 面板描述卡點 → 應取得三個建議（代表 OpenAI 金鑰與模型設定正確）。

## 運作原理

- `wrangler deploy` 從專案根目錄執行時，會讀 `.wrangler/deploy/config.json`
  這個由 vinext 產生的「重導設定」，指向 `dist/server/wrangler.json`。
- `vite.config.ts` 會在建置時把 `CF_D1_DATABASE_ID`／`CF_D1_DATABASE_NAME`
  寫入該產生設定的 D1 綁定；未設定時保留 placeholder（本機與 Sites 沿用原行為）。
- `.wrangler-remote.jsonc` 只給 `wrangler d1 migrations apply --remote` 使用，
  由 `scripts/cf-remote-config.mjs` 依環境變數產生，已列入 `.gitignore`。

## 疑難排解

- **`could not read Username`**：未設定 `CLOUDFLARE_API_TOKEN` 也未 `wrangler login`。
- **AI 一直回離線建議**：`OPENAI_API_KEY` 未設定，或 `OPENAI_MODEL` 指向不存在的模型。
- **共享地圖 500**：D1 未建立或未套 migration；重跑 `npm run cf:d1:migrate`。
- **在 iCloud 同步的專案目錄建置極慢**：先把專案複製到本機非同步路徑再建置。
