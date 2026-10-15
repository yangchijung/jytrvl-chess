# JY GAMES｜STATE

```
Date: 2026-10-15
Branch/Commit: main（Issue #2 工程補強；提交編號見 Issue #2 回覆）
Done (with evidence):
  - 七款遊戲上線 https://chess.jytrvl.com（第七款經典數獨，Issue #3，docs/ACCEPTANCE.md §13）；部署：Pages jytrvl-chess＋Worker jytrvl-chess-realtime＋D1
  - 產品端正式站一日抽查：營收 201／結餘 34／現金 534／裝飾後 414，重整保持 414；樣稿另核對相同數值，非正式站 V2 部署證據
  - 餐廳 V2 場景版：/restaurant（noindex），V2-01–V2-09 通過（瀏覽器 42／42）、RT01–RT14 保留，docs/ACCEPTANCE.md §15；V2-10 家庭試玩（5–7／8–12 歲）待安排
  - 數獨：SU01–SU16 自動化通過（單元 18、瀏覽器 66／66）；VoiceOver／TalkBack 與實機觸控待人工
  - Issue #2（docs/ACCEPTANCE.md §12）：
    - 重新整理復原六款×等待／進行中／結束後 49／49（refresh-e2e-local.json）；修正即時房間休眠後結果畫面遺失
    - AI 補位／代打與真人計分隔離核對：電腦座位不計 humans，1 人＋電腦不記錄；規則未變更
    - 360 px：33 頁面／狀態×中英×淺深 132／132（mobile-360-local.json、screens/360/）；觸控目標 ≥ 44 px
    - 文案 v1.1 接線＋連線狀態 32／32（copy-shots-local.json、screens/copy/）
    - 象棋判例 XQ01–XQ09、暗棋 49／50 邊界測試；單元 170／170
    - docs/LICENSES.md；GitHub Actions CI（.github/workflows/ci.yml）
  - 既有回歸：棋類 29／29、24／24；領地 29／29、22／22；貪食蛇＋方塊 57／57、47／47
  - 經典數獨 v1.0 產品設計交付（docs/product/SUDOKU_CLASSIC_V1.md）；其後實作／部署狀態以上方 Issue #3 工程證據為準
  - 兒童能力五款企劃與 Figma 概念板交付：docs/product/KIDS_LEARNING_GAMES_V1.md、KIDS_GAMES_ART_BRIEF_V1.md；餐廳一日原型已部署，其餘四款仍為提案
  - 餐廳菜單／共用食材／庫存規格與 Figma 關係圖交付：docs/product/RESTAURANT_MENU_INVENTORY_V1.md；含 RT01–RT14，工程已回報通過，計算樣例已核對
In Progress:
  - 數獨：已部署，實機及讀屏驗收依 Issue #3 持續收尾
  - 餐廳 V2：場景版已接入並部署（ACCEPTANCE §15）；待 V2-10 家庭試玩與 Issue #4 回報
  - #2、#3 已回報；實機（Safari／Android）與讀屏驗收待人工
Blocked / requires decision:
  - 斷線代打的結果計入該真人名下為既有設計；是否調整屬產品決策
  - 餐廳 5–12 歲已確認；其餘四款年齡仍暫 8–12 歲。餐廳先完成場景動畫與家庭試玩，再決定七日版；數獨維持不做正式排行
Cost / Security / License alerts:
  - 即時遊戲房間對局中計費；Free 方案每日約 570 場即時對戰上限（docs/DEPLOYMENT.md §11）
  - 尚未設定 Cloudflare 帳單警示（需負責人）
  - cburnett 棋子授權文字待對照 Wikimedia Commons 原頁（docs/LICENSES.md 最末）
Next actions:
  - 餐廳：V2 圖像選菜／食材箱／主廚料理／客人上菜／裝潢動態；保留 RT01–RT14，新增 V2-01–V2-10；家庭試玩未完成
  - 實機驗收：iPhone／iPad Safari、Android Chrome、Firefox、Edge；數獨螢幕閱讀器朗讀
Need from ChatGPT (content/design):
  - 餐廳 V2 方向與素材已交付，等待整合版再回看雙語／手機／錯誤狀態；舊版 390 px 採買橫捲及零剩料回顧不適用已記錄於 V2 §6
Need from owner (access/DNS/approval):
  - Cloudflare 帳單警示、確認 Workers 方案、實機測試、隱私權政策／服務條款法律審閱
```

