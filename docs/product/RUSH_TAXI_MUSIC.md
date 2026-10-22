# 狂飆小黃 配樂

James 2026-10-22 用 Suno 製作（四首純音樂，提示詞見下）。James 2026-10-22 確認：四首都是在 Suno 付費方案有效期間生成，可以商業使用（Suno 規定免費方案生成的歌曲不能商用，事後升級也不會補授權）。

| 檔案 | 用途 | 原始長度 | 節拍 | 循環區段（秒） |
| --- | --- | --- | --- | --- |
| `public/taxi/music/menu.mp3` | 開始選單 | 132 s | 約 103 BPM | 32.60 → 69.34 |
| `public/taxi/music/arcade.mp3` | 街機模式 | 136 s | 約 152 BPM | 26.61 → 83.61 |
| `public/taxi/music/practice.mp3` | 練習模式 | 189 s | 約 96 BPM | 44.79 → 85.64 |
| `public/taxi/music/results.mp3` | 結算（播一次，取前 26 秒，最後 3 秒淡出） | 82 s | 約 144 BPM | — |

處理方式：以節拍偵測找到小節線上、前後音色與音量最接近的兩點當循環點（4 小節的倍數），接縫用 40 ms 交叉淡化；檔案只保留到循環終點後 1 秒。響度統一到 −16 LUFS（真峰值 −1.5 dBTP），MP3 112 kbps，四首合計約 3.7 MB，進入遊戲後才下載，不影響首次載入。

播放：Web Audio 緩衝區在兩個循環點之間無縫循環；切換畫面時 0.6 秒交叉淡化；街機最後 10 秒加快到 1.08 倍；暫停時音量降到約三分之一；切到背景分頁時暫停聲音。音樂與音效音量分開（暫停選單兩個滑桿），記在這台裝置的瀏覽器裡。iOS 規定要在使用者點按後才能出聲，所以第一次點按畫面（例如按「街機」）時才開始播放。

## Suno 提示詞（純音樂模式）

- 街機：Upbeat instrumental arcade rock, 150 BPM, driving drums, punchy electric bass, bright crunchy guitar riffs, catchy major-key lead guitar melody with pentatonic hooks, energetic but family-friendly, sunny harbor city summer feeling, no vocals, seamless loop, video game soundtrack
- 選單：Relaxed instrumental surf rock, 105 BPM, clean twangy electric guitar, light shaker and tambourine, warm bass, seaside harbor breeze at sunset, cheerful and inviting, simple memorable melody, no vocals, loopable, video game menu music
- 練習：Laid-back instrumental funk rock, 95 BPM, groovy bass line, wah guitar, light organ, relaxed cruising through a sunny city, playful, steady groove without big climaxes, no vocals, loopable background music for a video game
- 結算：Short triumphant instrumental rock fanfare, 140 BPM, guitar power chords, drum roll, bright brass stabs, victory celebration, family-friendly, no vocals, ends with a strong final chord
