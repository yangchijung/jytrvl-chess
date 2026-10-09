# JY Chess 部署與維護手冊

## 1. 正式環境資源

| 資源 | 名稱／位置 | 說明 |
|---|---|---|
| GitHub | `yangchijung/jytrvl-chess`（公開） | 推送 `main` 即自動部署 |
| Cloudflare Pages | `jytrvl-chess` → `jytrvl-chess.pages.dev` | 前端＋ `/api/*` Pages Functions |
| Cloudflare Worker | `jytrvl-chess-realtime` | Durable Objects：GameRoom、Matchmaker、RateLimiter、TerritoryRoom、TerritoryLobby；**無公開網址** |
| Cloudflare D1 | `jytrvl-chess`（ID `0e9c760d-13d1-4926-a9f5-592f6065bb5d`，亞太區） | 會員、積分、對局紀錄、領地爭奪戰戰績、錯誤紀錄 |
| 自訂網域 | `chess.jytrvl.com` | GoDaddy CNAME → `jytrvl-chess.pages.dev` |
| Google Cloud | 專案 `jy-chess`，OAuth 用戶端「JY Chess Web」 | Google 登入 |

既有網站（jytrvl.com、planner、flight、riskctrl 等）與本專案完全獨立，互不影響。

## 2. DNS（GoDaddy）

| Type | Host / Name | Points to / Value | TTL |
|---|---|---|---|
| CNAME | `chess` | `jytrvl-chess.pages.dev` | 1/2 Hour（或 Auto） |

- 只需要這一筆。Worker 不需要網域：Pages Functions 透過 Durable Object 綁定在 Cloudflare 內部呼叫它。
- WebSocket 走同一個網域（棋類 `wss://chess.jytrvl.com/api/rooms/<代碼>/ws`、領地爭奪戰 `wss://chess.jytrvl.com/api/territory/rooms/<代碼>/ws`），不需額外設定。
- HTTPS 憑證由 Cloudflare Pages 自動簽發與續約。

## 3. 部署流程

兩個 Cloudflare 專案都連到同一個 Repo，推送 `main` 後自動建置：

| 專案 | Build command | Deploy／Output |
|---|---|---|
| Pages `jytrvl-chess` | `npm run build` | 輸出 `dist`；綁定與變數由根目錄 `wrangler.toml` 管理 |
| Worker `jytrvl-chess-realtime` | （無） | `npx wrangler deploy -c realtime/wrangler.toml` |

**注意順序**：若修改了 Durable Object 類別（新增／改名），必須先讓 Worker 部署成功，再部署 Pages；並在 `realtime/wrangler.toml` 新增一筆 `[[migrations]]`（tag 遞增），不可修改既有的 migration。

目前的 migration：`v1`（GameRoom、Matchmaker、RateLimiter）、`v2`（TerritoryRoom、TerritoryLobby）。v2 上線時即依此順序：先推送只含 Worker 變更的提交，確認 Worker 部署成功後，再推送 Pages 的 `TROOMS`／`TLOBBY` 綁定。

## 4. 設定與機密

| 名稱 | 類型 | 位置 |
|---|---|---|
| `PUBLIC_ORIGIN` | 變數 | `wrangler.toml` |
| `GOOGLE_CLIENT_ID` | 變數（公開） | `wrangler.toml` |
| `GOOGLE_CLIENT_SECRET` | **Secret** | Cloudflare → Pages `jytrvl-chess` → Settings → Variables and secrets |
| Session 簽章金鑰 | 自動產生 | D1 `config.session_key`（首次啟動時建立） |

更換 Google 密碼：Google Cloud Console → Google Auth Platform → 用戶端 → JY Chess Web → 新增密碼 → 更新 Cloudflare Secret → 重新部署 → 停用舊密碼。

強制所有使用者重新登入：`DELETE FROM sessions;`（D1 Console）。

## 5. Google OAuth

- 回呼網址：`https://chess.jytrvl.com/api/auth/google/callback`
- JavaScript 來源：`https://chess.jytrvl.com`
- 範圍：`openid email profile`（基本範圍，發布為「正式版」不需 Google 審查）
- 流程：Authorization Code + PKCE + state（簽章 Cookie，10 分鐘有效）

## 6. 資料庫

- Schema 在 `server/schema.ts`，首次請求時自動建立（冪等）；同內容在 `migrations/0001_init.sql`、`migrations/0002_territory.sql`（`SCHEMA_VERSION` = 2）。
- 領地爭奪戰：`territory_stats`（每位會員一列：games、wins、kills、best_pct、best_score）、`territory_games`（每場線上對局，`counted` 表示是否列入戰績）。與棋類的 `ratings`／`games` 完全分開。
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
| 領地爭奪戰排行榜原始資料 | `SELECT u.nickname, t.* FROM territory_stats t JOIN users u ON u.id = t.user_id ORDER BY best_score DESC;` |
| 調整領地爭奪戰配對 | `realtime/src/TerritoryLobby.ts`：滿 8 人或第 2 人加入 10 秒後開局，不足 4 人以中等 AI 補滿，每場 3 分鐘 |

## 10. 授權義務（GPL-3.0）

瀏覽器下載的 Stockfish／Fairy-Stockfish 屬於「散布」。本 Repo 公開完整原始碼，`/engines/SOURCES.txt` 與「關於」頁面列出引擎原始碼位置。若日後 Repo 改為私有，必須另外提供引擎與整體程式的對應原始碼。
