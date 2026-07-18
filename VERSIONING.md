# 版本管理規範

## 1. 版本格式

產品採用 Semantic Versioning：`MAJOR.MINOR.PATCH`。

- `MAJOR`：資料格式、API 或主要使用流程發生不相容變更。
- `MINOR`：新增向下相容的功能，例如大綱模式、共享地圖。
- `PATCH`：修正錯誤、文字、樣式或不改變既有契約的小幅改善。

目前產品版本：`v0.10.0`。`0.x` 代表 Beta，功能與資料契約仍可能調整；目前網站採私人存取。

## 2. 分支與提交

- `main`：隨時保持可建置、可部署。
- 功能分支：`codex/<feature-name>`。
- 修正分支：`codex/fix-<issue-name>`。
- 提交訊息使用祈使語氣，單一提交只處理一個明確目的。

## 3. 發佈流程

1. 更新 `PRD.md` 的需求狀態與文件版本。
2. 在 `DEVELOPMENT.md` 補上日期、決策、實作與驗證結果。
3. 將使用者可感知的變更加入 `CHANGELOG.md`。
4. 執行 `npm run build` 與 `npm test`。
5. 合併至 `main`，建立 Git 標籤 `vX.Y.Z`。
6. 推送 `main` 與標籤至 GitHub。
7. 發佈 Sites，將 Sites 平台版本寫入開發紀錄。

## 4. 版本紀錄原則

- `CHANGELOG.md` 記錄使用者可感知的變更，不逐筆複製 Git commit。
- `DEVELOPMENT.md` 記錄技術決策、限制、驗證與部署結果。
- `PRD.md` 是需求與驗收條件的唯一事實來源。
- Sites 的第 N 版是部署平台流水號，不等同產品語意版本。

## 5. 緊急修正

緊急修正從最新標籤建立修正分支，完成測試後提升 `PATCH` 版本；不得直接覆寫或移動既有標籤。
