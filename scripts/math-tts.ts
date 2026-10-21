// Math Island — pre-generate the spoken prompts with Azure Neural TTS (spec §5). Run offline by the owner:
//   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=eastasia npx tsx scripts/math-tts.ts [--out <folder>]
// --out writes the files to any folder (e.g. the computer's Public folder) instead of the project.
// The key is read from the environment only (never committed, never in the front-end bundle). Writes
// public/math/audio/<locale>/v<version>/<id>.mp3 plus a manifest of text / locale / voice / file for review.
// Not yet run: no key is available to engineering (docs/ACCEPTANCE.md §25 lists MA05 audio as untested).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIPS, VOICE } from '../src/math/audio';

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
const outAt = process.argv.indexOf('--out');
const dir = outAt > 0 && process.argv[outAt + 1] ? process.argv[outAt + 1] : join('public', 'math', 'audio', VOICE.locale, `v${VOICE.version}`);
const manifest = Object.entries(CLIPS).map(([id, text]) => ({ id, text, locale: VOICE.locale, voice: VOICE.voice, file: `${id}.mp3`, version: VOICE.version }));

if (process.argv.includes('--list') || !key || !region) {
  console.log(JSON.stringify(manifest, null, 2));
  if (!key || !region) console.error('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set: listed the clips only.');
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
for (const c of manifest) {
  const ssml = `<speak version="1.0" xml:lang="${c.locale}"><voice name="${c.voice}"><prosody rate="-10%">${esc(c.text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
    body: ssml,
  });
  if (!res.ok) throw new Error(`${c.id}: HTTP ${res.status}`);
  writeFileSync(join(dir, c.file), Buffer.from(await res.arrayBuffer()));
  console.log('wrote', c.file);
}
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`done: ${manifest.length} files in ${dir}`);
