# GSAT HUB v1.0｜第一個可部署版本

深海藍、IRS 極簡風格、三人 Firebase 登入的學測複習平台。

## 已可使用

- Firebase Email/Password 登入（三個帳號由管理者手動建立）
- 個人每日任務與完成打勾、專注計時、模考原始分數紀錄
- 六科原創示範題，單選／多選作答、解析、正確率、錯題本
- 示範單字卡、中文選擇測驗、簡易間隔複習
- JSON 題庫與單字匯入，共用題庫儲存在 Firestore
- 三人讀書室共享筆記、累積積分排行榜
- 手機與電腦響應式版面

## 尚未完成（請勿誤認為已經內建）

- **106～115 學年度學測／指考／分科測驗完整真題：尚未匯入。** 目前只有六題原創示範題。須先取得合法來源、整理原始題目與答案、分類後再匯入。
- **官方高中英文參考詞彙表完整單字：尚未匯入。** 目前只有四筆示範單字。應先核對官方清單版本、詞條數與使用條件，再建立可匯入的資料。
- 題目中的圖片／圖表、正式級分換算、週排行榜、完整共同挑戰計分、進階艾賓浩斯演算法、背景計時通知、單字發音播放：後續版本再做。
- 此版本的 Firestore 安全規則允許所有已登入使用者讀取彼此學習資料並共同編輯題庫。只適合三位互相信任的測試成員，不適合公開招募帳號。

## 部署教學（GitHub Pages）

1. 到 https://console.firebase.google.com/ 新建專案（例如 `gsat-hub`）。
2. 專案設定 > 你的應用程式 > 新增「網頁」應用程式。複製 Firebase SDK 設定的 `firebaseConfig` 欄位，填入 `firebase-config.js`。**Firebase 網頁設定不是管理員私鑰；請勿把 service account JSON 或管理員私鑰放入網頁。**
3. Firebase > Authentication > Sign-in method > 啟用 **Email/Password**。
4. Authentication > Users > Add user，手動建立你和兩位朋友的三組 Email/Password 帳號。請勿使用弱密碼。
5. Firebase > Firestore Database > 建立資料庫（依所在地選適當區域），進入 Rules，貼上 `firestore.rules` 內容並按 Publish。**不要使用永久開放的測試規則。**
6. 在 GitHub 建立一個 Repository，例如 `gsat-hub`。將 `index.html`、`style.css`、`app.js`、`firebase-config.js`、`sample-data.js` 上傳至儲存庫根目錄。
7. GitHub Repository > Settings > Pages > Build and deployment > Deploy from a branch > `main` / `(root)` > Save。
8. 等待部署完成，開啟 `https://你的帳號.github.io/gsat-hub/`，使用 Firebase 建立的帳號登入。
9. 若 Firebase Authentication 提示 `auth/unauthorized-domain`，到 Authentication > Settings > Authorized domains，加入 `你的帳號.github.io`（只填網域，不含 https:// 或路徑）。
10. 三人分別登入，新增任務，確認跨裝置同步。

**注意：** 網頁使用 Firebase CDN ES Modules，開啟時需要網路；請從 GitHub Pages 網址測試，不要直接雙擊本機 HTML。

## 匯入 JSON 範例

題庫檔案是 JSON 陣列，每題格式如下：

```json
[
  {
    "id": "custom-001",
    "subject": "數A",
    "exam": "自編練習",
    "year": 115,
    "unit": "二次函數",
    "type": "single",
    "stem": "若 x²=9 且 x>0，x 為何？",
    "options": ["1", "2", "3", "9"],
    "answer": [2],
    "explanation": "正數解為 3。"
  }
]
```

`subject` 必須是 `國文`、`英文`、`數A`、`數B`、`自然`、`社會` 之一；`type` 為 `single` 或 `multiple`；`answer` 是從 0 開始的正確選項索引陣列。

單字檔案格式：

```json
[
  {
    "id": "custom-word-001",
    "word": "essential",
    "meaning": "必要的",
    "pos": "adj.",
    "level": "自訂",
    "example": "Water is essential for life."
  }
]
```

**請勿未經確認就大量複製並公開第三方著作權內容。** 官方試題可先由大考中心網站 https://www.ceec.edu.tw/ 查詢，核對授權、試題適用範圍與考制差異。110 學年度以前的指考與 111 學年度以後的分科測驗應分別標示；數 A／B 為 111 學年度起的考科。

## 維護提醒

- 此版資料結構以 `users/{uid}` 文件存個人資料，適合三人小型測試，不適合大量作答紀錄。後續正式版應改成子集合分頁儲存。
- 目前匯入時每筆直接寫入 Firestore，請小批次測試，避免免費額度與網路錯誤。每次建議先匯入 20～100 筆。
- 題庫寫入權限開放給所有登入成員，請三人互相確認匯入檔案，避免覆蓋相同 ID。
- 目前沒有自動備份，建議定期備份 Firestore。
