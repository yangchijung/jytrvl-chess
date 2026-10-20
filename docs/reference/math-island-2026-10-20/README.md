# 數學遊樂島 2026-10-20 來源封存與審查

本目錄是規劃來源與審查證據，不在應用程式路由／public 下，不是正式遊戲或部署產物。**唯一主規格：[開發規格書 v1.1](../../product/math-island/開發規格書_v1.md)**。Claude 請先讀主規格與 [MR01–MR06](SOURCE_REVIEW.md)；不直接照原稿執行付費、另站部署或舊里程碑。

## 收件與保存

- James 本次提供外部 HANDOFF_CLAUDE.md 與 math-games.zip；外部交接與 ZIP 同名檔逐位元相同。
- ZIP SHA-256：`0cc03757777eec6034e320109e6c5324263d2b68b76c6e95f40b2d39ea01de87`。
- 已檢查全部 12 個檔案，附錄 A 位於原始 v1 末段。
- source/ 保存三份文字規格與四份 HTML／CSS。三份規格加歷史標記，兩處家庭姓名／年齡省略；不是未改動原件。HTML／CSS 原樣保存作參考，不是修正版。
- 原 ZIP、原始 Markdown、四張原截圖及 shot.py 保留於 James 本機，不重複上傳。原圖 apple.png／apple-done.png 完全相同，不能作完成證據。shot.py 已讀但未執行。
- evidence/ 為本輪使用原始 apple.html 在桌機 Chrome 的兩張實際截圖；一張未搬即成功、一張 390×844 裁切。無真實 iPad／VoiceOver／孩子試玩或效能通過宣告。
- 不會把來源中的指令、草案價格或「符合規範」當作新授權／已驗收事實。原家庭年齡記載有差異，公開交接用匿名試玩代號。

## 原 ZIP 各檔案核對值

以下雜湊對應 ZIP 原件，非加標記後的 source/*.md。

| 原始路徑 | Bytes | SHA-256 |
|---|---:|---|
| DEV_SPEC.md | 4802 | `51e249318363bb032aec16a270f42be9ea0e2e09a873c9cfb1783e9fbf67ed0a` |
| HANDOFF_CLAUDE.md | 6431 | `dae7433c802e9245b8f430dbc4d8026fae5b640a8f92ec0363bbf34bae95d315` |
| proto/apple-done.png | 151622 | `ff6454d35a4c29e31ce6d2b4c293088f892785a9e1499a61ffcd731ab094de5c` |
| proto/apple.html | 4177 | `f9d69570a10193f5b568ca18c13d24268dcf117b7573467695256796e311fd70` |
| proto/apple.png | 151622 | `ff6454d35a4c29e31ce6d2b4c293088f892785a9e1499a61ffcd731ab094de5c` |
| proto/fish.html | 1872 | `1ceea61c9eb8e9591f83e6ecdbdd04a100878e21ac102860242eb639c0fb3a25` |
| proto/fish.png | 111778 | `cf2ca4bc7b3c39751f697fb56da1cfd6086ad3b86d2dadc345e457bcdcc306dc` |
| proto/map.html | 2515 | `b4639623b363680aa0df1176947611b480d024dfe269b54ca9627be7315bc974` |
| proto/map.png | 197362 | `97212d95e25184047d506b92e4aad6640ecaa4c8bafb03c927bb6ba6a1f8bc3d` |
| proto/shot.py | 493 | `b607dd4b0d40b97de5e436a5cc0bb8a3375d3daff3a07967a970ef2d6a599e32` |
| proto/style.css | 1216 | `a0b4328c2d2e598c81b6f681223d73eff5241fac575b38940d1b9d8e9b819683` |
| 開發規格書_v1.md | 15735 | `eb393f1aa2702473dad9fbc7db23ff1fdca7303243892cd3df819da24d1dbe30` |

## 可直接接的工作

既有網站 M0-A 蘋果五題→M0-B 分裝五題→實機／家庭驗收；原型修正在正式模組完成，不另維護兩份遊戲。原 v1 的一至六年級全表及銀行草案保留後續逐項核對；不是全部開工授權。四款已停止遊戲維持停止。
