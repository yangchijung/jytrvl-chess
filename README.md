# JY Chess

西洋棋・中國象棋・台灣暗棋＋即時圈地遊戲「領地爭奪戰」線上遊戲平台。正式網址：<https://chess.jytrvl.com>

- 三款棋類：西洋棋（FIDE 2023）、中國象棋（JY Chess 台灣象棋規則 v1.0）、台灣暗棋（台灣常見版，可切換規則）
- 原創即時遊戲：領地爭奪戰 Territory Rush（`/territory`）——單人 vs AI、雙人同機、2–8 人線上即時對戰、私人房間、公開配對，伺服器權威判定；規則見 [docs/rules/territory.md](docs/rules/territory.md)
- 模式：電腦 AI（簡單／中等／困難）、雙人同機、私人房間邀請、線上自動配對、AI 練習
- 互動教學、AI 教練（提示、失誤提醒、賽後分析）
- 訪客遊玩、Google 登入、對局紀錄、三款棋類分開計算的 Elo 積分與排行榜；領地爭奪戰另有獨立戰績（場次、勝場、淘汰數、最大占有率、最高得分）與排行榜，不與 Elo 混算
- 繁體中文（預設，`/`）與英文（`/en/…`）
- 授權：GPL-3.0-or-later（內含 Stockfish、Fairy-Stockfish，皆為 GPL-3.0）

## 架構

```
┌──────────── Cloudflare Pages：jytrvl-chess ────────────┐      ┌── Worker：jytrvl-chess-realtime ──┐
│ 靜態前端 (React + Vite + Tailwind)                     │      │ Durable Objects（無公開路由）      │
│  ├─ /engines/  Stockfish 19 lite、Fairy-Stockfish WASM │      │  GameRoom   每個房間＝權威棋局     │
│  └─ Web Worker：暗棋 AI、象棋後備 AI                   │ DO   │  Matchmaker 每個配對池             │
│ Pages Functions /api/*（functions/api/[[path]].ts）    │─────▶│  RateLimiter 流量限制              │
│                                                        │      │  TerritoryRoom  領地爭奪戰即時房間 │
│                                                        │      │  TerritoryLobby 領地爭奪戰配對池   │
│  驗證身分、Google OAuth、房間建立、WebSocket 轉送       │綁定  └───────────────┬────────────────────┘
└───────────────────────────┬────────────────────────────┘                      │
                            └────────────── D1：jytrvl-chess ───────────────────┘
                                  users / sessions / ratings / games / errors / territory_stats / territory_games
```

| 目錄 | 內容 |
|---|---|
| `shared/games/` | 三款棋類的獨立規則引擎＋統一介面 `registry.ts` |
| `shared/territory/` | 領地爭奪戰即時引擎（固定 tick、確定性，前後端共用）與三級 AI |
| `shared/ai/` | UCI 用戶端、難度表、暗棋資訊集 AI、象棋內建搜尋 |
| `src/` | 前端（頁面、棋盤、教學、教練、i18n）；`src/territory/` 為領地爭奪戰（Canvas 2D 繪圖、操作、HUD、線上用戶端、互動教學） |
| `functions/api/` | Pages Functions API |
| `realtime/` | Durable Objects Worker |
| `server/` | 共用伺服器模組（D1 schema、session、Elo、crypto） |
| `tests/` | Vitest 單元測試 |
| `scripts/` | 建置、預渲染、AI 難度階梯測試 |
| `docs/` | 規則版本、部署維護、驗收報告 |

領地爭奪戰不套用回合制棋類引擎：它有自己的即時引擎與 Durable Object，但共用會員、登入、i18n、設計系統、排行榜頁與流量限制。

新增棋類：在 `shared/games/<新棋>/` 寫規則引擎，於 `registry.ts` 加一個 adapter，再加棋盤元件與教學即可；房間、配對、紀錄、積分不需修改。

## 開發

```bash
npm ci
npm run dev          # http://localhost:5173（純前端）
npm test             # 單元測試
npm run typecheck
npm run build        # 產出 dist/（含預渲染的 SEO 頁面、sitemap）
npm run ladder -- 6 chess,xiangqi,banqi   # AI 難度差異驗證
npm run ladder:territory -- 20 1          # 領地爭奪戰 AI 1 對 1 階梯（第二個參數 2＝2 對 2）
```

完整本機環境（含 API 與即時對戰）：

```bash
npx wrangler dev -c realtime/wrangler.toml --port 8790 &
npm run build && npx wrangler pages dev dist --port 8788
```

測試腳本（需在專案外 `npm i ws @sparticuz/chromium puppeteer-core`）：`scripts/e2e.mjs`、`scripts/ws-test.mjs`（棋類）、`scripts/territory-e2e.mjs`、`scripts/territory-ws-test.mjs`（領地爭奪戰）。

部署、設定與維護請見 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。
