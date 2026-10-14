# JY GAMES｜STATE

```
Date: 2026-10-15
Branch/Commit: main（Issue #2 工程補強；提交編號見 Issue #2 回覆）
Done (with evidence):
  - 六款遊戲上線 https://chess.jytrvl.com；部署：Pages jytrvl-chess＋Worker jytrvl-chess-realtime＋D1
  - Issue #2（docs/ACCEPTANCE.md §12）：
    - 重新整理復原六款×等待／進行中／結束後 49／49（refresh-e2e-local.json）；修正即時房間休眠後結果畫面遺失
    - AI 補位／代打與真人計分隔離核對：電腦座位不計 humans，1 人＋電腦不記錄；規則未變更
    - 360 px：33 頁面／狀態×中英×淺深 132／132（mobile-360-local.json、screens/360/）；觸控目標 ≥ 44 px
    - 文案 v1.1 接線＋連線狀態 32／32（copy-shots-local.json、screens/copy/）
    - 象棋判例 XQ01–XQ09、暗棋 49／50 邊界測試；單元 170／170
    - docs/LICENSES.md；GitHub Actions CI（.github/workflows/ci.yml）
  - 既有回歸：棋類 29／29、24／24；領地 29／29、22／22；貪食蛇＋方塊 57／57、47／47
  - 經典數獨 v1.0 產品設計交付（docs/product/SUDOKU_CLASSIC_V1.md）：雙語文案、互動設計稿、唯一解樣題及 SU01–SU16 驗收規格；僅設計，未部署
In Progress:
  - 下一款經典數獨：已由負責人指定；待 Claude 實作、正式題庫與驗收
  - 正式站部署後抽查、Issue #2 回覆（待負責人同意後張貼）
Blocked / requires decision:
  - 斷線代打的結果計入該真人名下為既有設計；是否調整屬產品決策
  - 數獨首版範圍已交付，工程估時／拆解待回覆；不做正式排行。其他新遊戲仍為提案
Cost / Security / License alerts:
  - 即時遊戲房間對局中計費；Free 方案每日約 570 場即時對戰上限（docs/DEPLOYMENT.md §11）
  - 尚未設定 Cloudflare 帳單警示（需負責人）
  - cburnett 棋子授權文字待對照 Wikimedia Commons 原頁（docs/LICENSES.md 最末）
Next actions:
  - 實機驗收：iPhone／iPad Safari、Android Chrome、Firefox、Edge
Need from ChatGPT (content/design):
  - 依 screens/360 與 screens/copy 截圖回看文案與視覺
Need from owner (access/DNS/approval):
  - Cloudflare 帳單警示、確認 Workers 方案、實機測試、隱私權政策／服務條款法律審閱
```
