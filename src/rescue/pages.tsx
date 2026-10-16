// Planet Rescue Crew — playable prototype (same-device team play). Each role sees a different card behind a
// "pass the tablet" cover; the team writes one plan on a shared board, everyone confirms, then the rover runs it.
// Art, missions and copy are provisional (docs/handoff/KIDS_GAMES_HANDOFF_TO_CHATGPT.md).
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format, useI18n } from '../i18n';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MIN_TO_GO, missionOf, rolesOf } from '../../shared/rescue/room';
import { OnlineRescue } from './online';
import { HEAVY, ITEMS, ROLES, ROUTE_IDS, run, type Ev, type Item, type Mission, type Role, type RouteId, type RouteKind, type RunResult, type Trip } from '../../shared/rescue/engine';
import { MISSIONS } from '../../shared/rescue/missions';
import { BaseArt, DepotArt, ItemIcon, RoleArt, RouteKindIcon, RoverArt } from './art';

type L = { zh: string; en: string };
type Mode = 'three' | 'two' | 'solo';
const T = {
  title: { zh: '星球救援隊', en: 'Planet Rescue Crew' },
  proto: { zh: '試玩原型', en: 'Prototype' },
  story: { zh: '基地沒電了！三個人一起把東西送過去', en: 'The base lost power! Work together to deliver the parts' },
  team: { zh: '幾個人玩？', en: 'How many players?' },
  three: { zh: '3 人', en: '3 players' },
  two: { zh: '2 人（一人兼兩職）', en: '2 players (one plays two roles)' },
  solo: { zh: '1 人熟悉規則', en: '1 player, learn the rules' },
  pick: { zh: '選任務', en: 'Pick a mission' },
  start: { zh: '開始任務', en: 'Start mission' },
  roles: { zh: '每人看自己的卡，再說給大家聽', en: 'Look at your own card, then tell the team' },
  passTo: { zh: '把平板交給 {r}', en: 'Pass the tablet to the {r}' },
  open: { zh: '我是{r}，打開', en: "I'm the {r}, open" },
  close: { zh: '看完了，蓋起來', en: 'Done, cover it' },
  look: { zh: '看我的卡', en: 'My card' },
  plan: { zh: '大家的計畫', en: 'Team plan' },
  time: { zh: '時間 {n}', en: 'Time {n}' },
  trip: { zh: '第 {n} 趟', en: 'Trip {n}' },
  road: { zh: '路', en: 'Road' },
  load: { zh: '載什麼', en: 'Cargo' },
  addHint: { zh: '點下面的東西放上車', en: 'Tap an item below to load it' },
  confirm: { zh: '大家都確認了嗎？', en: 'Has everyone confirmed?' },
  ok: { zh: '確認', en: 'OK' },
  go: { zh: '出發', en: 'Go' },
  retry: { zh: '改計畫再試', en: 'Change the plan' },
  next: { zh: '下一個任務', en: 'Next mission' },
  rotate: { zh: '下一關換角色喔！', en: 'Swap roles next mission!' },
  success: { zh: '基地亮燈了！任務完成', en: 'The base lights up! Mission complete' },
  running: { zh: '救援車出發…', en: 'The rover is on its way…' },
  editTip: { zh: '點車上的東西可以拿下來', en: 'Tap loaded items to remove them' },
  clear: { zh: '清空', en: 'Clear' },
  saved: { zh: '已儲存在此瀏覽器', en: 'Saved in this browser' },
  back: { zh: '換任務', en: 'Missions' },
  listen: { zh: '聽', en: 'Listen' },
  onlineMode: { zh: '各自用自己的裝置', en: 'Each on their own device' },
  onlineDesc: { zh: '建立房間，用自己的帳號或暱稱加入；每人只看到自己的卡', en: 'Create a room and join with your own account or name; each person sees only their own card' },
  create: { zh: '建立房間', en: 'Create a room' },
  joinCode: { zh: '輸入房間代碼', en: 'Room code' },
  join: { zh: '加入', en: 'Join' },
  room: { zh: '房間 {id}', en: 'Room {id}' },
  share: { zh: '複製邀請連結', en: 'Copy invite link' },
  copied: { zh: '已複製', en: 'Copied' },
  team2: { zh: '隊員', en: 'Team' },
  youAre: { zh: '你是', en: 'You are' },
  watch: { zh: '隊伍滿了，你在旁邊觀看', en: 'The team is full; you are watching' },
  waitTeam: { zh: '至少 2 人才能出發，把邀請連結傳給隊友', en: 'You need at least 2 people; send the invite link' },
  rotateBtn: { zh: '換角色', en: 'Swap roles' },
  hostPick: { zh: '房主選任務', en: 'Host picks the mission' },
  waitHost: { zh: '等房主選下一個任務', en: 'Waiting for the host to pick the next mission' },
  offline: { zh: '離線', en: 'offline' },
  host: { zh: '房主', en: 'host' },
  notFound: { zh: '找不到這個房間（可能已過期）', en: 'Room not found (it may have expired)' },
  reconnecting: { zh: '連線中斷，重新連線中…', en: 'Connection lost, reconnecting…' },
  onlyYours: { zh: '只能確認自己的角色', en: 'You can only confirm your own role' },
  role: { navigator: { zh: '導航員', en: 'navigator' }, engineer: { zh: '工程師', en: 'engineer' }, supplier: { zh: '補給員', en: 'supplier' } } as Record<Role, L>,
  roleCap: { navigator: { zh: '導航員', en: 'Navigator' }, engineer: { zh: '工程師', en: 'Engineer' }, supplier: { zh: '補給員', en: 'Supplier' } } as Record<Role, L>,
  route: { red: { zh: '紅色路', en: 'the red road' }, yellow: { zh: '黃色路', en: 'the yellow road' }, blue: { zh: '藍色路', en: 'the blue road' } } as Record<RouteId, L>,
  routeCap: { red: { zh: '紅色路', en: 'Red road' }, yellow: { zh: '黃色路', en: 'Yellow road' }, blue: { zh: '藍色路', en: 'Blue road' } } as Record<RouteId, L>,
  kind: {
    open: { zh: '可以走', en: 'Open' },
    long: { zh: '很遠，要用 2 段時間', en: 'Long: takes 2 time' },
    shortcut: { zh: '窄路，不能載重物', en: 'Narrow: no heavy items' },
    bridge: { zh: '橋壞了，要 1 片木板修（修一次就好）', en: 'Broken bridge: 1 plank fixes it (once)' },
    rocks: { zh: '落石擋住，不能走', en: 'Rockfall: closed' },
  } as Record<RouteKind, L>,
  item: { battery: { zh: '電池', en: 'battery' }, panel: { zh: '太陽能板', en: 'solar panel' }, cable: { zh: '電線', en: 'cable' }, plank: { zh: '木板', en: 'plank' }, water: { zh: '水', en: 'water' } } as Record<Item, L>,
  navCard: { zh: '我知道每條路的樣子', en: 'I know what each road is like' },
  engCard: { zh: '基地需要這些才能亮燈', en: 'The base needs these to light up' },
  supCard: { zh: '倉庫裡有這些', en: 'The storeroom has' },
  cap: { zh: '救援車一趟最多載 {n} 件', en: 'The rover carries up to {n} items a trip' },
  heavy: { zh: '{i}是重物', en: 'A {i} is heavy' },
  timeAll: { zh: '這次任務有 {n} 段時間，一趟用 1 段', en: 'This mission has {n} time; a trip uses 1' },
  ev: {
    depart: { zh: '第 {k} 趟：走{route}', en: 'Trip {k}: took {route}' },
    fix_bridge: { zh: '用木板修好了橋', en: 'Fixed the bridge with a plank' },
    deliver: { zh: '送到基地：{items}', en: 'Delivered: {items}' },
    no_route: { zh: '第 {k} 趟還沒選路', en: 'Trip {k} has no road yet' },
    empty: { zh: '第 {k} 趟車上是空的', en: 'Trip {k} has no cargo' },
    out_of_time: { zh: '第 {k} 趟：時間不夠（要 {used} 段，只有 {time} 段）', en: 'Trip {k}: not enough time (needs {used}, have {time})' },
    over_capacity: { zh: '第 {k} 趟：載了 {load} 件，車子一次只能載 {capacity} 件', en: 'Trip {k}: {load} items, but the rover carries {capacity}' },
    not_in_storage: { zh: '第 {k} 趟：倉庫的{item}只有 {have} 個', en: 'Trip {k}: the storeroom has only {have} {item}' },
    blocked: { zh: '{route}被落石擋住，所以過不去', en: '{route} is blocked by rocks, so the rover could not pass' },
    no_heavy: { zh: '{route}是窄路，{item}太重，所以過不去', en: '{route} is narrow and the {item} is heavy, so the rover could not pass' },
    bridge_broken: { zh: '{route}的橋壞了，車上沒有木板，所以過不去', en: 'The bridge on {route} is broken and there was no plank, so the rover could not pass' },
    missing: { zh: '基地還缺：{items}，所以還不能亮燈', en: 'The base still needs: {items}, so it cannot light up yet' },
  } as Record<Ev['t'], L>,
};

