// In-game "rules" panel and the full rules reference. Mirrors docs/rules/*.md.
import { useI18n } from '../i18n';
import type { GameId } from '../../shared/types';
import type { BanqiOptions } from '../../shared/games/banqi/rules';

type Section = { h: string; items: string[] };
type Bi = { zh: Section[]; en: Section[] };

const CHESS: Bi = {
  zh: [
    { h: '規則版本', items: ['採用 FIDE《Laws of Chess》2023 年版。'] },
    {
      h: '棋子走法',
      items: [
        '國王 King：任意方向走一格。',
        '皇后 Queen：直、橫、斜任意格。',
        '城堡 Rook：直、橫任意格。',
        '主教 Bishop：斜線任意格。',
        '騎士 Knight：走「L」形，可以跳過其他棋子。',
        '士兵 Pawn：向前一格；第一步可走兩格；斜前方吃子。',
      ],
    },
    {
      h: '特殊規則',
      items: [
        '王車易位：國王與城堡都沒動過、中間無子、國王不在被將軍狀態且不經過或停在被攻擊的格子。',
        '吃過路兵：對方士兵從起點一次走兩格停在我方士兵旁邊時，下一步可斜吃它。',
        '升變：士兵走到底線時，必須變成皇后、城堡、主教或騎士。',
      ],
    },
    {
      h: '勝負',
      items: ['將死對方國王即獲勝。', '認輸或超時判負；超時但對手不可能將死時為和局。'],
    },
    {
      h: '和局（系統自動判定）',
      items: ['逼和：輪走方沒有合法走法但沒有被將軍。', '子力不足，雙方都不可能將死。', '同一局面出現 5 次。', '連續 75 回合沒有吃子也沒有走兵。'],
    },
    {
      h: '和局（需玩家申請）',
      items: ['同一局面出現 3 次。', '連續 50 回合沒有吃子也沒有走兵。', '雙方同意和棋。'],
    },
  ],
  en: [
    { h: 'Rule version', items: ['FIDE Laws of Chess, 2023 edition.'] },
    {
      h: 'How pieces move',
      items: [
        'King: one square in any direction.',
        'Queen: any distance straight or diagonally.',
        'Rook: any distance straight.',
        'Bishop: any distance diagonally.',
        'Knight: an “L” shape, jumping over pieces.',
        'Pawn: one square forward, two on its first move; captures diagonally forward.',
      ],
    },
    {
      h: 'Special rules',
      items: [
        'Castling: king and rook unmoved, nothing between them, king not in check and not crossing or landing on an attacked square.',
        'En passant: when an enemy pawn advances two squares to land beside your pawn, you may capture it as if it moved one — on the very next move only.',
        'Promotion: a pawn reaching the last rank must become a queen, rook, bishop or knight.',
      ],
    },
    { h: 'Winning', items: ['Checkmate the opposing king.', 'Resignation or time-out — but a time-out is a draw if the opponent cannot possibly mate.'] },
    {
      h: 'Draws (automatic)',
      items: ['Stalemate: no legal move and not in check.', 'Insufficient material: no possible mate.', 'Fivefold repetition.', '75 moves each without a capture or pawn move.'],
    },
    { h: 'Draws (must be claimed)', items: ['Threefold repetition.', '50 moves each without a capture or pawn move.', 'Draw by agreement.'] },
  ],
};

