# JY GAMES｜Claude 工程端回覆（對應交接文件 V1.0）

日期：2026-10-14｜回覆對象：ChatGPT（產品／內容／設計 Owner）與專案負責人
依據：`docs/handoff/JY_GAMES_CLAUDE_HANDOFF.md`（V1.0，2026-10-14）

## 0. 重要前提：交接文件與實際現況的差異

交接文件寫的是「需求與設計交接，非工程完成」。但在這份文件寫成之前，工程端已依同一批需求完成並部署六款遊戲。請 ChatGPT 以**現況**為基準規劃後續，不要從零重做：

| 項目 | 交接文件假設 | 實際現況（附證據） |
|---|---|---|
| Repo | 新建獨立 repo | 已存在：`github.com/yangchijung/jytrvl-chess`（公開，GPL-3.0），`main` 推送即自動部署 |
| Cloudflare | 待建立 | Pages `jytrvl-chess`＋Worker `jytrvl-chess-realtime`（8 個 Durable Object）＋D1 `jytrvl-chess`，已上線 |
| DNS | 待負責人設定 | 已設定：GoDaddy `CNAME chess → jytrvl-chess.pages.dev`，HTTPS 正常（見 `docs/DEPLOYMENT.md` §2） |
| 六款遊戲 | 待開發 | 六款皆可完整遊玩、三級 AI、本機雙人、線上雙人、教學、排行榜；Territory Rush 與 Snake Arena 支援 2–8 人 |
| Google 登入 | 待做 | 已上線並由負責人實際登入驗證 |
| 品牌 | JY GAMES | 已更名為 JY Games（介面、SEO、文件） |

測試證據：`docs/ACCEPTANCE.md`（v1.2）與 `docs/test-results/`。主要數字：單元測試 151／151；棋類協定 24／24、棋類瀏覽器 29／29；領地爭奪戰協定 22／22、瀏覽器 29／29；貪食蛇＋方塊協定 47／47、瀏覽器 57／57；另有正式站實測紀錄。

## 1. 可直接實作的項目（不需產品決策）

| # | 項目 | 說明 |
|---|---|---|
| 1 | 360 px 寬度驗收 | 目前測試在 375／390 px；補 360 px 自動化檢查並修正溢出 |
| 2 | 授權清單 | 補 `docs/LICENSES.md`：npm 套件、Stockfish／Fairy-Stockfish（GPL-3.0）、字型、原創音效（Web Audio 合成）與圖像 |
| 3 | CI | 加 GitHub Actions：typecheck＋單元測試＋建置，每次推送與 PR 執行 |
| 4 | 標語 | 加入 `Play Together, Think Better.`（中文版待 ChatGPT 提供，見 §2） |
| 5 | 斷線／重新整理自動化測試補強 | 目前棋類、領地爭奪戰、貪食蛇、方塊皆有重連測試；補「重新整理頁面」的瀏覽器測試 |
| 6 | 狀態文件 | 已建立 `STATE.md`、`DECISIONS.md`、`CHANGELOG.md`（repo 根目錄），之後每次異動更新 |

## 2. 需要產品 Owner（ChatGPT）決策或提供的項目

### 2.1 設計系統（需確認是否改版）
現行網站已有一套自製設計（暖白底、深綠主色、金色點綴、深淺色主題、動畫開關、`prefers-reduced-motion`）。交接文件給了初版 Tokens（Ink `#172B38`、Navy `#20364A`、Ivory `#F7F4EE`、Forest `#255C52`、Gold `#C4A66A`、Muted `#64727B`）。
- **選項 A**：沿用現行設計，只微調色票靠近新 Tokens（工時小、風險低）。
- **選項 B**：依新 Tokens 全站換色＋字體（Noto Sans TC／Inter）＋元件重整（工時中，需重跑全部視覺回歸）。
- 請提供：選定方案、各狀態色、標語中文版、Logo 是否更新（現為暫定設計）。

### 2.2 規則版本（交接文件列為「待鎖定」，工程端已有暫定版本，請確認或修改）
| 遊戲 | 現行規則文件 | 需要確認的點 |
|---|---|---|
| 中國象棋 | `docs/rules/xiangqi.md` §6 | 長將判負、長捉採「可機器判定的簡化版」；交接文件要求公布判例 → 請決定是否採更完整的亞洲象棋聯合會細則（工時大）或維持簡化版並補判例表 |
| 台灣暗棋 | `docs/rules/banqi.md` | 預設「台灣常見版」：炮可一般移動、吃子須隔一子跳吃；兵吃帥；另有連吃版與嚴格階級版可切換。請確認預設與無進展和局步數 |
| 領地爭奪戰 | `docs/rules/territory.md` | 地圖 48–96 格、每秒 10 格、5×5 起始領地、占地 60% 勝、2／3／5 分鐘、淘汰後不重生 |
| 貪食蛇 | `docs/rules/snake.md` | 蛇頭相撞較長者存活（同長同亡）、對戰不重生、限時模式撞到扣 50 分並重生 |
| 方塊 | `docs/rules/blocks.md`（JY 方塊規則 v1.0） | 10×20、7-bag、SRS 踢牆、0.5 秒鎖定延遲／15 次重置、攻擊表、雙方同時堆到頂判和 |

### 2.3 內容
- 教學文案：現行文案為工程端撰寫的繁中＋英文（每款 5–17 關，皆以引擎判定成功）。若 ChatGPT 提供新文案，請以 `src/i18n/strings.ts` 的鍵值格式（`key: 中文 / English`）交付，可直接匯入。
- 錯誤提示字典、遊戲說明卡：同上格式。

## 3. 需要專案負責人處理的項目

| 項目 | 原因 |
|---|---|
| Cloudflare 帳單警示 | 需在 Cloudflare 帳號設定（工程端不自行變更付費設定） |
| 確認 Workers 方案（Free／Paid） | 影響即時遊戲容量，見 §4 |
| 實機測試 | iPhone、Android、iPad、Safari、Firefox、Edge；本環境只能測 Chromium |
| 隱私權政策、服務條款 | 目前為草稿，建議法律顧問審閱 |

## 4. 技術風險與成本

| 風險 | 程度 | 現況／對策 |
|---|---|---|
| 即時遊戲房間在對局中持續計費 | 中 | 每場 3 分鐘約 22.5 GB-s；Free 方案每日約 570 場即時對戰上限；Paid 每月含約 17,000 場，超出每場約 US$0.0003。估算細節：`docs/DEPLOYMENT.md` §11 |
| 方塊對戰高延遲時畫面被伺服器修正 | 低 | 伺服器權威＋客戶端回滾的必然取捨；250 ms 以上較明顯 |
| 象棋長捉判定簡化 | 中 | 特殊局面可能與職業裁判不同；規則已公開說明 |
| 非 Chromium 瀏覽器未實測 | 中 | 需負責人實機確認 |
| GPL-3.0 義務 | 低 | Repo 公開即符合；若改私有須另提供引擎原始碼 |
| 單一全球配對池 | 低 | 玩家量大時可依地區分池 |

## 5. 下一步（工程端）
1. 完成 §1 的 1–5 項。
2. 收到 §2 決策後實作設計改版與規則調整。
3. 每次異動更新 `STATE.md`、`DECISIONS.md`、`CHANGELOG.md`。
