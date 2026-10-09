# JY Games 部署與維護手冊

平台名稱：JY Games（原 JY Chess）。網域 `chess.jytrvl.com`、Repo `yangchijung/jytrvl-chess`、Cloudflare 專案 `jytrvl-chess`／`jytrvl-chess-realtime` 的名稱刻意維持不變，以免中斷自動部署與 DNS。

## 1. 正式環境資源

| 資源 | 名稱／位置 | 說明 |
|---|---|---|
| GitHub | `yangchijung/jytrvl-chess`（公開） | 推送 `main` 即自動部署 |
| Cloudflare Pages | `jytrvl-chess` → `jytrvl-chess.pages.dev` | 前端＋ `/api/*` Pages Functions |
| Cloudflare Worker | `jytrvl-chess-realtime` | Durable Objects：GameRoom、Matchmaker、RateLimiter、TerritoryRoom、TerritoryLobby、SnakeRoom、BlocksRoom、ArenaLobby；**無公開網址** |
| Cloudflare D1 | `jytrvl-chess`（ID `0e9c760d-13d1-4926-a9f5-592f6065bb5d`，亞太區） | 會員、積分、對局紀錄、即時遊戲戰績、經驗證的單人紀錄、錯誤紀錄 |
| 自訂網域 | `chess.jytrvl.com` | GoDaddy CNAME → `jytrvl-chess.pages.dev` |
| Google Cloud | 專案 `jy-chess`，OAuth 用戶端「JY Games Web」 | Google 登入 |

既有網站（jytrvl.com、planner、flight、riskctrl 等）與本專案完全獨立，互不影響。

## 2. DNS（GoDaddy）

| Type | Host / Name | Points to / Value | TTL |
|---|---|---|---|
| CNAME | `chess` | `jytrvl-chess.pages.dev` | 1/2 Hour（或 Auto） |

- 只需要這一筆。Worker 不需要網域：Pages Functions 透過 Durable Object 綁定在 Cloudflare 內部呼叫它。
- WebSocket 走同一個網域（棋類 `wss://chess.jytrvl.com/api/rooms/<代碼>/ws`、領地爭奪戰 `…/api/territory/rooms/<代碼>/ws`、貪食蛇／方塊 `…/api/arena/{snake|blocks}/rooms/<代碼>/ws`、配對 `…/api/arena/match/ws?pool=snake|blocks|blocks-ranked`），不需額外設定。
- HTTPS 憑證由 Cloudflare Pages 自動簽發與續約。

## 3. 部署流程

兩個 Cloudflare 專案都連到同一個 Repo，推送 `main` 後自動建置：

| 專案 | Build command | Deploy／Output |
|---|---|---|
| Pages `jytrvl-chess` | `npm run build` | 輸出 `dist`；綁定與變數由根目錄 `wrangler.toml` 管理 |
| Worker `jytrvl-chess-realtime` | （無） | `npx wrangler deploy -c realtime/wrangler.toml` |

**注意順序**：若修改了 Durable Object 類別（新增／改名），必須先讓 Worker 部署成功，再部署 Pages；並在 `realtime/wrangler.toml` 新增一筆 `[[migrations]]`（tag 遞增），不可修改既有的 migration。

目前的 migration：`v1`（GameRoom、Matchmaker、RateLimiter）、`v2`（TerritoryRoom、TerritoryLobby）、`v3`（SnakeRoom、BlocksRoom、ArenaLobby）。v2 上線時即依此順序：先推送只含 Worker 變更的提交，確認 Worker 部署成功後，再推送 Pages 的 `TROOMS`／`TLOBBY` 綁定。

## 4. 設定與機密

| 名稱 | 類型 | 位置 |
|---|---|---|
| `PUBLIC_ORIGIN` | 變數 | `wrangler.toml` |
| `GOOGLE_CLIENT_ID` | 變數（公開） | `wrangler.toml` |
| `GOOGLE_CLIENT_SECRET` | **Secret** | Cloudflare → Pages `jytrvl-chess` → Settings → Variables and secrets |
| Session 簽章金鑰 | 自動產生 | D1 `config.session_key`（首次啟動時建立） |

更換 Google 密碼：Google Cloud Console → Google Auth Platform → 用戶端 → JY Games Web → 新增密碼 → 更新 Cloudflare Secret → 重新部署 → 停用舊密碼。

