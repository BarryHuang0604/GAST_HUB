GSAT HUB v2.3 — 集中題庫版

【以後新增題目，只要改這兩個檔案】
1. question-bank.json：所有學測年度、科目、題目、選項、正確答案
2. vocabulary.json：英文單字資料

其他 app.js / index.html / style.css 不需因新增一般文字選擇題而修改。

【新增試卷】
在 question-bank.json 最外層陣列中加入一筆物件：
{
  "id": "115-英文",
  "year": 115,
  "subject": "英文",
  "answers": { "1": "A", "2": "BC" },
  "questions": [
    { "id": "1", "stem": "題目內容", "options": {"A":"選項一", "B":"選項二", "C":"選項三", "D":"選項四"} },
    { "id": "2", "stem": "題目內容", "options": {"A":"選項一", "B":"選項二", "C":"選項三", "D":"選項四"} }
  ],
  "files": {}
}

注意：目前只有114國文第1–5題完成轉換；這個版本不是完整題庫。
目前程式只適用一般單選題；多選、選填、圖形題、非選擇題需要後續開發專屬作答及計分介面，不能只加入 JSON 就宣稱可正常批改。
JSON 不能放註解、最後一筆不能有多餘逗號。可使用 jsonlint.com 檢查格式。

【部署】
解壓縮後將檔案（非ZIP本身）上傳到 GitHub Repository 根目錄。
GitHub Pages 開啟網站；請確認 Firebase Authentication 與 Firestore Rules。
