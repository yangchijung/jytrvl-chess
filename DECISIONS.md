# JY GAMES｜DECISIONS

格式：日期｜決策｜決定者｜依據／備註

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

## 待決策
- 設計系統：沿用現行或依交接文件新 Tokens 改版（docs/handoff/CLAUDE_RESPONSE.md §2.1）
- 象棋長捉採簡化版＋判例表，或完整亞洲象棋聯合會細則（§2.2）
- 暗棋預設規則與無進展和局步數確認（§2.2）