強制所有使用者重新登入：`DELETE FROM sessions;`（D1 Console）。

## 5. Google OAuth

- 回呼網址：`https://chess.jytrvl.com/api/auth/google/callback`
- JavaScript 來源：`https://chess.jytrvl.com`
- 範圍：`openid email profile`（基本範圍，發布為「正式版」不需 Google 審查）
- 流程：Authorization Code + PKCE + state（簽章 Cookie，10 分鐘有效）

## 6. 資料庫

- Schema 在 `server/schema.ts`，首次請求時自動建立（冪等）；同內容在 `migrations/0001_init.sql`、`migrations/0002_territory.sql`、`migrations/0003_arena.sql`（`SCHEMA_VERSION` = 3）。
- 領地爭奪戰：`territory_stats`（每位會員一列：games、wins、kills、best_pct、best_score）、`territory_games`（每場線上對局，`counted` 表示是否列入戰績）。與棋類的 `ratings`／`games` 完全分開。
- 貪食蛇／方塊：`arena_stats`（每位會員每款一列：games、wins、kills、best_score、best_len、lines、attack）、`arena_games`（每場線上對局）、`solo_best`（經驗證的單人最佳紀錄，每會員每款每模式一列）、`solo_runs`（已提交的憑證，防止重複提交）。方塊積分對戰使用共用的 `ratings` 表（`game = 'blocks'`），不影響棋類積分。
- 修改 schema：遞增 `SCHEMA_VERSION`，只用 `CREATE … IF NOT EXISTS`／`ALTER TABLE ADD COLUMN`。

### 備份與還原
- **D1 Time Travel**（Cloudflare 內建）：可把資料庫還原到過去 30 天內任一時間點。Cloudflare → D1 → jytrvl-chess → Time Travel。
- 匯出完整備份：`npx wrangler d1 export jytrvl-chess --remote --output backup-YYYYMMDD.sql`
- 建議每月匯出一次並另存。

## 7. 監控與錯誤

- Worker `jytrvl-chess-realtime` 已開啟 Observability（Cloudflare → Workers → Observability）。
- Pages Functions 日誌：Pages → Deployments → 該次部署 → Functions → Real-time logs。
- 前端與 API 錯誤寫入 D1 `errors` 資料表（保留最新 5,000 筆）：
  `SELECT datetime(ts/1000,'unixepoch'), source, message, url FROM errors ORDER BY id DESC LIMIT 50;`
- 健康檢查：`GET https://chess.jytrvl.com/api/health` → `{"ok":true,"auth":true,…}`（`auth:false` 代表 Google 密碼未設定）。

## 8. 安全措施摘要

- 領地爭奪戰由 TerritoryRoom 以 10 Hz 固定 tick 執行共用引擎；客戶端只能送出方向（每連線約 25 次／秒上限），位置、速度、圈地、淘汰、勝負都由伺服器計算。
- 貪食蛇由 SnakeRoom 每 100 ms 權威步進；方塊由 BlocksRoom 依序重播雙方輸入（不早於目前 tick、不超前伺服器時鐘 6 tick），重力由伺服器時鐘推進（延遲上限 0.5 秒），障礙行與缺口由伺服器決定。
- 單人紀錄：`POST /api/solo/start` 發出 HMAC 簽章種子；`POST /api/solo/finish` 重播輸入、比對分數與實際經過時間，同一憑證只能提交一次。
- 所有線上棋步由 GameRoom 以共用規則引擎驗證；勝負、計時、和棋申請皆由伺服器裁定。
- 暗棋暗子身分只存在 Durable Object，對局結束前不會傳到瀏覽器（含 hiddenPool 固定排序，避免順序洩漏）。
- 流量限制：房間建立、配對、登入、WebSocket 連線、錯誤回報各有每 IP 上限；每條 WebSocket 另有 token bucket。
- 計分防護：同帳號、同網路、過短對局、同一對手 24 小時超過 3 局皆不計分；計分對局禁用 AI 教練與悔棋。
- 安全標頭：CSP、HSTS、X-Frame-Options DENY、COOP/COEP（引擎多執行緒需要）。
- Cloudflare 預設 DDoS 防護涵蓋 Pages 與 Workers。

## 9. 常見維運作業

