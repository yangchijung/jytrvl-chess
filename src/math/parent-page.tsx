// Math Island — /math/parent: everything written for adults (the children's pages have almost no words).
// What each game practises, the grade colours, privacy and sound. Uses the normal site header and footer.
import { Link } from 'react-router-dom';
import { useTr, type L } from './shell';
import { GameArt, type GameId } from './art';
import './math.css';

const T = {
  title: { zh: '數學遊樂島：給大人看', en: 'Math Island: for adults' },
  lead: { zh: '這一區是給還不太識字的孩子自己玩的：畫面幾乎沒有字，每個指示都有圖示、朗讀和手指示範動畫，操作都用拖曳或點一下，不用打字。', en: 'This area is for children who cannot read much yet: almost no words on screen, every instruction comes as a picture, a spoken prompt and a finger demo, and everything is dragging or a single tap.' },
  back: { zh: '回到數學遊樂島', en: 'Back to Math Island' },
  flags: { zh: '小旗子的顏色：綠色是一年級、黃色是二年級、藍色是三年級（一、二年級都適合的遊戲用綠色）。', en: 'Flag colours: green grade 1, yellow grade 2, blue grade 3 (games for grades 1–2 are green).' },
  games: { zh: '每款遊戲練什麼', en: 'What each game practises' },
  rules: { zh: '玩法原則', en: 'How it plays' },
  r1: { zh: '每款 5 題固定題目，不計時、不扣分，沒有排行榜。', en: '5 fixed problems per game, no timer, no penalties, no leaderboard.' },
  r2: { zh: '放錯會輕輕彈回並搖一下；答錯三次會自動示範一次正確做法。答對有星星、水獺波波跳一下和音效。', en: 'A wrong drop bounces back with a small shake; after three wrong tries the right move is shown once. A right answer gets a star, a hop from Bobo the otter and a chime.' },
  r3: { zh: '頂端 5 個圓點是第幾題；綠色是做完的。', en: 'The 5 dots at the top show the problem; green ones are done.' },
  privacy: { zh: '隱私與聲音', en: 'Privacy and sound' },
  p1: { zh: '不需要登入，不收集姓名、Email 或生日；進度只存在這台裝置的瀏覽器裡。', en: 'No sign-in; no names, emails or birthdays. Progress stays in this browser on this device.' },
  p2: { zh: '沒有廣告、付費或第三方追蹤。朗讀是預先錄好的國語語音檔（Azure 語音合成），音符按鈕可以關掉。', en: 'No ads, payments or third-party tracking. Spoken prompts are pre-made Mandarin audio (Azure speech), and the note button turns them off.' },
  p3: { zh: '瀏覽器規定要先點一下才會發出聲音；孩子點過一次之後就會自動朗讀，也可以按喇叭再聽一次。', en: 'Browsers only allow sound after a first tap; after that prompts play by themselves, and the speaker button repeats them.' },
  status: { zh: '目前是試玩版，圖片為暫用的程式繪圖。', en: 'This is an early version; the pictures are placeholder drawings.' },
} satisfies Record<string, L>;

const GAMES: { id: GameId; name: L; grade: L; what: L; code: string }[] = [
  { id: 'apple', name: { zh: '蘋果籃', en: 'Apple Basket' }, grade: { zh: '一年級', en: 'Grade 1' }, what: { zh: '把兩堆蘋果放進籃子，數一數一共幾顆（10 以內的加法）。', en: 'Put two groups of apples together and count them (addition within 10).' }, code: 'N-1-2、N-1-3、R-1-1' },
  { id: 'train', name: { zh: '湊十小火車', en: 'Make-Ten Train' }, grade: { zh: '一年級', en: 'Grade 1' }, what: { zh: '第一節坐滿 10 人再坐第二節，看懂 8 + 5 是 10 和 3。', en: 'Fill car 1 to ten before car 2, and see 8 + 5 as 10 and 3.' }, code: 'N-1-3、N-1-2' },
  { id: 'shop', name: { zh: '零錢小商店', en: 'Coin Shop' }, grade: { zh: '一、二年級', en: 'Grades 1–2' }, what: { zh: '用 1、5、10、50 元硬幣付剛好的錢。', en: 'Pay the exact price with 1, 5, 10 and 50 dollar coins.' }, code: 'N-1-4、N-2-5' },
  { id: 'balance', name: { zh: '天平等一等', en: 'Balance Scale' }, grade: { zh: '一、二年級', en: 'Grades 1–2' }, what: { zh: '讓天平兩邊一樣重，認識等號是「兩邊一樣多」。', en: 'Make both sides weigh the same: = means both sides are equal.' }, code: 'R-1-1（後續 N-2-3、R-2-4）' },
  { id: 'clock', name: { zh: '時鐘修理站', en: 'Clock Repair' }, grade: { zh: '一、二年級', en: 'Grades 1–2' }, what: { zh: '轉長針撥時鐘，短針跟著走；分清上午、下午。', en: 'Turn the minute hand; the hour hand follows; morning and afternoon.' }, code: 'N-1-6、N-2-13' },
  { id: 'garden', name: { zh: '乘法花圃', en: 'Multiplication Garden' }, grade: { zh: '二年級', en: 'Grade 2' }, what: { zh: '拉出每排一樣多的花圃，看懂「每排幾朵 × 幾排」。', en: 'Pull out equal rows and see “in each row × rows”.' }, code: 'N-2-6、N-2-7、R-2-3' },
  { id: 'factory', name: { zh: '分裝工廠', en: 'Packing Factory' }, grade: { zh: '三年級', en: 'Grade 3' }, what: { zh: '把餅乾平分到每一盒，認識除法。', en: 'Share cookies equally into boxes: what division means.' }, code: 'N-3-4、R-3-1' },
  { id: 'frog', name: { zh: '數線青蛙', en: 'Number-Line Frog' }, grade: { zh: '三年級', en: 'Grade 3' }, what: { zh: '青蛙在數線上跳，找出牠停在哪裡。', en: 'The frog jumps along the number line; find where it lands.' }, code: 'N-3-11' },
];

export function MathParentPage() {
  const { tr, to } = useTr();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5" data-testid="mi-parent">
      <h1 className="text-3xl font-extrabold">{tr(T.title)}</h1>
      <p className="text-lg">{tr(T.lead)}</p>
      <div>
        <Link to={to('/math')} className="inline-flex min-h-11 items-center rounded-md border-2 border-[var(--ui-control-border)] px-4 font-bold" data-testid="mi-parent-back">
          ← {tr(T.back)}
        </Link>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">{tr(T.games)}</h2>
        <p>{tr(T.flags)}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {GAMES.map((g) => (
            <li key={g.id} className="flex gap-3 rounded-lg border border-[var(--border)] p-3">
              <GameArt game={g.id} size={72} />
              <div>
                <p className="font-bold">
                  {tr(g.name)}．{tr(g.grade)}
                </p>
                <p className="text-sm">{tr(g.what)}</p>
                <p className="text-sm text-[var(--muted)]">課綱 {g.code}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">{tr(T.rules)}</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>{tr(T.r1)}</li>
          <li>{tr(T.r2)}</li>
          <li>{tr(T.r3)}</li>
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">{tr(T.privacy)}</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>{tr(T.p1)}</li>
          <li>{tr(T.p2)}</li>
          <li>{tr(T.p3)}</li>
        </ul>
        <p className="text-sm text-[var(--muted)]">{tr(T.status)}</p>
      </section>
    </div>
  );
}
