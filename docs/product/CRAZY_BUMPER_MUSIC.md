# Crazy Bumper — background music

Three tracks made by James with Suno on his paid plan (commercial use allowed under that plan). Processed to
MP3 112 kbps, −16 LUFS integrated, −1.5 dBTP peak. 2.3 MB in total.

| Screen | File | Length | Tempo | Loop (s) |
| --- | --- | --- | --- | --- |
| Title | `public/bumper/music/title.mp3` | 77.3 s | ≈152 BPM, waltz feel | 19.9459 → 76.2438 |
| Playing | `public/bumper/music/play.mp3` | 68.2 s | ≈144 BPM | 19.2725 → 67.1743 |
| Result | `public/bumper/music/results.mp3` | 26.0 s | — | none (plays once, fades out) |

## How the game plays them

- `src/bumper/core/AudioSynth.ts` (`MUSIC_TRACKS`, `setMusic`, `setRate`).
- Nothing is fetched on first paint. The AudioContext is created on the first tap, click or key (iOS rule); only
  then is the current track fetched and decoded.
- Each track plays from 0, then loops between its loop points (on bar lines) with an `AudioBufferSourceNode`
  `loopStart` / `loopEnd`, so the loop has no gap. Not `<audio loop>`.
- Changing screens cross-fades over 0.6 s. The last 10 s of a round play at `playbackRate` 1.08.
- Music and sound effects have separate buses; the sound button mutes both and is remembered in
  `localStorage` (`jy-bumper-muted`, wrapped in try/catch). Sound pauses while the tab is hidden.
- A file that fails to load or decode is skipped silently (no console error); the game is fully playable
  without music.
