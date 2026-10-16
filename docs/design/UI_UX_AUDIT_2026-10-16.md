# JY Games UI／UX 規範落地檢查

日期：2026-10-16（Asia/Taipei）。範圍：JY Games 現有介面及未來設計／美術交付。

負責人於本輪指定沿用「尋找 Epstein.md 設計規範」對話中的全產品要求。Repo 已有 [DESIGN.md](../../DESIGN.md) 與 [CLAUDE.md](../../CLAUDE.md)，本文件列落差與修正順序，不另造一份競爭的設計規範。這次是原碼與文件檢查，**沒有修改正式介面、沒有重新執行瀏覽器或遊戲測試**；不能據此宣稱全站已符合規範。

## 先說設計方向與理由

JY Games 以棋盤或遊戲場景為主角，讓玩家立即知道輪到誰、能做什麼、動作造成什麼結果。介面以紙白、墨色、墨綠建立層次，需要警示時再加入一個語意色；實際深淺模式配色逐對核對對比。用字級、對齊、4／8 px 間距與留白區分資訊，不用漸層、浮起陰影、玻璃面板或大圓角堆出層次。

兒童遊戲保留能解釋任務的角色、道具、圖片指令與動作結果。可愛不等於所有東西都做成膠囊或加慶祝圖案：畫面同時只教一個動作，詳細資料按需展開；移動、拿取與交接有因果，常駐跳動、彈跳獎勵及裝飾背景移除。遵守 DESIGN.md 的 120–220 ms 克制動態、減少動態與不延誤操作要求。

這些原則亦用於本聊天未來交付的 Figma、SVG、可玩樣稿、文案與驗收，不能只要求工程修改。先前餐廳樣稿的陰影、大圓角與彈跳式回饋也列為待改；原樣稿不再是最新視覺標準。

## 已確認的落差

原碼基準：`79377182b93fd9cdc2b5e479ab315c1c23c283de`。以下是具體原碼證據，不是完整視覺驗收結果。

| 優先序 | 位置與證據 | 問題 | 修正方向 |
|---|---|---|---|
| 第一輪 | [首頁配色](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/index.css#L42)、[首頁主區塊](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/pages/Home.tsx#L73) | 首頁使用藍綠漸層、巨大圓角和無內容作用的裝飾圓環 | 換成純色／紙面主區塊，去除裝飾圓環；遊戲入口、分類與開始操作優先 |
| 第一輪 | [頁首](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/components/Layout.tsx#L61)、[半透明色](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/index.css#L41) | 半透明頁首搭配 backdrop-blur | 改不透明背景與清楚分隔線，保留導覽與焦點辨識 |
| 第一輪 | [Card](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/components/ui.tsx#L38)、[Modal](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/components/ui.tsx#L69)、[陰影變數](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/index.css#L44) | 共用卡片／視窗及棋盤使用浮起陰影，容易擴散至各頁 | 以細邊線、間距與表面色區隔；一般容器使用有限圓角。開關、進度點、棋子等功能性圓形不用機械式改方 |
| 第一輪 | [機器人指令按鈕](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/robot/pages.tsx#L310) | 白字搭配 #2f9e8f，並有厚底陰影 | 該色碼白字對比計算約 3.28:1；一般小字未達本專案 4.5:1 目標。改用已定義且逐對驗證的文字／底色組合，移除厚底陰影 |
| 第一輪 | [共用焦點](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/components/ui.tsx#L21) | 金色焦點環在淺底上的辨識需補驗收 | #c8a24a 對白色約 2.41:1、對紙白 #faf7f0 約 2.25:1；需替換／增加可辨識輪廓，逐項測試焦點實際鄰接色。此處不宣稱已完成全站無障礙判定 |
| 第二輪 | [機器人狀態](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/robot/pages.tsx#L190)、[完成畫面](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/robot/pages.tsx#L263) | 標題／狀態／慶祝以 emoji 顯示；完成圖案放大彈出 | 換一致的原創圖形或直接短文字；只保留能說明目前動作與結果的視覺 |
| 第二輪 | [探險賽輪次](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/trail/pages.tsx#L428)、[路徑](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/trail/pages.tsx#L556)、[可走位置](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/trail/pages.tsx#L572) | 常駐 bounce、無限流動虛線與 pulse，和新規範衝突 | 使用固定輪次標記、靜態虛線、形狀或外框顯示可走位置；有意義的移動採短因果動畫 |
| 暫存，餐廳重啟時 | [餐廳提示](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/restaurant/scene.css#L21)、[夜色](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/restaurant/scene.css#L18)、[動作](https://github.com/yangchijung/jytrvl-chess/blob/79377182b93fd9cdc2b5e479ab315c1c23c283de/src/restaurant/scene.css#L37) | 大圓角、浮起陰影、藍紫漸層夜色、長動畫與彈跳回饋；先前產品樣稿亦有相同問題 | 依新規範重整後才能再當作美術基準。餐廳已暫停，這列不是恢復開發指令 |

對比數值以 sRGB 相對亮度公式計算，並非整頁、所有狀態或實機驗收。其餘遊戲、連線房間、空／錯誤狀態還要逐頁檢查，不因本表未列就視為通過。

## UX 同時處理

- 首頁優先讓玩家選遊戲並開始；遊戲內優先顯示遊戲場、目前狀態與下一步。連線等待／重連／輪替等關鍵狀態不能為了減字而隱藏。
- 教學每步一個可驗證動作；首次進入不用先讀長篇規則。詳細說明可展開，但影響選擇的限制仍在操作旁短句提示。
- 兒童遊戲用圖形和短標籤共同傳達，不依賴顏色、聲音或 emoji。角色、棋子與道具是遊戲內容，不是給介面增加裝飾的理由。
- 既有遊戲的規則、計分、存檔與多人同步保持清楚；UI 整理不暗中變更玩法。減少步驟或降低關卡難度須在玩法交接中明說。
- 餐廳偏難的試玩回饋屬操作負擔與規則理解問題；只換配色、移除陰影或換圖片不等於已解決。

## 下一輪交付與驗收

1. 先整理全站共用色彩、頁首、首頁、Card／Modal／焦點；再逐款整理。餐廳維持暫停。
2. 每次設計先寫「玩家任務、主要動作、立即／下一步／按需資訊、構圖理由、真實內容依據」，再交畫面或程式。
3. 修正者附受影響畫面的修改前／後證據；檢查繁中／英文、深淺色、360／390／768／1280 px、200% 文字放大。
4. 驗證鍵盤順序、可見焦點、主要觸控區至少 44×44 px、文字與狀態對比、減少動態、無聲操作、空／載入／錯誤狀態。
5. 若變更動作或呈現時序，驗證連點、重整、暫停／恢復不影響遊戲狀態；依影響範圍跑既有測試。
6. 分開報告「規範已加入」「已修正的介面」「實測通過項目」「仍待處理」，不能把文件寫完當成全站完成。

## 現況與文件優先順序

餐廳 V2 已由工程回報部署；2026-10-16 負責人試玩後決定暫停，見 [最新 Issue #4 回覆](https://github.com/yangchijung/jytrvl-chess/issues/4#issuecomment-6206467978)。較舊交接的「待接入 V2」「Claude 請接續」與 600–900 ms 動畫時間表屬歷史交付，不得覆蓋暫停決定或最新 DESIGN.md。

機器人、逆風探險、星球救援的原型狀態依 STATE.md 及工程驗收紀錄判斷；不得沿用舊五款企劃的「其餘皆未實作」。本輪僅把新規範落實到工作指示與檢查記錄，未核定新的關卡、年齡、付費工具或上架時程。
