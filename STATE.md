# JY GAMES｜STATE

```
Date: 2026-10-16
Branch/Commit: main（Issue #2 工程補強；提交編號見 Issue #2 回覆）
Done (with evidence):
  - 已核對 DESIGN.md／CLAUDE.md，補 AGENTS.md 與 2026-10-16 現有 UI／UX 原碼檢查；規範已接入，不代表既有畫面已修正
  - 七款遊戲上線 https://chess.jytrvl.com（第七款經典數獨，Issue #3，docs/ACCEPTANCE.md §13）；部署：Pages jytrvl-chess＋Worker jytrvl-chess-realtime＋D1
  - 產品端正式站一日抽查：營收 201／結餘 34／現金 534／裝飾後 414，重整保持 414；樣稿另核對相同數值，非正式站 V2 部署證據
  - 餐廳 V2 場景版：/restaurant（noindex），V2-01–V2-09 通過（瀏覽器 42／42）、RT01–RT14 保留，docs/ACCEPTANCE.md §15；V2-10 家庭試玩（5–7／8–12 歲）未完成，依負責人決定暫停
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
  - 兒童能力五款企劃與 Figma 概念板交付：docs/product/KIDS_LEARNING_GAMES_V1.md、KIDS_GAMES_ART_BRIEF_V1.md；餐廳 V2 已部署並暫停；機器人／逆風探險／星球救援已有原型，換位小鎮仍待後續
  - 餐廳菜單／共用食材／庫存規格與 Figma 關係圖交付：docs/product/RESTAURANT_MENU_INVENTORY_V1.md；含 RT01–RT14，工程已回報通過，計算樣例已核對
In Progress:
  - 數獨：已部署，實機及讀屏驗收依 Issue #3 持續收尾
  - 星球救援隊：負責人試玩完成；依回饋新增連線房間 /rescue/room/:id（各自帳號／裝置、每人只看到自己的卡、計畫即時同步；RescueRoom DO，無資料庫寫入），瀏覽器 14／14（§18.1）；試玩原型 /rescue（noindex，不列首頁）——三角色各看不同資料卡（遮罩傳平板）、共用計畫板、三人確認後出發、救援車動畫與因果鏈、3 人／2 人兼職／1 人熟悉規則、4 個暫定任務；單元 6、瀏覽器 21／21（docs/ACCEPTANCE.md §18）；待負責人試玩與 ChatGPT 交付
  - 逆風探險賽：2026-10-16 負責人試玩「OK」；試玩原型 /trail（noindex，不列首頁）——對電腦（慢慢烏龜／快快狐狸）或兩人同機、3 張暫定地圖、能量與蘋果補給、公平輪先手、結束後「休息一下／回看一個轉折／再試一次」、練習分支不改原局；單元 7、瀏覽器 24／24（docs/ACCEPTANCE.md §17）；待負責人試玩與 ChatGPT 交付
  - 機器人快遞站：2026-10-16 負責人試玩「可以」；試玩原型 /robot（noindex，不列首頁）——圖片指令、機器人移動／撞牆搖晃／送達動畫、一步一步、6 關暫定關卡與暫定美術；單元 7、瀏覽器 21／21（docs/ACCEPTANCE.md §16）；待負責人與孩子試玩，以及 ChatGPT 交付正式關卡／美術／文案（Issue #5）
  - 餐廳：2026-10-16 負責人決定暫停開發（試玩後認為偏難）；V2 場景版維持在 /restaurant（noindex），不再擴充
  - #2、#3 已回報；實機（Safari／Android）與讀屏驗收待人工
Blocked / requires decision:
  - 斷線代打的結果計入該真人名下為既有設計；是否調整屬產品決策
  - 餐廳 5–12 歲已確認但開發暫停；其餘四款年齡仍暫 8–12 歲。餐廳是否重啟另由負責人決定；數獨維持不做正式排行
Cost / Security / License alerts:
  - 即時遊戲房間對局中計費；Free 方案每日約 570 場即時對戰上限（docs/DEPLOYMENT.md §11）
  - 尚未設定 Cloudflare 帳單警示（需負責人）
  - cburnett 棋子授權文字待對照 Wikimedia Commons 原頁（docs/LICENSES.md 最末）
Next actions:
  - 全站 UI／UX：依 DESIGN.md 及 docs/design/UI_UX_AUDIT_2026-10-16.md 優先整理共用介面、對比與焦點，再逐款檢查；本輪僅文件交接，畫面修正未完成
  - 餐廳維持暫停，保存 V2 與既有證據；不因舊交接或新設計檢查而重啟
  - 實機驗收：iPhone／iPad Safari、Android Chrome、Firefox、Edge；數獨螢幕閱讀器朗讀
Need from ChatGPT (content/design):
  - 未來產品／美術／文案先遵守 DESIGN.md，先說明設計方向與理由；現有樣稿也納入檢查。兒童遊戲交付依 docs/handoff/KIDS_GAMES_HANDOFF_TO_CHATGPT.md，餐廳維持暫停
Need from owner (access/DNS/approval):
  - Cloudflare 帳單警示、確認 Workers 方案、實機測試、隱私權政策／服務條款法律審閱
```

