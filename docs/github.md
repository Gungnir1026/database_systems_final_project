# GitHub 作品展示指南

建議儲存庫名稱：`scholarship-management-system`。

可用的儲存庫描述：

> 四角色獎學金申請與管理系統，整合學生申請、教師推薦、單位審核與公告流程。Node.js / Express / MySQL / Docker。

可用的主題標籤：`nodejs`、`express`、`mysql`、`docker-compose`、`scholarship`、`database-project`、`portfolio`。

## 上傳

將 ZIP 解壓縮後，進入內層 `scholarship-management-system/`。這層的 `README.md`、`compose.yaml`、`backend/` 等應位於 GitHub 儲存庫根目錄。

在 GitHub 建立空的儲存庫，再於此資料夾執行以下指令，把最後一行的網址換成你自己的儲存庫：

```bash
git init -b main
git add .
git commit -m "Prepare scholarship management system portfolio"
git remote add origin https://github.com/YOUR_USERNAME/scholarship-management-system.git
git push -u origin main
```

第一次上傳後，至 Actions 查看 Verify project 的執行結果。本次整理只在本機準備專案，沒有連接或推送你的 GitHub。

`.gitignore` 已排除 `.env`、`node_modules`、作業系統檔案與測試暫存；保留 `.env.example`、lockfile、資料庫初始化檔、測試、CI 設定及展示截圖。

## 重新打包

從專案根目錄執行：

```bash
python3 scripts/package.py
```

ZIP 與 SHA-256 檢查碼會輸出在此專案資料夾的上一層。打包時自動排除 `.env`、任何 `.git` 目錄、`node_modules`、快取、作業系統檔案及舊壓縮檔。

## 作品說明

README 已提供實際截圖、角色功能表、展示帳號與操作順序、系統架構、資料關聯及測試方式。建議依真實分工再補上個人負責範圍；課程團隊作品的原始來源已保留在版本比對文件。

本系統需要 Node.js 後端及 MySQL；GitHub Pages 的靜態網頁託管無法直接執行此完整應用。儲存庫本身可展示截圖、架構和程式碼，試用者可透過 Docker 在本機啟動。