const XIANGQI: Bi = {
  zh: [
    { h: '規則版本', items: ['JY Chess 台灣象棋規則 v1.0（參考台灣常見對局習慣與亞洲象棋聯合會長將、長捉精神）。'] },
    {
      h: '棋子走法',
      items: [
        '帥／將：九宮內直橫一格。',
        '仕／士：九宮內斜走一格。',
        '相／象：斜走兩格（田字），不能過河；田字中心有子叫「塞象眼」，不能走。',
        '俥／車：直橫任意格，不能越子。',
        '傌／馬：先直一格再斜一格（日字）；直走的那一格有子叫「蹩馬腿」，不能走。',
        '炮／包：移動像車；吃子時中間必須剛好隔一枚棋子（炮架）。',
        '兵／卒：未過河只能前進；過河後可前進或左右走一格，永遠不能後退。',
      ],
    },
    { h: '特別規定', items: ['將帥不得照面：同一直線上中間沒有棋子時，帥和將不能面對面。', '被將軍時必須應將。'] },
    { h: '勝負', items: ['將死對方：被將軍且無法解除者負。', '困斃：輪到走棋卻沒有任何合法走法，也判負。', '認輸、超時判負；超時但對手已無攻擊子力時判和。'] },
    {
      h: '重複局面（長將、長捉）',
      items: [
        '同一局面出現第 3 次時進行裁決。',
        '一方每一步都在將軍（長將），另一方沒有 → 長將方判負；雙方都長將 → 和局。',
        '一方每一步都在將軍或捉子（長捉），另一方沒有 → 該方判負；雙方都如此 → 和局。',
        '「捉」：剛走的棋子可以合法吃掉對方沒有保護的棋子，或以小吃大。帥（將）與兵（卒）發動的攻擊、被攻擊的是未過河兵卒，都不算捉。',
        '其他重複局面 → 和局。',
      ],
    },
    { h: '和局', items: ['雙方都沒有可過河攻擊的棋子（俥傌炮兵）。', '連續 60 回合（120 步）沒有吃子。', '雙方同意和棋。'] },
  ],
  en: [
    { h: 'Rule version', items: ['JY Chess Taiwan Xiangqi Rules v1.0 (Taiwan practice; perpetual check/chase in the spirit of the Asian Xiangqi Federation rules).'] },
    {
      h: 'How pieces move',
      items: [
        'General: one step orthogonally, inside the palace.',
        'Advisor: one step diagonally, inside the palace.',
        'Elephant: exactly two steps diagonally, cannot cross the river, blocked if the middle point is occupied.',
        'Chariot: any distance orthogonally.',
        'Horse: one step straight then one diagonally outward; blocked if the straight step is occupied (“hobbled horse”).',
        'Cannon: moves like a chariot; captures by jumping exactly one piece (the screen).',
        'Soldier: forward one step; after crossing the river may also step sideways; never backwards.',
      ],
    },
    { h: 'Special rules', items: ['Flying general: the two generals may never face each other on an open file.', 'You must get out of check.'] },
    { h: 'Winning', items: ['Checkmate.', 'Stalemate also loses in xiangqi: no legal move = loss.', 'Resignation or time-out (draw if the opponent has no attacking pieces).'] },
    {
      h: 'Repetition (perpetual check & chase)',
      items: [
        'Adjudicated when a position occurs for the third time.',
        'One side checks on every move and the other does not → the checking side loses; both → draw.',
        'One side checks or chases on every move and the other does not → that side loses; both → draw.',
        'A “chase” = the moved piece could legally capture an unprotected piece, or a more valuable one. Attacks by generals or soldiers, and attacks on soldiers that have not crossed the river, are not chases.',
        'Any other repetition → draw.',
      ],
    },
    { h: 'Draws', items: ['Neither side has a chariot, horse, cannon or soldier.', '60 moves each (120 plies) without a capture.', 'Draw by agreement.'] },
  ],
};

