# 首頁及共用介面｜真實 400% 縮放／實機追蹤
日期：2026-10-18，Asia/Taipei。正式站 https://chess.jytrvl.com 。
本輪原碼參考 main 52945709f385252312fd45602cee32a0be4c8eb1（文件提交；功能修正 63b4b13）。測的是當時正式站實際畫面；未從站內取得部署 SHA，不將 GitHub head 當成精確部署證明。

## 結果
R1–R4 沿用當日已完成的獨立複驗，沒有重新判定失敗。本輪真正 400% 縮放已執行：首頁無水平溢出，但新增 R5 焦點部分遮擋，因此不能宣告全部通過。iPhone／iPad Safari＋VoiceOver 實測仍待使用者回報；未執行的項目保持未測。

## 方法與觀察
Chrome on macOS，透過原生 Chrome 選單的縮放控制從 100% 增至 400%，原生輔助使用樹顯示「縮放比例：400%」。不是改 CSS 字體、transform 或 device emulation。
- 原始頁面 viewport 1405×619 CSS px、devicePixelRatio 2、root font 16px。
- 400% viewport 351×154 CSS px、devicePixelRatio 8、root font 16px。DOM 實際寬 351.25px，整數 innerWidth 351。
- 這不是 1280px 視窗縮到 320 CSS px 的精確測試；不以本次結果涵蓋所有視窗及瀏覽器。
- 中／英 × 淺／深首頁四組均有 7 款、14 個遊戲目的地；header/main/footer 可見元素的左右邊界未超出 viewport（容許四捨五入 0.5px），document scrollWidth 為 351。
- 英文深色選單能捲到 Profile；Escape 關閉後回到選單按鈕。最後項目底部量測為 154.75px，視窗高 154，尚須連同 R5 檢查完整控制及焦點框。
- 英文深色設定與中文系統主題設定無水平溢出；設定末端可用 Tab 離開到頁尾。這不代替讀屏的實際朗讀。
- 結束已將 Chrome 縮放重設 100%，驗證 viewport 1405×619、DPR 2；網站恢復原先跟隨系統主題。

## R5｜固定頁首遮住鍵盤焦點上緣（待 Claude 修正）
重現：首頁 → Chrome 真實 400% → 重新載入 → Tab 到「跳到主要內容」→ Enter → Tab 到「開始玩：西洋棋」。
- document.activeElement 為 data-testid=play-chess，URL 為 /#main。
- 按鈕 top=53.375、bottom=101.375、height=48 CSS px。
- 固定 header top=0、bottom=57、height=57 CSS px。
- 按鈕上緣被頁首覆蓋 3.625 CSS px，焦點框上側也被截掉；文字仍可辨認。不要把這寫成按鈕完全不可用或所有 WCAG 項目失敗。
- [鍵盤重現截圖](../test-results/screens/home-manual-2026-10-18/home-native400-keyboard.jpg)。
- 另一次透過 locator 聚焦同按鈕也得到相同幾何資料；結論採用上述實際鍵盤重現。

修正目標：短視窗／400% 下，被 Tab／Shift+Tab／skip-link 帶到的控制與完整 focus ring 都不受 sticky header 或容器裁切。可採短高度時取消 sticky，或正確的 scroll-padding／scroll-margin；由 Claude 選最小修正，不再縮小字體或觸控區。
補查：首頁全部開始玩／玩法、選單首尾、設定選項及對話框焦點。提供真實縮放截圖與幾何測量，再回覆 Issue #6；維持該 Issue open，實機／讀屏另外追蹤。

## 實機及 VoiceOver 回報單（待回覆）
使用者已選 iPhone／iPad Safari＋VoiceOver。目前尚無機型、系統版本或 A–D 測試結果；不把 Chrome accessibility tree 或模擬手機當實機證據。

| 項目 | 操作與通過條件 | 狀態 |
|---|---|---|
| A | Safari 首頁直／橫向七卡、選單、頁尾可見可按；切英文及深色沒有截字 | 未測 |
| B | 在實際 iPhone／iPad 開啟 VoiceOver，左右滑焦點、雙點啟動 | 未測 |
| C | 讀出開始玩：西洋棋與開啟選單的名稱；選單開／關後焦點可繼續，能進設定 | 未測 |
| D | 設定讀出主題已選取及動畫開／關；切換、切英文後仍可理解，恢復原偏好 | 未測 |

回報格式：機型／iOS 或 iPadOS 版本／日期；A–D 各通過、卡點或未測。若只測一台，另一台不自動算通過。首頁及共用介面的這組結果不延伸為數獨或所有遊戲讀屏驗收。
[Apple VoiceOver 操作說明](https://support.apple.com/zh-tw/guide/iphone/iph3e2e415f/ios)。實機需要使用者操作，工程可以先開工，不等這份回報。
