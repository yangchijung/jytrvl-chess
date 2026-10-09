import { describe, it, expect } from 'vitest';
import { zh, en } from '../src/i18n/strings';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('i18n', () => {
  it('every key exists and is non-empty in both languages', () => {
    for (const k of Object.keys(zh)) {
      expect((en as Record<string, string>)[k], k).toBeTruthy();
      expect((zh as Record<string, string>)[k], k).toBeTruthy();
    }
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });
  it('placeholders match between languages', () => {
    for (const k of Object.keys(zh) as (keyof typeof zh)[]) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(en[k]), k).toBe(ph(zh[k]));
    }
  });
  it('every reason code produced by the engines has a translation', () => {
    const reasons = new Set<string>();
    const arena = (f: string) => f.includes('territory') || f.includes('snake') || f.includes('blocks') || f.includes('arena');
    for (const f of files('shared').filter((f) => !arena(f))) for (const m of readFileSync(f, 'utf8').matchAll(/reason: '([a-z_]+)'/g)) reasons.add(m[1]);
    for (const f of files('realtime/src').filter((f) => !arena(f))) for (const m of readFileSync(f, 'utf8').matchAll(/reason: '([a-z_]+)'/g)) reasons.add(m[1]);
    for (const r of reasons) expect((zh as Record<string, string>)[`reason.${r}`], r).toBeTruthy();
  });
  it('every Territory Rush end reason and death reason has a translation', () => {
    for (const r of ['last_standing', 'domination', 'time', 'all_dead']) expect((zh as Record<string, string>)[`tr.end.reason.${r}`], r).toBeTruthy();
    for (const r of ['wall', 'self', 'land', 'collision', 'left']) expect((zh as Record<string, string>)[`tr.ev.died.${r}`], r).toBeTruthy();
  });
  it('every Snake Arena and Block Puzzle Battle reason has a translation', () => {
    for (const r of ['last_standing', 'all_dead', 'time', 'crash']) expect((zh as Record<string, string>)[`sn.end.reason.${r}`], r).toBeTruthy();
    for (const r of ['wall', 'self', 'body', 'head', 'left']) expect((zh as Record<string, string>)[`sn.ev.died.${r}`], r).toBeTruthy();
    for (const r of ['topout', 'draw', 'time']) expect((zh as Record<string, string>)[`bl.end.reason.${r}`], r).toBeTruthy();
    for (const k of ['open', 'pillars', 'cross', 'rooms']) expect((zh as Record<string, string>)[`sn.map.${k}`], k).toBeTruthy();
    for (const k of ['left', 'right', 'soft', 'hard', 'cw', 'ccw', 'r180', 'hold']) expect((zh as Record<string, string>)[`bl.ctl.${k}`], k).toBeTruthy();
  });
  it('every literal t("…") key used in the UI exists', () => {
    const missing: string[] = [];
    for (const f of files('src')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!(m[1] in zh)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
  it('Taiwan terminology: no simplified-Chinese vocabulary in zh strings', () => {
    const banned = ['视频', '软件', '质量', '信息', '默认', '设置', '账号', '登录', '用户', '网络'];
    const all = Object.values(zh).join('\n');
    for (const w of banned) expect(all.includes(w), w).toBe(false);
  });
});