const KEY = 'jy.rescue.v1';
interface Saved {
  mode: Mode;
  missionId: string;
  done: string[];
  plans: Record<string, Trip[]>;
}
const blank = (): Saved => ({ mode: 'three', missionId: MISSIONS[0].id, done: [], plans: {} });
function load(): Saved {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (x && ['three', 'two', 'solo'].includes(x.mode) && MISSIONS.some((m) => m.id === x.missionId) && Array.isArray(x.done) && x.plans) return { ...blank(), ...x };
  } catch {
    /* ignore */
  }
  return blank();
}
function store(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
const reduced = () => typeof window !== 'undefined' && (document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const noSub = () => () => {};
const zero = () => 0;
const emptyPlan = (m: Mission): Trip[] => Array.from({ length: m.time }, () => ({ route: null, cargo: [] }));

// ------------------------------------------------------------ rover path (viewBox 0 0 100 50)
const CURVE: Record<RouteId, [number, number][]> = {
  red: [[17, 24], [32, 2], [68, 2], [83, 24]],
  yellow: [[17, 26], [40, 26], [60, 26], [83, 26]],
  blue: [[17, 28], [32, 50], [68, 50], [83, 28]],
};
const bez = (r: RouteId, t: number) => {
  const [a, b, c, d] = CURVE[r];
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  return { x: f(0), y: f(1) };
};
const ROUTE_COLOR: Record<RouteId, string> = { red: '#d9534f', yellow: '#e0a91b', blue: '#3b82c4' };

const prob0 = (evs: Ev[]) => evs.some((e) => e.t === 'blocked' || e.t === 'no_heavy' || e.t === 'bridge_broken');
interface Frame {
  pos: { x: number; y: number };
  carrying: boolean;
  line?: Ev; // event to append to the story when this frame shows
  reveal?: RouteId;
  stop?: boolean;
}
function framesFor(res: RunResult, plan: Trip[]): Frame[] {
  const trips = plan.filter((t) => t.route || t.cargo.length);
  const depot = { x: 10, y: 26 };
  const f: Frame[] = [];
  const byTrip = (k: number) => res.events.filter((e) => 'trip' in e && e.trip === k);
  for (let k = 0; k < trips.length; k++) {
    const evs = byTrip(k);
    if (!evs.length) break;
    const r = trips[k].route;
    const depart = evs.find((e) => e.t === 'depart');
    if (!depart || !r) {
      f.push({ pos: depot, carrying: false, line: evs[0], stop: true });
      break;
    }
    f.push({ pos: bez(r, 0), carrying: true, line: depart });
    for (let i = 1; i <= (prob0(evs) ? 3 : 5); i++) f.push({ pos: bez(r, i / 12), carrying: true });
    const prob = evs.find((e) => e.t === 'blocked' || e.t === 'no_heavy' || e.t === 'bridge_broken');
    f.push({ pos: bez(r, prob0(evs) ? 0.3 : 0.5), carrying: true, reveal: r, line: prob ?? evs.find((e) => e.t === 'fix_bridge'), stop: !!prob });
    if (prob) break;
    for (let i = 7; i <= 12; i++) f.push({ pos: bez(r, i / 12), carrying: true });
    const del = evs.find((e) => e.t === 'deliver');
    f.push({ pos: { x: 86, y: 26 }, carrying: false, line: del });
    f.push({ pos: depot, carrying: false });
  }
  const last = res.events[res.events.length - 1];
  if (last && last.t === 'missing') f.push({ pos: depot, carrying: false, line: last, stop: true });
  if (!f.length) f.push({ pos: depot, carrying: false, line: res.problem ?? undefined, stop: !!res.problem });
  return f;
}

export function RescuePage({ online }: { online?: OnlineRescue } = {}) {
  const { lang, to } = useI18n();
  const nav = useNavigate();
  const tr = (l: L, v?: Record<string, string | number>) => format(l[lang], v);
  const [saved, setSaved] = useState<Saved>(load);
  useSyncExternalStore(online?.subscribe ?? noSub, online?.snapshot ?? zero, online?.snapshot ?? zero);
  const st = online?.st ?? null;
  const mission = st ? missionOf(st.missionId) : (MISSIONS.find((m) => m.id === saved.missionId) ?? MISSIONS[0]);
  const [localScreen, setScreen] = useState<'setup' | 'mission'>('setup');
  const screen = online ? 'mission' : localScreen;
  const plan = st ? st.plan : saved.plans[mission.id]?.length === mission.time ? saved.plans[mission.id] : emptyPlan(mission);
  const [sel, setSel0] = useState(0); // selected trip for loading
  const setSel = (k: number) => setSel0(Math.min(k, plan.length - 1));
  const [localOks, setOks] = useState<Role[]>([]);
  const oks = st ? st.oks : localOks;
  const myRoles = st ? rolesOf({ roles: st.roles } as never, st.mySeat) : [];
  const isHost = !!st && st.mySeat !== null && st.mySeat === st.hostSeat;
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const lastRun = useRef<number | null>(null);
  const [peek, setPeek] = useState<{ role: Role; open: boolean } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [fi, setFi] = useState(-1);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const solo = !online && saved.mode === 'solo';
  const playing = fi >= 0 && fi < frames.length - 1;
  const finished = result !== null && !playing;

  const update = (n: Saved) => {
    setSaved(n);
    store(n);
  };
  useEffect(() => {
    (window as unknown as { __rescue?: unknown }).__rescue = { saved, mission, plan, result, fi, frames: frames.length, oks, st, myRoles };
  });
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const setPlan = (p: Trip[]) => {
    if (online) return st?.mySeat === null ? undefined : online.send({ t: 'plan', plan: p });
    setOks([]);
    setResult(null);
    setFi(-1);
    update({ ...saved, plans: { ...saved.plans, [mission.id]: p } });
  };
  const setTrip = (k: number, t: Partial<Trip>) => setPlan(plan.map((x, i) => (i === k ? { ...x, ...t } : x)));

  const animate = (res: RunResult, p: Trip[], instant = false) => {
    const fr = framesFor(res, p);
    setResult(res);
    setFrames(fr);
    if (timer.current) clearInterval(timer.current);
    if (instant || reduced()) {
      setFi(fr.length - 1);
    } else {
      setFi(0);
      let i = 0;
      timer.current = setInterval(() => {
        i++;
        setFi(i);
        if (i >= fr.length - 1 && timer.current) clearInterval(timer.current);
      }, 180);
    }
  };
  const go = () => {
    if (online) return online.send({ t: 'go' });
    const res = run(mission, plan);
    animate(res, plan);
    if (res.ok && !saved.done.includes(mission.id)) update({ ...saved, done: [...saved.done, mission.id] });
  };
  // online: play each new run once; a run already on screen when joining is shown at its end
  useEffect(() => {
    if (!st) return;
    if (!st.result) {
      if (result) (setResult(null), setFi(-1));
      lastRun.current = st.runId;
      return;
    }
    if (lastRun.current !== st.runId) {
      animate(st.result, st.plan, lastRun.current === null);
      lastRun.current = st.runId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.runId, st?.result]);
  const toggleOk = (r: Role) => {
    const on = oks.includes(r);
    if (online) return online.send({ t: 'ok', role: r, on: !on });
    setOks(on ? oks.filter((x) => x !== r) : [...oks, r]);
  };
  const createRoom = async () => {
    try {
      const r = await api<{ id: string }>('/rescue/rooms', { method: 'POST', body: JSON.stringify({ missionId: saved.missionId }) });
      nav(to(`/rescue/room/${r.id}`));
    } catch {
      /* the button stays; the network error is rare */
    }
  };
  const retry = () => {
    if (online) return online.send({ t: 'retry' });
    setResult(null);
    setFi(-1);
    setOks([]);
  };
  const startMission = (id: string) => {
    if (online) return online.send({ t: 'mission', id });
    update({ ...saved, missionId: id });
    setResult(null);
    setFi(-1);
    setOks([]);
    setSel(0);
    setScreen('mission');
  };

  const itemList = (o: Partial<Record<Item, number>> | Item[]) => {
    const counts: Partial<Record<Item, number>> = Array.isArray(o) ? o.reduce((a, i) => ({ ...a, [i]: (a[i] ?? 0) + 1 }), {} as Partial<Record<Item, number>>) : o;
    return ITEMS.filter((i) => counts[i])
      .map((i) => `${tr(T.item[i])}×${counts[i]}`)
      .join(lang === 'zh' ? '、' : ', ');
  };
  const evText = (e: Ev) => {
    const v: Record<string, string | number> = {};
    if ('trip' in e) v.k = e.trip + 1;
    if ('route' in e) v.route = tr(T.route[e.route]);
    if ('item' in e) v.item = tr(T.item[e.item]);
    if (e.t === 'deliver') v.items = itemList(e.items);
    if (e.t === 'missing') v.items = itemList(e.items);
    if (e.t === 'out_of_time') Object.assign(v, { used: e.used, time: e.time });
    if (e.t === 'over_capacity') Object.assign(v, { load: e.load, capacity: e.capacity });
    if (e.t === 'not_in_storage') v.have = e.have;
    let s = tr(T.ev[e.t], v);
    if (lang === 'en') s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  };

  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const speak = (s: string) => {
    try {
      const u = new SpeechSynthesisUtterance(s);
      u.lang = lang === 'zh' ? 'zh-TW' : 'en-US';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* optional */
    }
  };
  const Listen = ({ text }: { text: string }) =>
    canSpeak ? (
      <button type="button" onClick={() => speak(text)} className="h-11 w-11 shrink-0 rounded-full bg-black/5" aria-label={tr(T.listen)}>
        🔊
      </button>
    ) : null;

  const shell = (children: ReactNode) => (
    <section className="mx-auto max-w-4xl overflow-hidden rounded-3xl bg-[var(--surface)] shadow-[var(--card-shadow)]" data-testid="rescue" data-screen={screen}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h1 className="text-xl font-extrabold">
          🚀 {tr(T.title)} <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 align-middle text-xs font-semibold text-[var(--muted)]">{tr(T.proto)}</span>
        </h1>
        {screen === 'mission' && (
          <button type="button" className="min-h-11 rounded-full px-3 text-sm font-bold text-[var(--muted)]" disabled={playing} onClick={() => (online ? nav(to('/rescue')) : setScreen('setup'))} data-testid="rescue-back">
            ☰ {tr(T.back)}
          </button>
        )}
      </div>
      {children}
    </section>
  );

  // ------------------------------------------------------------ role cards
  const Card = ({ r }: { r: Role }) => (
    <div className="space-y-2 rounded-2xl bg-[var(--surface-2)] p-3" data-testid={`card-${r}`}>
      <div className="flex items-center gap-2 font-extrabold">
        <span className="h-10 w-10">
          <RoleArt r={r} />
        </span>
        {tr(T.roleCap[r])}
      </div>
      {r === 'navigator' && (
        <>
          <p className="text-sm font-bold text-[var(--muted)]">{tr(T.navCard)}</p>
          {ROUTE_IDS.map((id) => (
            <div key={id} className="flex items-center gap-2 font-bold">
              <span className="h-3 w-8 shrink-0 rounded-full" style={{ background: ROUTE_COLOR[id] }} />
              <span className="h-9 w-9 shrink-0">
                <RouteKindIcon k={mission.routes[id]} />
              </span>
              <span>
                {tr(T.routeCap[id])}：{tr(T.kind[mission.routes[id]])}
              </span>
            </div>
          ))}
        </>
      )}
      {r === 'engineer' && (
        <>
          <p className="text-sm font-bold text-[var(--muted)]">{tr(T.engCard)}</p>
          <div className="flex flex-wrap gap-3">
            {ITEMS.filter((i) => mission.needs[i]).map((i) => (
              <span key={i} className="flex items-center gap-1 text-xl font-extrabold" role="img" aria-label={`${tr(T.item[i])} ×${mission.needs[i]}`}>
                <span className="h-12 w-12">
                  <ItemIcon i={i} />
                </span>
                ×{mission.needs[i]}
              </span>
            ))}
          </div>
        </>
      )}
      {r === 'supplier' && (
        <>
          <p className="text-sm font-bold text-[var(--muted)]">{tr(T.supCard)}</p>
          <div className="flex flex-wrap gap-3">
            {ITEMS.filter((i) => mission.storage[i]).map((i) => (
              <span key={i} className="flex items-center gap-1 text-lg font-extrabold" role="img" aria-label={`${tr(T.item[i])} ×${mission.storage[i]}`}>
                <span className="h-10 w-10">
                  <ItemIcon i={i} />
                </span>
                ×{mission.storage[i]}
              </span>
            ))}
          </div>
          <p className="flex items-center gap-2 font-bold">
            <span className="h-9 w-9">
              <RoverArt cargo={1} />
            </span>
            {tr(T.cap, { n: mission.capacity })}
          </p>
          {HEAVY.filter((i) => mission.storage[i]).map((i) => (
            <p key={i} className="flex items-center gap-2 font-bold">
              <span className="h-9 w-9">
                <ItemIcon i={i} />
              </span>
              🏋️ {tr(T.heavy, { i: tr(T.item[i]) })}
            </p>
          ))}
        </>
      )}
    </div>
  );

  // ------------------------------------------------------------ setup
  if (screen === 'setup') {
    return shell(
      <div className="space-y-4 px-4 pb-5">
        <div className="flex items-center gap-2 rounded-2xl bg-[#eef6ea] px-4 py-3 text-lg font-extrabold text-[#2f3d2a]" data-testid="rescue-prompt">
          <span className="flex-1">🔋☀️🔌 → 🏠 {tr(T.story)}</span>
          <Listen text={tr(T.story)} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <div key={r} className="flex flex-col items-center rounded-2xl bg-[var(--surface-2)] p-2 text-sm font-bold">
              <span className="h-16 w-16 motion-safe:animate-[jy-pop_0.5s]">
                <RoleArt r={r} />
              </span>
              {tr(T.roleCap[r])}
            </div>
          ))}
        </div>
        <h2 className="font-bold">{tr(T.team)}</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={tr(T.team)}>
          {(
            [
              ['three', '👤👤👤', T.three],
              ['two', '👤👤', T.two],
              ['solo', '👤', T.solo],
            ] as [Mode, string, L][]
          ).map(([m, icon, l]) => (
            <button key={m} type="button" role="radio" aria-checked={saved.mode === m} onClick={() => update({ ...saved, mode: m })} className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border-4 px-1 text-xs font-bold sm:text-sm ${saved.mode === m ? 'border-[var(--accent-text)] bg-[var(--accent-soft)]' : 'border-transparent bg-[var(--surface-2)]'}`} data-testid={`mode-${m}`}>
              <span className="text-xl">{icon}</span>
              {tr(l)}
            </button>
          ))}
        </div>
        <h2 className="font-bold">{tr(T.pick)}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MISSIONS.map((m, i) => (
            <button key={m.id} type="button" onClick={() => startMission(m.id)} className="flex min-h-20 flex-col items-center justify-center rounded-2xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-2 font-bold" data-testid={`mission-${m.id}`}>
              <span className="text-2xl">{saved.done.includes(m.id) ? '⭐' : i + 1}</span>
              <span className="text-sm">{m.name[lang]}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2 rounded-2xl border-2 border-[var(--border)] p-3" data-testid="rescue-online">
          <h2 className="font-extrabold">🌐 {tr(T.onlineMode)}</h2>
          <p className="text-sm text-[var(--muted)]">{tr(T.onlineDesc)}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" className="min-h-12" onClick={createRoom} data-testid="rescue-create">
              ➕ {tr(T.create)}
            </Button>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const c = code.trim().toUpperCase();
                if (/^[A-HJ-NP-Z2-9]{6}$/.test(c)) nav(to(`/rescue/room/${c}`));
              }}
            >
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder={tr(T.joinCode)} aria-label={tr(T.joinCode)} className="min-h-12 w-36 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 font-mono uppercase" data-testid="rescue-code" />
              <Button size="lg" variant="secondary" className="min-h-12" type="submit" data-testid="rescue-join">
                {tr(T.join)}
              </Button>
            </form>
          </div>
        </div>
      </div>,
    );
  }

  if (online && !st) {
    return shell(
      <div className="px-4 pb-6 text-center font-bold" data-testid="rescue-connecting">
        {online.error ? `⚠ ${tr(T.notFound)}` : '…'}
      </div>,
    );
  }

  // ------------------------------------------------------------ mission
  const frame = fi >= 0 ? frames[Math.min(fi, frames.length - 1)] : null;
  const shownLines = frames.slice(0, fi + 1).filter((f) => f.line).map((f) => f.line!);
  const revealed = new Set(frames.slice(0, fi + 1).filter((f) => f.reveal).map((f) => f.reveal!));
  const rover = frame?.pos ?? { x: 10, y: 26 };
  const lit = finished && result!.ok;
  const allOk = solo || ROLES.every((r) => oks.includes(r));
  const anything = plan.some((t) => t.route || t.cargo.length);
  const used = plan.filter((t) => t.route || t.cargo.length).length;
  const prompt = lit ? tr(T.success) : finished ? evText(result!.problem!) : playing ? tr(T.running) : tr(T.roles);

  return shell(
    <div className="space-y-3 px-4 pb-5" data-ok={finished ? String(result!.ok) : ''} data-playing={playing}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">
          {MISSIONS.indexOf(mission) + 1}. {mission.name[lang]}
        </h2>
        <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-sm font-bold" data-testid="rescue-time">
          ⏱ {tr(T.time, { n: mission.time })}
        </span>
      </div>
      <div className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-base font-extrabold sm:text-lg ${lit ? 'bg-[var(--ok-bg)] text-[var(--ok-text)]' : finished ? 'bg-[var(--warn-bg)] text-[var(--warn-text)]' : 'bg-[#eef6ea] text-[#2f3d2a]'}`} role="status" aria-live="polite" data-testid="rescue-prompt">
        <span className="flex-1">
          {lit ? '🎉 ' : finished ? '🔎 ' : ''}
          {prompt}
        </span>
        <Listen text={prompt} />
      </div>

      {st && (
        <div className="space-y-2 rounded-2xl bg-[var(--surface-2)] p-3" data-testid="rescue-team">
          {online!.tracker.phase === 'reconnecting' && <p className="font-bold text-[var(--warn-text)]">📶 {tr(T.reconnecting)}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-extrabold" data-testid="rescue-room-id">
              🌐 {tr(T.room, { id: st.id })}
            </span>
            <button
              type="button"
              className="min-h-11 rounded-full border-2 border-[var(--border)] px-3 text-sm font-bold"
              onClick={() => {
                try {
                  void navigator.clipboard?.writeText(location.origin + to(`/rescue/room/${st.id}`));
                } catch {
                  /* optional */
                }
                setCopied(true);
              }}
              data-testid="rescue-share"
            >
              🔗 {copied ? tr(T.copied) : tr(T.share)}
            </button>
          </div>
          <ul className="grid gap-1 sm:grid-cols-3" aria-label={tr(T.team2)}>
            {st.seats.map((x, i) => (
              <li key={i} className={`flex items-center gap-2 rounded-xl px-2 py-1 font-bold ${i === st.mySeat ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface)]'}`} data-testid={`seat-${i}`}>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${x.connected ? 'bg-[#2e9d57]' : 'bg-[#b5ae9d]'}`} aria-label={x.connected ? '' : tr(T.offline)} />
                <span className="truncate">
                  {x.name || '—'}
                  {i === st.hostSeat ? ` · ${tr(T.host)}` : ''}
                </span>
                <span className="ml-auto flex">
                  {ROLES.filter((r) => st.roles[r] === i).map((r) => (
                    <span key={r} className="h-7 w-7" title={tr(T.roleCap[r])}>
                      <RoleArt r={r} />
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {st.mySeat === null && <p className="font-bold">👀 {tr(T.watch)}</p>}
          {st.seats.length < MIN_TO_GO && <p className="font-bold text-[var(--warn-text)]">👥 {tr(T.waitTeam)}</p>}
          {isHost && !playing && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="min-h-11 rounded-full border-2 border-[var(--border)] px-3 text-sm font-bold" onClick={() => online!.send({ t: 'rotate' })} data-testid="rescue-rotate">
                🔄 {tr(T.rotateBtn)}
              </button>
              <span className="text-sm font-bold text-[var(--muted)]">{tr(T.hostPick)}</span>
              {MISSIONS.map((m, i) => (
                <button key={m.id} type="button" aria-pressed={m.id === st.missionId} className={`h-11 w-11 rounded-full border-2 text-sm font-bold ${m.id === st.missionId ? 'border-[var(--accent-text)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`} onClick={() => online!.send({ t: 'mission', id: m.id })} aria-label={m.name[lang]} data-testid={`pick-${m.id}`}>
                  {st.done.includes(m.id) ? '⭐' : i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* scene */}
      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border-4 border-[#8aa3b5] bg-[linear-gradient(#cfe8f5,#e8f1e1)]" style={{ aspectRatio: '2 / 1' }} data-testid="rescue-scene">
        <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <circle cx="92" cy="6" r="3" fill="#ffe27a" />
          <ellipse cx="50" cy="56" rx="70" ry="16" fill="#c9dcae" />
          {ROUTE_IDS.map((r) => {
            const [a, b, c, d] = CURVE[r];
            return (
              <g key={r}>
                <path d={`M${a} C${b} ${c} ${d}`} stroke="#7a6a55" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d={`M${a} C${b} ${c} ${d}`} stroke={ROUTE_COLOR[r]} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeDasharray={plan.some((t) => t.route === r) ? undefined : '1.5 1.5'} />
              </g>
            );
          })}
        </svg>
        {ROUTE_IDS.map((r) => {
          const p = bez(r, 0.5);
          const show = solo || revealed.has(r);
          return (
            <div key={r} className="pointer-events-none absolute z-10 h-[18%] w-[9%] -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y * 2}%` }} data-testid={`feature-${r}`} data-shown={show}>
              {show ? <RouteKindIcon k={mission.routes[r]} /> : <span className="grid h-full w-full place-items-center rounded-full bg-white/80 text-lg font-extrabold text-[#7a6a55]">?</span>}
            </div>
          );
        })}
        <div className="pointer-events-none absolute left-[1%] top-[30%] h-[42%] w-[16%]">
          <DepotArt />
        </div>
        <div className={`pointer-events-none absolute right-[0%] top-[24%] h-[52%] w-[20%] ${lit ? 'motion-safe:animate-[jy-pop_0.6s]' : ''}`} data-testid="rescue-base" data-lit={lit}>
          <BaseArt lit={lit} />
        </div>
        <div className={`pointer-events-none absolute h-[22%] w-[11%] -translate-x-1/2 -translate-y-[70%] transition-[left,top] duration-200 ease-linear motion-reduce:transition-none ${frame?.stop && finished && !lit ? 'motion-safe:animate-[jy-shake_0.4s]' : ''}`} style={{ left: `${rover.x}%`, top: `${rover.y * 2}%` }} data-testid="rescue-rover">
          <RoverArt cargo={frame ? (frame.carrying ? 1 : 0) : plan.some((t) => t.cargo.length) ? 1 : 0} />
        </div>
        {lit && <div className="pointer-events-none absolute inset-0 grid place-items-center text-6xl motion-safe:animate-[jy-pop_0.6s]">🎉</div>}
      </div>

      {/* story of the run */}
      {shownLines.length > 0 && (
        <ol className="space-y-1 rounded-2xl bg-[var(--surface-2)] p-3 text-sm font-bold" data-testid="rescue-story">
          {shownLines.map((e, i) => (
            <li key={i} className={e.t === 'missing' || ['no_route', 'empty', 'out_of_time', 'over_capacity', 'not_in_storage', 'blocked', 'no_heavy', 'bridge_broken'].includes(e.t) ? 'text-[var(--warn-text)]' : ''}>
              {i > 0 ? '→ ' : ''}
              {evText(e)}
            </li>
          ))}
        </ol>
      )}

      {finished ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {lit ? (
            <>
              {online && !isHost && <p className="self-center text-center font-bold">⏳ {tr(T.waitHost)}</p>}
              {(!online || isHost) && MISSIONS.indexOf(mission) < MISSIONS.length - 1 && (
                <Button size="lg" className="min-h-14 text-lg" onClick={() => startMission(MISSIONS[MISSIONS.indexOf(mission) + 1].id)} data-testid="rescue-next">
                  ➜ {tr(T.next)}
                </Button>
              )}
              {!solo && <p className="self-center text-center font-bold">🔄 {tr(T.rotate)}</p>}
            </>
          ) : (
            <Button size="lg" className="min-h-14 text-lg" onClick={retry} data-testid="rescue-retry">
              ✏️ {tr(T.retry)}
            </Button>
          )}
        </div>
      ) : (
        !playing && (
          <>
            {/* role cards */}
            {online ? (
              myRoles.length > 0 && (
                <div className="space-y-2" data-testid="rescue-mycards">
                  <p className="font-extrabold">
                    {tr(T.youAre)} {myRoles.map((r) => tr(T.roleCap[r])).join(lang === 'zh' ? '＋' : ' + ')}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {myRoles.map((r) => (
                      <Card key={r} r={r} />
                    ))}
                  </div>
                </div>
              )
            ) : solo ? (
              <div className="grid gap-2 md:grid-cols-3">
                {ROLES.map((r) => (
                  <Card key={r} r={r} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2" data-testid="rescue-roles">
                {ROLES.map((r) => (
                  <button key={r} type="button" onClick={() => setPeek({ role: r, open: false })} className="flex min-h-20 flex-col items-center justify-center rounded-2xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-1 text-xs font-bold sm:text-sm" data-testid={`peek-${r}`}>
                    <span className="h-11 w-11">
                      <RoleArt r={r} />
                    </span>
                    {tr(T.roleCap[r])} · {tr(T.look)}
                  </button>
                ))}
              </div>
            )}
            <p className="text-sm font-bold text-[var(--muted)]">⏱ {tr(T.timeAll, { n: mission.time })}</p>

            {/* plan board */}
            <div className="space-y-2 rounded-2xl border-2 border-dashed border-[var(--border)] p-2" data-testid="rescue-plan">
              <div className="flex items-center justify-between font-extrabold">
                <span>📋 {tr(T.plan)}</span>
                <button type="button" className="min-h-11 rounded-full px-3 text-sm font-bold text-[var(--muted)]" disabled={!anything} onClick={() => setPlan(emptyPlan(mission))} data-testid="rescue-clear">
                  🗑 {tr(T.clear)}
                </button>
              </div>
              {plan.map((t, k) => (
                <div key={k} className={`space-y-2 rounded-xl border-4 p-2 ${sel === k ? 'border-[var(--accent-text)] bg-[var(--accent-soft)]' : 'border-transparent bg-[var(--surface-2)]'}`} onClick={() => setSel(k)} data-testid={`trip-${k}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" aria-pressed={sel === k} onClick={(e) => (e.stopPropagation(), setSel(k))} className="min-h-11 rounded-full px-2 font-extrabold" data-testid={`select-${k}`}>
                      {sel === k ? '👉 ' : ''}
                      {tr(T.trip, { n: k + 1 })}
                    </button>
                    {ROUTE_IDS.map((r) => (
                      <button key={r} type="button" aria-pressed={t.route === r} onClick={(e) => (e.stopPropagation(), setSel(k), setTrip(k, { route: t.route === r ? null : r }))} className={`flex h-11 min-w-11 items-center gap-1 rounded-full border-4 px-2 text-xs font-bold ${t.route === r ? 'border-[var(--text)]' : 'border-transparent'}`} style={{ background: `${ROUTE_COLOR[r]}33` }} aria-label={tr(T.routeCap[r])} data-testid={`route-${k}-${r}`}>
                        <span className="h-3 w-6 rounded-full" style={{ background: ROUTE_COLOR[r] }} />
                        <span className="hidden sm:inline">{tr(T.routeCap[r])}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex min-h-12 flex-wrap items-center gap-1">
                    {t.cargo.length === 0 && <span className="text-xs font-bold text-[var(--muted)]">{sel === k ? `👇 ${tr(T.addHint)}` : '—'}</span>}
                    {t.cargo.map((i, j) => (
                      <button key={j} type="button" onClick={(e) => (e.stopPropagation(), setTrip(k, { cargo: t.cargo.filter((_, x) => x !== j) }))} className="h-11 w-11 rounded-lg bg-[var(--surface)] p-1" aria-label={`${tr(T.item[i])} ✕`} data-testid={`cargo-${k}-${j}`}>
                        <ItemIcon i={i} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-5 gap-1" role="group" aria-label={tr(T.load)}>
                {ITEMS.map((i) => (
                  <button key={i} type="button" disabled={plan[sel].cargo.length >= 5} onClick={() => setTrip(sel, { cargo: [...plan[sel].cargo, i] })} className="flex min-h-16 flex-col items-center justify-center rounded-xl bg-[var(--surface-2)] p-1 text-[11px] font-bold sm:text-xs" data-testid={`add-${i}`}>
                    <span className="h-9 w-9">
                      <ItemIcon i={i} />
                    </span>
                    {tr(T.item[i])}
                  </button>
                ))}
              </div>
              {used > 0 && <p className="text-xs font-bold text-[var(--muted)]">{tr(T.editTip)}</p>}
            </div>

            {/* confirm + go */}
            {!solo && (
              <div className="space-y-1" data-testid="rescue-confirm">
                <p className="font-bold">{tr(T.confirm)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map((r) => {
                    const on = oks.includes(r);
                    const mine = !online || myRoles.includes(r);
                    const holder = st && st.roles[r] !== null ? st.seats[st.roles[r]!]?.name : null;
                    return (
                      <button key={r} type="button" disabled={!anything || !mine} aria-pressed={on} title={mine ? undefined : tr(T.onlyYours)} onClick={() => toggleOk(r)} className={`flex min-h-12 items-center justify-center gap-1 rounded-xl border-2 px-1 text-xs font-bold disabled:opacity-40 sm:text-sm ${on ? 'border-[var(--ok-text)] bg-[var(--ok-bg)] text-[var(--ok-text)]' : 'border-[var(--border)]'}`} data-testid={`ok-${r}`}>
                        <span className="h-7 w-7">
                          <RoleArt r={r} />
                        </span>
                        {on ? '✓' : ''} {holder && !mine ? <span className="truncate">{holder}</span> : tr(T.ok)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <Button size="lg" className="min-h-14 w-full text-xl" disabled={!anything || !allOk || (!!st && (st.seats.length < MIN_TO_GO || st.mySeat === null))} onClick={go} data-testid="rescue-go">
              🚀 {tr(T.go)}
            </Button>
          </>
        )
      )}
      {!online && <p className="text-xs text-[var(--muted)]">✓ {tr(T.saved)}</p>}

      {/* pass-the-tablet cover */}
      {peek && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--bg)] p-4" role="dialog" aria-modal="true" data-testid="rescue-cover">
          <div className="w-full max-w-md space-y-4 text-center">
            {!peek.open ? (
              <>
                <span className="mx-auto block h-28 w-28 motion-safe:animate-[jy-pop_0.5s]">
                  <RoleArt r={peek.role} />
                </span>
                <p className="text-xl font-extrabold">📱 {tr(T.passTo, { r: tr(T.role[peek.role]) })}</p>
                <Button size="lg" className="min-h-14 w-full text-lg" onClick={() => setPeek({ ...peek, open: true })} data-testid="cover-open">
                  👀 {tr(T.open, { r: tr(T.role[peek.role]) })}
                </Button>
              </>
            ) : (
              <>
                <div className="text-left">
                  <Card r={peek.role} />
                </div>
                <Button size="lg" className="min-h-14 w-full text-lg" onClick={() => setPeek(null)} data-testid="cover-close">
                  🙈 {tr(T.close)}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>,
  );
}


export function RescueRoomPage() {
  const { id } = useParams();
  const { me, loading } = useAuth();
  const [ctl, setCtl] = useState<OnlineRescue | null>(null);
  useEffect(() => {
    if (!id || loading) return;
    let name = '';
    try {
      name = me?.kind === 'user' ? me.nickname : (localStorage.getItem('jychess.guestName') ?? '');
    } catch {
      /* ignore */
    }
    const c = new OnlineRescue(`/api/rescue/rooms/${id.toUpperCase()}/ws`, name);
    setCtl(c);
    return () => c.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading]);
  if (!ctl) return null;
  return <RescuePage key={ctl ? id : 'x'} online={ctl} />;
}