function banqiText(o: BanqiOptions): Bi {
  const on = (b: boolean, zh: [string, string]) => (b ? zh[0] : zh[1]);
  return {
    zh: [
      { h: '棋盤與開局', items: ['4 × 8 共 32 格，32 枚象棋棋子全部背面朝下隨機排列。', '先手第一步只能翻棋，第一枚翻開的棋子顏色就是先手的陣營。'] },
      { h: '每回合可以', items: ['翻開任一枚背面棋子；或', '把己方明子上下左右移動一格到空格；或', '吃子。背面朝下的棋子不能被吃。'] },
      {
        h: '本局採用的吃子規則',
        items: [
          '階級：帥將 ＞ 仕士 ＞ 相象 ＞ 俥車 ＞ 傌馬 ＞ 炮包 ＞ 兵卒；相鄰時可吃同階或低階。',
          on(o.pawnCapturesKing, ['兵卒可以吃帥將。', '兵卒不可以吃帥將。']),
          on(o.kingCapturesPawn, ['帥將可以吃兵卒。', '帥將不可以吃兵卒。']),
          on(o.cannonJump, ['炮包吃子必須隔一子跳吃，直線任意距離，不受階級限制，不能吃相鄰棋子。', '炮包不跳吃，只能依階級吃相鄰棋子。']),
          on(o.chainCapture, ['可連吃：吃子後若同一棋子還能吃，可繼續吃或結束。', '不連吃：吃子後回合結束。']),
          on(o.rookSlide, ['俥車可直線走多格。', '俥車與其他棋子一樣只走一格。']),
        ],
      },
      { h: '勝負', items: ['吃光對方所有棋子獲勝。', '輪到走棋卻沒有任何動作可做（無暗子、己方棋子都不能動）判負。'] },
      {
        h: '和局',
        items: [
          o.noProgressLimit ? `連續 ${o.noProgressLimit} 步沒有吃子也沒有翻棋。` : '不採用無進展和局。',
          o.repetitionLimit ? `同一明面局面重複 ${o.repetitionLimit} 次。` : '不採用重複局面和局。',
          '雙方同意和棋。',
        ],
      },
      { h: '公平性', items: ['線上對局的暗子身分只存在伺服器；電腦 AI 也看不到暗子。'] },
    ],
    en: [
      { h: 'Board & start', items: ['4 × 8 board; all 32 xiangqi pieces start face-down in random order.', 'The first move must be a flip; the colour of the first revealed piece becomes the first player’s side.'] },
      { h: 'On your turn', items: ['Flip any face-down piece; or', 'move one of your face-up pieces one step orthogonally to an empty square; or', 'capture. Face-down pieces cannot be captured.'] },
      {
        h: 'Capture rules in this game',
        items: [
          'Ranks: General > Advisor > Elephant > Chariot > Horse > Cannon > Soldier; an adjacent piece may capture equal or lower ranks.',
          o.pawnCapturesKing ? 'Soldiers may capture the general.' : 'Soldiers may not capture the general.',
          o.kingCapturesPawn ? 'The general may capture soldiers.' : 'The general may not capture soldiers.',
          o.cannonJump
            ? 'Cannons capture only by jumping exactly one piece in a straight line, at any distance and regardless of rank; never adjacent pieces.'
            : 'Cannons do not jump; they capture adjacent pieces by rank.',
          o.chainCapture ? 'Chain captures: after a capture the same piece may keep capturing, or stop.' : 'No chain captures: a capture ends the turn.',
          o.rookSlide ? 'Chariots may slide any distance.' : 'Chariots move one step like other pieces.',
        ],
      },
      { h: 'Winning', items: ['Capture all opposing pieces.', 'A player with no possible action on their turn loses.'] },
      {
        h: 'Draws',
        items: [
          o.noProgressLimit ? `${o.noProgressLimit} plies without a capture or a flip.` : 'No move-limit draw.',
          o.repetitionLimit ? `The same visible position ${o.repetitionLimit} times.` : 'No repetition draw.',
          'Draw by agreement.',
        ],
      },
      { h: 'Fairness', items: ['In online games hidden pieces exist only on the server; the computer AI cannot see them either.'] },
    ],
  };
}

export function RulesReference({ game, banqiOptions }: { game: GameId; banqiOptions?: BanqiOptions }) {
  const { lang } = useI18n();
  const data = game === 'chess' ? CHESS : game === 'xiangqi' ? XIANGQI : banqiText(banqiOptions ?? (BQ_DEFAULT as BanqiOptions));
  return (
    <div className="space-y-4 text-[0.95rem] leading-relaxed">
      {data[lang].map((s) => (
        <section key={s.h}>
          <h3 className="mb-1 font-semibold text-[var(--accent-text)]">{s.h}</h3>
          <ul className="list-disc space-y-1 pl-5">
            {s.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const BQ_DEFAULT = {
  cannonJump: true,
  pawnCapturesKing: true,
  kingCapturesPawn: false,
  chainCapture: false,
  rookSlide: false,
  noProgressLimit: 50,
  repetitionLimit: 3,
};
