// Rush Taxi — where the cab is, in the real-map city only (level.osm):
// - RoadName: the road being driven on, a small line under the speed (nothing off-road or on an unnamed road);
// - DistrictLabel: the 行政區 name for about 2 s when the cab enters another district (and once at the start),
//   on paper with an ink border at the foot of the minimap, so it never covers a control. Announced politely.
// Both look the cab up four times a second (whereabouts.ts uses a grid index, so a lookup is cheap).
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game';
import type { Level } from '../world/level';
import type { Lang } from '../../i18n';
import { districtFinder, roadFinder, type DistrictName } from './whereabouts';

const LOOKUP_MS = 250;
const DISTRICT_SHOW_MS = 2000;

const finders = new WeakMap<Level, { district: ReturnType<typeof districtFinder>; road: ReturnType<typeof roadFinder> }>();
function findersFor(level: Level) {
  if (!level.osm) return null;
  let f = finders.get(level);
  if (!f) finders.set(level, (f = { district: districtFinder(level.osm), road: roadFinder(level.osm) }));
  return f;
}

/** polls the cab's position and calls `fn` with the finders, every LOOKUP_MS */
function usePoll(game: () => Game | null, fn: (f: NonNullable<ReturnType<typeof findersFor>>, x: number, z: number) => void) {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    const tick = () => {
      const g = game();
      const f = g && findersFor(g.level);
      if (!g || !f) return;
      const p = g.pose();
      cb.current(f, p.x, p.z);
    };
    tick();
    const t = setInterval(tick, LOOKUP_MS);
    return () => clearInterval(t);
  }, [game]);
}

export function RoadName({ game, lang }: { game: () => Game | null; lang: Lang }) {
  const [road, setRoad] = useState<{ zh: string; en: string } | null>(null);
  usePoll(game, (f, x, z) => {
    const r = f.road(x, z);
    setRoad((old) => (old?.zh === r?.zh ? old : r));
  });
  if (!road) return null;
  return (
    <div className="taxi-road" data-testid="taxi-road" lang={lang === 'zh' ? 'zh-Hant-TW' : 'en'}>
      {road[lang]}
    </div>
  );
}

export function DistrictLabel({ game, lang, mode }: { game: () => Game | null; lang: Lang; mode: 'arcade' | 'practice' }) {
  const [shown, setShown] = useState<DistrictName | null>(null);
  const last = useRef<string | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  usePoll(game, (f, x, z) => {
    const d = f.district(x, z);
    // outside every district (the harbour, a gap between polygons): keep the last one, show nothing new
    if (!d || d.zh === last.current) return;
    last.current = d.zh;
    setShown(d);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setShown(null), DISTRICT_SHOW_MS);
  });
  useEffect(() => () => clearTimeout(hide.current), []);
  return (
    <div className="taxi-district-live" data-mode={mode} aria-live="polite" aria-atomic="true">
      {shown && (
        <span className="taxi-district" data-testid="taxi-district" data-zh={shown.zh} key={shown.zh} lang={lang === 'zh' ? 'zh-Hant-TW' : 'en'}>
          {shown[lang]}
        </span>
      )}
    </div>
  );
}
