# JY GAMES｜DECISIONS

格式：日期｜決策｜決定者｜依據／備註

日期精度：負責人於 2026-10-14 補充，10 月 8 日的初期日期由事後回推，可能相差一天；保留原日期並註明此限制。

| 日期 | 決策 | 決定者 | 備註 |
|---|---|---|---|
| 2026-10-08 | 公開 Repo＋GPL-3.0 | 專案負責人 | 配合 Stockfish／Fairy-Stockfish 授權 |
| 2026-10-08 | 技術棧：React＋TypeScript＋Vite＋Tailwind；Cloudflare Pages／Workers／Durable Objects／D1 | Claude | 見 README |
| 2026-10-08 | 暗棋預設規則「台灣常見版」，可切換連吃版、嚴格階級版 | 專案負責人 | docs/rules/banqi.md |
| 2026-10-08 | 語言網址：`/` 繁中、`/en/…` 英文，hreflang＋canonical | Claude | 交接文件 §2 要求由 Claude 提案 |
| 2026-10-08 | Google OAuth 由 Claude 代建、負責人自行貼上 Secret | 專案負責人 | 機密不經 Claude 輸入 |
| 2026-10-08 | DNS：GoDaddy CNAME `chess` → `jytrvl-chess.pages.dev` | 專案負責人授權 Claude 輸入 | 只新增此一筆，未改其他紀錄 |
| 2026-10-09 | 第四款「領地爭奪戰 Territory Rush」，Canvas 2D（評估 Phaser／PixiJS 後不採用） | 專案負責人／Claude | docs/rules/territory.md |
| 2026-10-09 | 平台更名 JY Games；保留網域 chess.jytrvl.com；Repo 與 Cloudflare 專案名稱沿用 jytrvl-chess | 專案負責人／Claude | 改名會中斷自動部署 |
| 2026-10-09 | 新增貪食蛇競技場、方塊消除對戰（JY 方塊規則 v1.0） | 專案負責人／Claude | docs/rules/snake.md、docs/rules/blocks.md |
| 2026-10-09 | 單人紀錄須經伺服器重播驗證才列入排行榜；貪食蛇只收標準設定 | Claude | 公平性 |
| 2026-10-09 | 方塊積分對戰使用共用 ratings 表（game='blocks'），與棋類積分分開 | Claude | |
| 2026-10-14 | 收到 ChatGPT 交接文件 V1.0：ChatGPT 負責內容／玩法／美編，Claude 負責工程與部署 | 專案負責人 | docs/handoff/JY_GAMES_CLAUDE_HANDOFF.md |
| 2026-10-14 | 只支援繁體中文（台灣）與英文 | 專案負責人 | 與現況一致 |
| 2026-10-14 | 設計採 A：沿用現行設計並微調；Logo 暫留 | ChatGPT 產品端 | docs/handoff/CHATGPT_PRODUCT_FOLLOWUP.md |
| 2026-10-14 | 中文標語「一起玩，一起動腦。」；英文 Play Together, Think Better. | ChatGPT 產品端 | 雙語文案包 product-copy-v1.1.json；待工程接線 |
| 2026-10-14 | 象棋維持簡化版，補公開判例與對應測試 | ChatGPT 產品端 | 先判長將、再判長捉；判例規格不等於測試已通過 |
| 2026-10-14 | 暗棋延續台灣常見版，50 步無吃子／無翻棋和局 | ChatGPT 產品端 | 單方一次動作算一步；延續原預設，不重新開啟已核定項目 |
| 2026-10-15 | 即時房間（領地／貪食蛇／方塊）結束後保存結果畫面，重新整理或平台休眠後仍顯示結果，按「再玩一次」才回大廳 | Claude | Issue #2 重新整理測試發現；不影響計分 |
| 2026-10-15 | 觸控目標一律 ≥ 44×44 px（含桌機），不另分裝置 | Claude | 交接文件驗收條件 |
| 2026-10-15 | CI 只做 npm ci／typecheck／test／build，不使用任何 Secret；部署仍由 Cloudflare Git 整合處理 | Claude | Issue #2 |

## 待決策
- 斷線代打期間的結果算在該真人名下（既有設計，見 docs/ACCEPTANCE.md §12.4）；是否改為不計分屬產品決策。
- 下一階段遊戲的開發範圍及順序：產品建議五子棋 → 數獨 → 麻將接龍；目前為提案，見 docs/product/NEXT_GAMES_ROADMAP.md。
- 五子棋若加入正式計分，須另定先手平衡與開局方案；首版提案為休閒局。

## 待工程確認
- （已完成，見 docs/ACCEPTANCE.md §12）判例可重播證據、逐款重新整理測試、AI 補位／代打隔離核對。