| 作業 | 方法 |
|---|---|
| 停權玩家 | `UPDATE users SET banned = 1 WHERE nickname = '…';` |
| 查看排行榜原始資料 | `SELECT u.nickname, r.* FROM ratings r JOIN users u ON u.id = r.user_id WHERE game='chess' ORDER BY rating DESC;` |
| 回復到上一版 | Pages → Deployments → 選舊部署 → Rollback；Worker → Deployments → Rollback |
| 更新引擎 | 更新 `stockfish`／`fairy-stockfish-nnue.wasm` 套件版本 → `npm run ladder` 驗證難度 → 推送 |
| 調整 AI 難度 | `shared/ai/uci.ts` 的 `LEVELS`；暗棋在 `shared/ai/banqi-ai.ts`；領地爭奪戰在 `shared/territory/ai.ts`（調整後執行 `npm run ladder:territory`） |
| 貪食蛇／方塊排行榜原始資料 | `SELECT u.nickname, a.* FROM arena_stats a JOIN users u ON u.id = a.user_id WHERE game = 'snake' ORDER BY best_score DESC;`；單人：`SELECT * FROM solo_best WHERE game='blocks' AND mode='sprint' ORDER BY best_ms;` |
| 移除可疑單人紀錄 | `DELETE FROM solo_best WHERE user_id = '…' AND game = '…' AND mode = '…';` |
| 調整貪食蛇／方塊 AI | `shared/snake/ai.ts`、`shared/blocks/ai.ts`，調整後執行 `npm run ladder:snake`、`npm run ladder:blocks` |
| 調整配對 | `realtime/src/arena/ArenaLobby.ts` 的 `POOLS` |
| 領地爭奪戰排行榜原始資料 | `SELECT u.nickname, t.* FROM territory_stats t JOIN users u ON u.id = t.user_id ORDER BY best_score DESC;` |
| 調整領地爭奪戰配對 | `realtime/src/TerritoryLobby.ts`：滿 8 人、第 2 人加入 10 秒後、或單獨一人等待 20 秒後開局，不足 4 人以中等 AI 補滿，每場 3 分鐘 |

## 10. 授權義務（GPL-3.0）

瀏覽器下載的 Stockfish／Fairy-Stockfish 屬於「散布」。本 Repo 公開完整原始碼，`/engines/SOURCES.txt` 與「關於」頁面列出引擎原始碼位置。若日後 Repo 改為私有，必須另外提供引擎與整體程式的對應原始碼。

## 11. 多人遊戲伺服器成本評估

依 Cloudflare Durable Objects 官方價目（2026 年版）：Workers Paid 每月含 100 萬次請求、40 萬 GB-s 執行時間，超出部分每百萬請求 US$0.15、每百萬 GB-s US$12.50；Workers Free 每日 10 萬次請求、13,000 GB-s。執行時間以每個物件 128 MB 計；收到的 WebSocket 訊息以 20:1 計為請求，送出的訊息不計費。

| 項目 | 估算 |
|---|---|
| 一場貪食蛇（3 分鐘，房間持續運算） | 180 s × 0.125 GB ≈ 22.5 GB-s；轉向訊息約每人每秒 2 則 → 可忽略 |
| 一場方塊對戰（平均約 2 分鐘） | ≈ 15 GB-s；輸入約每人每秒 6 則 → 每場約 70 次計費請求 |
| 一場領地爭奪戰（3 分鐘） | ≈ 22.5 GB-s |
| 棋類房間 | 使用休眠（hibernation）WebSocket，閒置不計時間；成本極低 |
| Free 方案每日容量 | 約 570 場貪食蛇／領地爭奪戰，或約 860 場方塊對戰（以執行時間為上限） |
| Paid 方案每月含量 | 約 17,000 場 3 分鐘即時對戰 |
| 超出後單場成本 | 貪食蛇／領地爭奪戰約 US$0.0003、方塊約 US$0.0002 |
| 例：每日各 1,000 場三款即時遊戲 | 約 180 萬 GB-s／月 → 扣除含量後約 US$18／月＋基本費 US$5 |

降低成本的設計：房間只在對局進行時執行計時迴圈，結束即停止；大廳與配對使用休眠 WebSocket；伺服器 AI 只在需要時運算（每步數毫秒）；閒置房間 6 小時後自動刪除。D1 寫入只在對局結束時發生。

若流量成長到每日數萬場，建議：(1) 方塊對戰改以 30 Hz 廣播或差異更新；(2) 以 Cloudflare 帳單警示設定上限；(3) 依地區分配對池。
