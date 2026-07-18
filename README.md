# 靈感樹｜AI 心智圖工作室

一個可以自由整理、拖曳及延伸想法的互動式心智圖網站，並提供 AI 協作區協助拆解問題與探索更多方向。

- 線上版本：https://inspiration-tree-ai-mindmap.go38.chatgpt.site
- 目前產品版本：`v0.10.0`
- 存取狀態：私人 Beta（僅限擁有者）
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
```

This starter does not use `wrangler.jsonc`.

## 專案結構

- `app/page.tsx`：首頁與本機草稿入口
- `app/MindMapStudio.tsx`：心智圖與 AI 協作互動
- `app/globals.css`：網站視覺與響應式版面
- `app/layout.tsx`：網站中繼資料與語言設定
- `app/lib/mindmap.ts`：心智圖純函式（節點/歷史/匯出邏輯），與 UI 解耦以利單元測試
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development

> `db/schema.ts`、`drizzle/`、`drizzle.config.ts` 與 D1 綁定已用於無登入共享地圖；
> `examples/d1/`、`worker/index.ts` 與 R2 scaffolding 則保留供後續資料能力使用。
> 詳見 [ROADMAP.md](./ROADMAP.md) 批次 2。

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
