// Interactive lessons. Every position is validated by tests/lessons.test.ts with the real rules engines.
import type { GameId } from '../../shared/types';
import type { BqPiece, BqColor } from '../../shared/games/banqi/rules';

export type Bi = { zh: string; en: string };

export interface BanqiSetup {
  /** face-up pieces */
  up: Record<string, BqPiece>;
  /** face-down squares (identities drawn from the remaining pieces) */
  down?: string[];
  /** fresh random board instead of a setup */
  fresh?: boolean;
  seatColor?: [BqColor | null, BqColor | null];
}

export type Expect = { moves: string[] } | { from: string } | { anyFlip: true } | { any: true };

export interface Step {
  kind: 'info' | 'move' | 'challenge' | 'explore';
  category: 'board' | 'names' | 'moves' | 'capture' | 'special' | 'win' | 'practice' | 'challenge' | 'mistakes';
  title: Bi;
  text: Bi;
  fen?: string;
  banqi?: BanqiSetup;
  expect?: Expect;
  highlight?: string[];
  success?: Bi;
}

const CHESS_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const XQ_START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

export const LESSONS: Record<GameId, Step[]> = {
  chess: [
    {
      kind: 'info',
      category: 'board',
      title: { zh: '認識棋盤', en: 'The board' },
      text: {
        zh: '西洋棋盤有 8 × 8 共 64 格，深淺交錯。白方在下面，而且永遠先走。直的一行叫「直行」，用 a 到 h 表示；橫的一列叫「橫列」，用 1 到 8 表示。每一格都有名字，例如左下角是 a1。',
        en: 'The chessboard has 8 × 8 = 64 squares in alternating colours. White sits at the bottom and always moves first. Columns are files a–h, rows are ranks 1–8, so every square has a name — the bottom-left corner is a1.',
      },
      fen: CHESS_START,
      highlight: ['a1', 'h8'],
    },
    {
      kind: 'info',
      category: 'names',
      title: { zh: '棋子名稱', en: 'Meet the pieces' },
      text: {
        zh: '每一方有 16 枚棋子：國王 1、皇后 1、城堡 2、主教 2、騎士 2、士兵 8。最重要的是國王，國王被將死就輸了。',
        en: 'Each side has 16 pieces: 1 king, 1 queen, 2 rooks, 2 bishops, 2 knights and 8 pawns. The king is the most important — if it is checkmated, you lose.',
      },
      fen: CHESS_START,
      highlight: ['e1', 'd1', 'a1', 'c1', 'b1', 'e2'],
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '城堡：直直走', en: 'Rook: straight lines' },
      text: {
        zh: '城堡可以直走或橫走，想走幾格都可以，但不能跳過別的棋子。點一下 a1 的城堡，看看它可以去哪裡，然後選一格走走看。',
        en: 'The rook moves any distance up, down, left or right, but cannot jump over pieces. Tap the rook on a1, see where it can go, then move it.',
      },
      fen: '7k/8/8/8/8/8/8/R3K3 w - - 0 1',
      expect: { from: 'a1' },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '主教：斜斜走', en: 'Bishop: diagonals' },
      text: { zh: '主教只能斜著走，任意格數。它永遠停在同一種顏色的格子上。請移動 c1 的主教。', en: 'The bishop moves diagonally any distance and always stays on one colour. Move the bishop on c1.' },
      fen: '7k/p7/8/8/8/8/8/2B1K3 w - - 0 1',
      expect: { from: 'c1' },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '皇后：最強的棋子', en: 'Queen: the strongest piece' },
      text: { zh: '皇后結合了城堡和主教：直、橫、斜都能走任意格。請移動 d4 的皇后。', en: 'The queen combines rook and bishop: any distance straight or diagonally. Move the queen on d4.' },
      fen: '7k/8/8/8/3Q4/8/8/4K3 w - - 0 1',
      expect: { from: 'd4' },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '國王：一次一格', en: 'King: one step' },
      text: { zh: '國王每次只能往任何方向走一格，而且不能走到會被攻擊的格子。請移動國王。', en: 'The king moves one square in any direction and may never step into attack. Move your king.' },
      fen: '7k/p7/8/8/8/8/8/4K3 w - - 0 1',
      expect: { from: 'e1' },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '騎士：跳 L 形', en: 'Knight: the L-jump' },
      text: { zh: '騎士走「L」形：先直走兩格再轉彎一格。騎士是唯一可以跳過其他棋子的棋子！請把 g1 的騎士跳出來。', en: 'The knight jumps in an “L”: two squares one way, then one to the side. It is the only piece that jumps over others! Jump the knight on g1.' },
      fen: CHESS_START,
      expect: { from: 'g1' },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '士兵：勇往直前', en: 'Pawn: forward march' },
      text: { zh: '士兵只能往前走一格；但是第一次走的時候可以一口氣走兩格。請把 e2 的士兵走兩格到 e4。', en: 'Pawns move one square forward, but on their first move they may move two. Move the e2 pawn two squares to e4.' },
      fen: CHESS_START,
      expect: { moves: ['e2e4'] },
    },
    {
      kind: 'move',
      category: 'capture',
      title: { zh: '吃子', en: 'Capturing' },
      text: { zh: '走到對方棋子所在的格子，就能把它吃掉。請用城堡吃掉 d5 的黑兵。', en: 'Move onto an enemy piece to capture it. Capture the black pawn on d5 with your rook.' },
      fen: '7k/8/8/3p4/8/8/8/3RK3 w - - 0 1',
      expect: { moves: ['d1d5'] },
    },
    {
      kind: 'move',
      category: 'capture',
      title: { zh: '士兵斜著吃', en: 'Pawns capture diagonally' },
      text: { zh: '士兵很特別：往前走，但吃子時要斜前方吃。請用 e4 的士兵吃掉 d5 的黑兵。', en: 'Pawns are special: they move straight but capture diagonally forward. Capture d5 with the e4 pawn.' },
      fen: '7k/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
      expect: { moves: ['e4d5'] },
    },
    {
      kind: 'move',
      category: 'special',
      title: { zh: '王車易位', en: 'Castling' },
      text: {
        zh: '國王和城堡都還沒動過、中間沒有棋子、國王沒有被將軍時，國王可以往城堡方向走兩格，城堡跳到國王另一邊。請點國王，走到 g1 或 c1。',
        en: 'If king and rook have not moved, nothing is between them and the king is not in check, the king can move two squares toward the rook and the rook hops over. Tap the king and move it to g1 or c1.',
      },
      fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
      expect: { moves: ['e1g1', 'e1c1'] },
    },
    {
      kind: 'move',
      category: 'special',
      title: { zh: '吃過路兵', en: 'En passant' },
      text: {
        zh: '黑兵剛從 d7 一次走兩格到 d5，停在你的白兵旁邊。這時白兵可以斜走到 d6，把 d5 的黑兵吃掉——只有緊接著的這一步可以！',
        en: 'Black’s pawn just jumped from d7 to d5, right beside your pawn. You may capture it “in passing” by moving to d6 — but only on this very move!',
      },
      fen: '7k/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
      expect: { moves: ['e5d6'] },
    },
    {
      kind: 'move',
      category: 'special',
      title: { zh: '升變', en: 'Promotion' },
      text: { zh: '士兵走到最後一排，就能變身成皇后、城堡、主教或騎士。請把 a7 的士兵走到 a8，選一個你喜歡的棋子。', en: 'A pawn that reaches the last rank becomes a queen, rook, bishop or knight. Move the a7 pawn to a8 and choose.' },
      fen: '7k/P7/8/8/8/8/8/4K3 w - - 0 1',
      expect: { from: 'a7' },
    },
    {
      kind: 'challenge',
      category: 'win',
      title: { zh: '將死！', en: 'Checkmate!' },
      text: {
        zh: '「將軍」就是攻擊對方國王；如果對方國王無論如何都逃不掉，就是「將死」，你就贏了。黑王被自己的士兵擋住了，找出一步將死！',
        en: 'Attacking the king is “check”. If the king has no way out, it is “checkmate” and you win. The black king is boxed in by its own pawns — find the mate!',
      },
      fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
      expect: { moves: ['a1a8'] },
      success: { zh: '漂亮！這叫「底線將死」。', en: 'Beautiful — a back-rank mate.' },
    },
    {
      kind: 'challenge',
      category: 'challenge',
      title: { zh: '挑戰題：皇后將死', en: 'Challenge: queen mate' },
      text: { zh: '你的國王在 b6 保護著，用皇后一步將死黑王。', en: 'Your king on b6 helps. Checkmate the black king with your queen in one move.' },
      fen: 'k7/8/1K6/8/8/8/7Q/8 w - - 0 1',
      expect: { moves: ['h2h8'] },
    },
    {
      kind: 'explore',
      category: 'mistakes',
      title: { zh: '常見錯誤：被牽制的棋子', en: 'Common mistake: pinned pieces' },
      text: {
        zh: 'e2 的騎士擋在國王和黑方城堡中間。如果騎士離開，國王就會被將軍，所以騎士不能動！點一下騎士試試看，再點「繼續」。',
        en: 'The knight on e2 stands between your king and the black rook. If it moved, your king would be in check — so it cannot move! Tap it to see, then press Continue.',
      },
      fen: '4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1',
      highlight: ['e2', 'e8'],
    },
    {
      kind: 'info',
      category: 'win',
      title: { zh: '和局：逼和', en: 'Draw: stalemate' },
      text: {
        zh: '輪到黑方，黑王沒有被將軍，可是無路可走——這叫「逼和」，結果是和局。快贏的時候要小心別逼和對手！其他和局還有：子力不足、同一局面重複、50／75 回合規則、雙方同意。',
        en: 'Black to move: the king is not in check but has no legal move — stalemate, a draw. Be careful not to stalemate when you are winning! Other draws: insufficient material, repetition, the 50/75-move rules and agreement.',
      },
      fen: 'k7/8/1Q6/8/8/8/8/K7 b - - 0 1',
      highlight: ['a8'],
    },
  ],

  xiangqi: [
    {
      kind: 'info',
      category: 'board',
      title: { zh: '認識棋盤', en: 'The board' },
      text: {
        zh: '象棋棋子放在線的交叉點上。棋盤有 9 條直線、10 條橫線，中間是「楚河漢界」。上下各有一個畫著斜線的「九宮」，是帥和將的家。紅方先走。',
        en: 'Xiangqi pieces stand on line intersections: 9 files and 10 ranks, split by the river in the middle. Each side has a “palace” marked with diagonals — home of the general. Red moves first.',
      },
      fen: XQ_START,
      highlight: ['e1', 'e10'],
    },
    {
      kind: 'info',
      category: 'names',
      title: { zh: '棋子名稱', en: 'Meet the pieces' },
      text: {
        zh: '紅方：帥、仕、相、俥、傌、炮、兵；黑方：將、士、象、車、馬、包、卒。各 16 枚。把對方的帥（將）將死就贏了。',
        en: 'Red: general 帥, advisors 仕, elephants 相, chariots 俥, horses 傌, cannons 炮, soldiers 兵. Black uses 將士象車馬包卒. Checkmate the enemy general to win.',
      },
      fen: XQ_START,
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '俥：直線衝刺', en: 'Chariot: straight lines' },
      text: { zh: '俥（車）可以直走或橫走，格數不限，但不能跳過棋子。請移動 a1 的俥。', en: 'The chariot moves any distance along a line but cannot jump. Move the chariot on a1.' },
      fen: '3k5/9/9/9/9/9/9/9/9/R3K4 w - - 0 1',
      expect: { from: 'a1' },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '傌：走日字，小心蹩馬腿', en: 'Horse: watch its leg' },
      text: {
        zh: '傌（馬）先直走一格再斜走一格，像「日」字。如果直走的那一格有棋子，就叫「蹩馬腿」，那個方向不能走。e2 有兵擋住，所以傌不能往上跳。請移動 e1 的傌。',
        en: 'The horse moves one point straight then one diagonally. If the straight point is occupied the horse is “hobbled” and cannot go that way. The soldier on e2 blocks upward jumps. Move the horse on e1.',
      },
      fen: '3k5/9/9/9/9/9/9/9/4P4/4NK3 w - - 0 1',
      expect: { from: 'e1' },
      highlight: ['e2'],
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '相：走田字，不能過河', en: 'Elephant: never crosses the river' },
      text: {
        zh: '相（象）斜走兩格，像「田」字，而且不能過河。田字中心有子叫「塞象眼」，就不能走。d2 塞住了往 e3 的象眼。請移動 c1 的相。',
        en: 'The elephant moves exactly two points diagonally and never crosses the river. If the middle point is occupied (“blocked eye”) it cannot go. d2 blocks the way to e3. Move the elephant on c1.',
      },
      fen: '3k5/9/9/9/9/9/9/9/3P5/2B1K4 w - - 0 1',
      expect: { from: 'c1' },
      highlight: ['d2'],
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '仕：九宮斜走', en: 'Advisor: diagonal in the palace' },
      text: { zh: '仕（士）只能在九宮裡斜走一格，保護帥。請移動 d1 的仕。', en: 'The advisor moves one point diagonally, only inside the palace. Move the advisor on d1.' },
      fen: '3k5/9/9/9/9/9/P8/9/9/3AK4 w - - 0 1',
      expect: { from: 'd1' },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '帥：九宮一步', en: 'General: one step in the palace' },
      text: { zh: '帥（將）只能在九宮裡直走或橫走一格。請移動 e1 的帥。', en: 'The general moves one point straight, only inside the palace. Move the general.' },
      fen: '3k5/9/9/9/9/9/P8/9/9/3AK4 w - - 0 1',
      expect: { from: 'e1' },
    },
    {
      kind: 'move',
      category: 'capture',
      title: { zh: '炮：隔一子打', en: 'Cannon: jump to capture' },
      text: {
        zh: '炮（包）平常走法和俥一樣；但是吃子時，中間一定要剛好隔一枚棋子（叫「炮架」）。e5 的黑車就是炮架，請用 e1 的炮跳過去吃掉 e7 的黑卒。',
        en: 'The cannon moves like a chariot, but to capture it must jump over exactly one piece (the “screen”). The black chariot on e5 is the screen: capture the soldier on e7.',
      },
      fen: '5k3/9/9/4p4/9/4r4/9/9/9/3KC4 w - - 0 1',
      expect: { moves: ['e1e7'] },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '兵：只能前進', en: 'Soldier: forward only' },
      text: { zh: '兵（卒）還沒過河時只能往前走一格。請把 c4 的兵往前走。', en: 'Before crossing the river a soldier can only step forward. Move the c4 soldier forward.' },
      fen: '3k5/9/9/9/9/9/2P6/9/9/4K4 w - - 0 1',
      expect: { moves: ['c4c5'] },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '過河兵可以橫走', en: 'Across the river: sideways too' },
      text: { zh: '兵過了河之後，就可以往前或左右走一格，但永遠不能後退。請移動 c6 的兵。', en: 'Once across the river a soldier may also step sideways — but never backwards. Move the soldier on c6.' },
      fen: '3k5/9/9/9/2P6/9/9/9/9/4K4 w - - 0 1',
      expect: { from: 'c6' },
    },
    {
      kind: 'move',
      category: 'capture',
      title: { zh: '吃子', en: 'Capturing' },
      text: { zh: '除了炮以外，棋子用自己的走法走到對方棋子的位置就能吃掉它。請用俥吃掉 a5 的黑車。', en: 'Every piece except the cannon captures by moving onto an enemy piece. Capture the black chariot on a5.' },
      fen: '3k5/9/9/9/9/r8/9/9/9/R3K4 w - - 0 1',
      expect: { moves: ['a1a5'] },
    },
    {
      kind: 'move',
      category: 'special',
      title: { zh: '將帥不能照面', en: 'Generals may not face each other' },
      text: {
        zh: '帥和將在同一條直線上、中間沒有任何棋子時，叫做「照面」，這是不允許的。帥如果走到 e1 就會和 e10 的將照面。請把帥往前走一步到 d2。',
        en: 'The two generals may never stand on the same file with nothing between them. Moving to e1 would face the black general on e10. Move the general forward to d2 instead.',
      },
      fen: '4k4/9/9/9/9/9/9/9/9/3K4R w - - 0 1',
      expect: { moves: ['d1d2'] },
      highlight: ['e10'],
    },
    {
      kind: 'challenge',
      category: 'win',
      title: { zh: '將死！', en: 'Checkmate!' },
      text: { zh: 'a9 的俥封住了第 9 線。再用另一隻俥將軍，讓黑將無路可逃！', en: 'The chariot on a9 controls rank 9. Give check with the other chariot so the black general has nowhere to go!' },
      fen: '3k5/R8/9/9/9/9/9/9/9/1R2K4 w - - 0 1',
      expect: { moves: ['b1b10'] },
      success: { zh: '漂亮！這是「雙車錯殺」。', en: 'Beautiful — a two-chariot mate.' },
    },
    {
      kind: 'info',
      category: 'win',
      title: { zh: '困斃也算輸', en: 'No moves = you lose' },
      text: {
        zh: '輪到黑方，黑將沒有被將軍，卻沒有任何一步可以走——在象棋裡這叫「困斃」，黑方輸！這點和西洋棋不同。',
        en: 'Black to move: not in check, yet no legal move. In xiangqi this “stalemate” is a LOSS for Black — unlike chess.',
      },
      fen: '3k5/R8/9/9/9/9/9/9/9/4K4 b - - 0 1',
      highlight: ['d10'],
    },
    {
      kind: 'info',
      category: 'special',
      title: { zh: '長將與長捉', en: 'Perpetual check & chase' },
      text: {
        zh: '同一個局面出現第 3 次時，系統會裁決：一直將軍（長將）或一直捉對方沒保護的子（長捉）的一方判負；雙方都沒有違規就是和局。所以不能靠一直將軍來逼和。',
        en: 'When a position repeats for the third time the game is adjudicated: a side that checks every move (perpetual check) or keeps chasing an unprotected piece (perpetual chase) loses; otherwise it is a draw.',
      },
      fen: XQ_START,
    },
    {
      kind: 'explore',
      category: 'mistakes',
      title: { zh: '常見錯誤：蹩馬腿', en: 'Common mistake: hobbled horse' },
      text: {
        zh: '新手常常忘記蹩馬腿。點一下 e1 的傌，看看哪些方向被擋住了；再點一下 e2 的兵附近的位置試試。看完請按「繼續」。',
        en: 'Beginners often forget the hobbled-horse rule. Tap the horse on e1 and see which jumps are blocked. Press Continue when done.',
      },
      fen: '3k5/9/9/9/9/9/9/9/4P4/4NK3 w - - 0 1',
      highlight: ['e2'],
    },
  ],

  banqi: [
    {
      kind: 'info',
      category: 'board',
      title: { zh: '認識暗棋', en: 'What is Banqi?' },
      text: {
        zh: '暗棋用 4 × 8 的棋盤和 32 枚象棋棋子。開始時所有棋子背面朝上、隨機排好，誰也不知道哪一枚是什麼。',
        en: 'Banqi uses a 4 × 8 board and all 32 xiangqi pieces, shuffled face-down. Nobody knows which piece is which.',
      },
      banqi: { up: {}, fresh: true },
    },
    {
      kind: 'move',
      category: 'board',
      title: { zh: '翻棋決定顏色', en: 'Flip to choose your colour' },
      text: { zh: '第一步一定要翻棋。你翻出的第一枚棋子是什麼顏色，你就是那一方！點任何一枚棋子把它翻開。', en: 'The first move must be a flip. The colour of the first piece you reveal becomes YOUR colour! Tap any piece to flip it.' },
      banqi: { up: {}, fresh: true },
      expect: { anyFlip: true },
    },
    {
      kind: 'info',
      category: 'names',
      title: { zh: '棋子階級', en: 'Piece ranks' },
      text: {
        zh: '階級由大到小：帥將 ＞ 仕士 ＞ 相象 ＞ 俥車 ＞ 傌馬 ＞ 炮包 ＞ 兵卒。大的可以吃小的，同樣大的也可以互吃。',
        en: 'From strongest to weakest: General > Advisor > Elephant > Chariot > Horse > Cannon > Soldier. A piece may capture equal or lower ranks.',
      },
      banqi: { up: { a1: 'K', b1: 'A', c1: 'B', d1: 'R', e1: 'N', f1: 'C', g1: 'P', a2: 'k', b2: 'a', c2: 'b', d2: 'r', e2: 'n', f2: 'c', g2: 'p' }, seatColor: ['red', 'black'] },
    },
    {
      kind: 'move',
      category: 'moves',
      title: { zh: '移動一格', en: 'Move one step' },
      text: { zh: '翻開的己方棋子可以往上、下、左、右走一格到空格。請移動 d2 的俥。', en: 'A face-up piece of yours moves one step up, down, left or right to an empty square. Move the chariot on d2.' },
      banqi: { up: { d2: 'R', h4: 'k' }, down: ['a4', 'b4'], seatColor: ['red', 'black'] },
      expect: { from: 'd2' },
    },
    {
      kind: 'move',
      category: 'capture',
      title: { zh: '吃子', en: 'Capturing' },
      text: { zh: '俥比馬大，所以可以吃掉旁邊的黑馬。請用 a1 的俥吃掉 b1 的馬。', en: 'The chariot outranks the horse, so it may capture it. Capture the horse on b1 with your chariot.' },
      banqi: { up: { a1: 'R', b1: 'n', h4: 'k' }, seatColor: ['red', 'black'] },
      expect: { moves: ['a1-b1'] },
    },
    {
      kind: 'move',
      category: 'special',
      title: { zh: '兵卒可以吃帥將', en: 'Soldiers capture generals' },
      text: { zh: '帥將雖然最大，卻怕最小的兵卒！請用 a1 的兵吃掉 b1 的將。', en: 'The general is the biggest — yet the tiny soldier can capture it! Capture the general on b1 with your soldier.' },
      banqi: { up: { a1: 'P', b1: 'k', h4: 'r' }, seatColor: ['red', 'black'] },
      expect: { moves: ['a1-b1'] },
    },
    {
      kind: 'explore',
      category: 'mistakes',
      title: { zh: '帥將不能吃兵卒', en: 'Generals can’t capture soldiers' },
      text: { zh: '反過來，帥將不可以吃兵卒。點一下 a1 的帥，你會發現 b1 的卒不能吃。看完請按「繼續」。', en: 'The other way round is not allowed: a general cannot capture a soldier. Tap the general on a1 and see. Press Continue when done.' },
      banqi: { up: { a1: 'K', b1: 'p', h4: 'r' }, seatColor: ['red', 'black'] },
      highlight: ['b1'],
    },
    {
      kind: 'move',
      category: 'capture',
      title: { zh: '炮：隔一子跳吃', en: 'Cannon: jump to capture' },
      text: {
        zh: '炮吃子時必須跳過剛好一枚棋子（明的暗的都可以），距離不限，而且什麼棋子都能吃！請用 a1 的炮跳過 b1，吃掉 d1 的黑車。',
        en: 'A cannon captures by jumping over exactly one piece (face-up or down), at any distance — and it can capture anything! Jump over b1 to capture the chariot on d1.',
      },
      banqi: { up: { a1: 'C', d1: 'r', h4: 'k' }, down: ['b1'], seatColor: ['red', 'black'] },
      expect: { moves: ['a1-d1'] },
    },
    {
      kind: 'info',
      category: 'win',
      title: { zh: '怎樣算贏', en: 'How to win' },
      text: {
        zh: '把對方的棋子全部吃光就贏了；輪到對方卻完全沒棋可走，也是你贏。很久都沒有吃子或翻棋、或同一局面重複出現，就是和局。',
        en: 'Capture all of your opponent’s pieces — or leave them with no possible move — to win. A long stretch without captures or flips, or repeated positions, is a draw.',
      },
      banqi: { up: { a1: 'R', b1: 'p' }, seatColor: ['red', 'black'] },
    },
    {
      kind: 'info',
      category: 'practice',
      title: { zh: '小技巧', en: 'Tips' },
      text: {
        zh: '1. 不要在對方大子旁邊亂翻棋。2. 炮很厲害，要好好保護。3. 留一隻兵卒在身邊，對付對方的帥將。準備好了就去和電腦下一盤吧！',
        en: '1. Don’t flip next to strong enemy pieces. 2. Cannons are powerful — protect them. 3. Keep a soldier nearby to threaten the enemy general. Now go play the computer!',
      },
      banqi: { up: {}, fresh: true },
    },
  ],
};
