// Page metadata shared by the SPA (runtime) and the build-time prerenderer (scripts/prerender.ts).
export const ORIGIN = 'https://chess.jytrvl.com';

export interface PageMeta {
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  index: boolean;
}

export const PAGES: Record<string, PageMeta> = {
  '/': {
    title: { zh: 'JY Games｜西洋棋・象棋・暗棋・領地爭奪戰・貪食蛇・方塊消除', en: 'JY Games | Chess, Xiangqi, Banqi, Territory Rush, Snake Arena & Block Puzzle Battle' },
    description: {
      zh: '免費線上遊戲平台：棋藝策略（西洋棋、中國象棋、台灣暗棋）、即時競技（領地爭奪戰、貪食蛇競技場）與益智挑戰（方塊消除對戰）。三級電腦 AI、線上對戰、互動教學。',
      en: 'Free online game platform: strategy (Chess, Xiangqi, Banqi), real-time action (Territory Rush, Snake Arena) and puzzles (Block Puzzle Battle). Three AI levels, online play and interactive lessons.',
    },
    index: true,
  },
  '/chess': {
    title: { zh: '西洋棋線上對戰｜JY Games', en: 'Play Chess Online | JY Games' },
    description: { zh: '依 FIDE 正式規則的西洋棋：與 Stockfish AI 對戰、雙人同機或線上邀請朋友。', en: 'Chess under official FIDE rules: play Stockfish at three levels, on one device, or online with friends.' },
    index: true,
  },
  '/xiangqi': {
    title: { zh: '中國象棋線上對戰｜JY Games', en: 'Play Xiangqi (Chinese Chess) Online | JY Games' },
    description: { zh: '台灣常見規則的中國象棋，含長將長捉裁決；電腦三級難度、線上對戰與互動教學。', en: 'Xiangqi with Taiwan-style rules including perpetual check and chase; three AI levels, online play and lessons.' },
    index: true,
  },
  '/banqi': {
    title: { zh: '台灣暗棋線上對戰｜JY Games', en: 'Play Taiwanese Banqi (Dark Chess) Online | JY Games' },
    description: { zh: '4×8 翻棋對戰的台灣暗棋，可切換地方規則；公平的伺服器洗牌與不作弊的電腦 AI。', en: 'Taiwanese Banqi (dark chess) on a 4×8 board with switchable house rules, fair server shuffles and a non-cheating AI.' },
    index: true,
  },
  '/territory': {
    title: { zh: '領地爭奪戰｜即時圈地對戰｜JY Games', en: 'Territory Rush | Real-time Land Grab | JY Games' },
    description: {
      zh: '原創即時圈地遊戲：畫出軌跡、繞回領地占地盤，切斷對手軌跡淘汰他。單人 vs AI、雙人同機、2–8 人線上對戰。',
      en: 'An original real-time land-grab game: draw trails, loop home to claim land, cut rivals off. Solo vs AI, two players on one device, or 2–8 players online.',
    },
    index: true,
  },
  '/learn/territory': {
    title: { zh: '領地爭奪戰玩法教學｜JY Games', en: 'How to Play Territory Rush | JY Games' },
    description: { zh: '五個互動步驟學會領地爭奪戰：控制方向、圈地、避開軌跡、切斷對手。', en: 'Five interactive steps: steer, claim land, guard your trail and cut off rivals.' },
    index: true,
  },
  '/snake': {
    title: { zh: '貪食蛇競技場｜經典・生存・多人對戰｜JY Games', en: 'Snake Arena | Classic, Survival & Multiplayer | JY Games' },
    description: {
      zh: '現代化貪食蛇：經典、生存、限時挑戰、三級電腦對戰、雙人同機與 2–8 人線上競技場，成績經伺服器驗證列入排行榜。',
      en: 'A modern snake game: classic, survival, time attack, three AI levels, local versus and a 2–8 player online arena with verified leaderboards.',
    },
    index: true,
  },
  '/learn/snake': {
    title: { zh: '貪食蛇競技場玩法教學｜JY Games', en: 'How to Play Snake Arena | JY Games' },
    description: { zh: '五個互動步驟學會貪食蛇：轉向、吃食物、避開自己、多人對戰規則。', en: 'Five interactive steps: steering, eating, avoiding yourself and arena rules.' },
    index: true,
  },
  '/blocks': {
    title: { zh: '方塊消除對戰｜線上落下方塊對戰｜JY Games', en: 'Block Puzzle Battle | Online Falling-Block Battles | JY Games' },
    description: {
      zh: '原創落下方塊消行遊戲：經典、無盡、40 行快速消行、限時挑戰、三級電腦、雙人同機、線上對戰與積分排行。',
      en: 'An original falling-block puzzle: classic, marathon, 40-line sprint, time attack, three AI levels, local and online battles with ranked ratings.',
    },
    index: true,
  },
  '/learn/blocks': {
    title: { zh: '方塊消除對戰玩法教學｜JY Games', en: 'How to Play Block Puzzle Battle | JY Games' },
    description: { zh: '六個互動步驟：移動、旋轉、硬降、消行、暫存與四行消。', en: 'Six interactive steps: move, rotate, hard drop, clear, hold and quads.' },
    index: true,
  },
  '/learn/chess': {
    title: { zh: '西洋棋規則教學｜JY Games', en: 'Learn Chess Rules | JY Games' },
    description: { zh: '從棋子名稱到王車易位、吃過路兵與升變，互動式一步一步學會西洋棋。', en: 'Interactive step-by-step chess lessons from the pieces to castling, en passant and promotion.' },
    index: true,
  },
  '/learn/xiangqi': {
    title: { zh: '中國象棋規則教學｜JY Games', en: 'Learn Xiangqi Rules | JY Games' },
    description: { zh: '蹩馬腿、塞象眼、炮打隔子、將帥不照面——互動練習學會中國象棋。', en: 'Hobbled horses, blocked elephants, cannon screens and the flying general — learn xiangqi by doing.' },
    index: true,
  },
  '/learn/banqi': {
    title: { zh: '台灣暗棋規則教學｜JY Games', en: 'Learn Banqi Rules | JY Games' },
    description: { zh: '翻棋、階級、兵吃帥、炮跳吃：台灣暗棋互動教學。', en: 'Flipping, ranks, soldiers vs generals and cannon jumps: interactive Banqi lessons.' },
    index: true,
  },
  '/leaderboard': {
    title: { zh: '排行榜｜JY Games', en: 'Leaderboard | JY Games' },
    description: { zh: '六款遊戲各自獨立的排行榜：棋類積分、即時競技戰績與經驗證的單人紀錄。', en: 'Separate leaderboards for all six games: board-game ratings, arena stats and verified solo records.' },
    index: true,
  },
  '/about': {
    title: { zh: '關於 JY Games', en: 'About JY Games' },
    description: { zh: 'JY Games 由 JetNet Ltd. 開發，原始碼以 GPL-3.0 公開。', en: 'JY Games is developed by JetNet Ltd.; its source code is published under GPL-3.0.' },
    index: true,
  },
  '/privacy': {
    title: { zh: '隱私權政策｜JY Games', en: 'Privacy Policy | JY Games' },
    description: { zh: 'JY Games 如何蒐集、使用與保護你的資料。', en: 'How JY Games collects, uses and protects your data.' },
    index: true,
  },
  '/terms': {
    title: { zh: '服務條款｜JY Games', en: 'Terms of Service | JY Games' },
    description: { zh: '使用 JY Games 的服務條款。', en: 'Terms for using JY Games.' },
    index: true,
  },
  '/play': {
    title: { zh: '開始遊戲｜JY Games', en: 'Play | JY Games' },
    description: { zh: '選擇棋類與遊戲模式。', en: 'Choose a game and a mode.' },
    index: false,
  },
  '/territory/play': { title: { zh: '領地爭奪戰｜JY Games', en: 'Territory Rush | JY Games' }, description: { zh: '領地爭奪戰對局。', en: 'Territory Rush match.' }, index: false },
  '/territory/match': { title: { zh: '領地爭奪戰線上配對｜JY Games', en: 'Territory Rush matchmaking | JY Games' }, description: { zh: '線上配對。', en: 'Matchmaking.' }, index: false },
  '/territory/new-room': { title: { zh: '建立領地爭奪戰房間｜JY Games', en: 'New Territory Rush room | JY Games' }, description: { zh: '建立私人房間。', en: 'Create a private room.' }, index: false },
  '/snake/play': { title: { zh: '貪食蛇競技場｜JY Games', en: 'Snake Arena | JY Games' }, description: { zh: '貪食蛇對局。', en: 'Snake Arena game.' }, index: false },
  '/snake/match': { title: { zh: '貪食蛇多人競技場配對｜JY Games', en: 'Snake Arena matchmaking | JY Games' }, description: { zh: '線上配對。', en: 'Matchmaking.' }, index: false },
  '/snake/new-room': { title: { zh: '建立貪食蛇房間｜JY Games', en: 'New Snake Arena room | JY Games' }, description: { zh: '建立私人房間。', en: 'Create a private room.' }, index: false },
  '/blocks/play': { title: { zh: '方塊消除對戰｜JY Games', en: 'Block Puzzle Battle | JY Games' }, description: { zh: '方塊消除對局。', en: 'Block Puzzle Battle game.' }, index: false },
  '/blocks/match': { title: { zh: '方塊消除線上配對｜JY Games', en: 'Block Puzzle Battle matchmaking | JY Games' }, description: { zh: '線上配對。', en: 'Matchmaking.' }, index: false },
  '/blocks/ranked': { title: { zh: '方塊消除積分對戰｜JY Games', en: 'Block Puzzle Battle ranked | JY Games' }, description: { zh: '積分對戰。', en: 'Ranked battle.' }, index: false },
  '/blocks/new-room': { title: { zh: '建立方塊對戰房間｜JY Games', en: 'New Block Puzzle Battle room | JY Games' }, description: { zh: '建立私人房間。', en: 'Create a private room.' }, index: false },
  '/matchmaking': { title: { zh: '線上配對｜JY Games', en: 'Matchmaking | JY Games' }, description: { zh: '線上自動配對。', en: 'Online matchmaking.' }, index: false },
  '/profile': { title: { zh: '玩家資料｜JY Games', en: 'Profile | JY Games' }, description: { zh: '玩家資料。', en: 'Player profile.' }, index: false },
  '/history': { title: { zh: '對局紀錄｜JY Games', en: 'History | JY Games' }, description: { zh: '對局紀錄。', en: 'Game history.' }, index: false },
  '/settings': { title: { zh: '設定｜JY Games', en: 'Settings | JY Games' }, description: { zh: '網站設定。', en: 'Settings.' }, index: false },
};

export function metaFor(path: string): PageMeta {
  if (path.startsWith('/territory/room/')) return { title: { zh: '領地爭奪戰房間｜JY Games', en: 'Territory Rush room | JY Games' }, description: { zh: '邀請你來搶地盤！', en: 'You are invited to a Territory Rush match!' }, index: false };
  if (path.startsWith('/snake/room/')) return { title: { zh: '貪食蛇房間｜JY Games', en: 'Snake Arena room | JY Games' }, description: { zh: '邀請你來貪食蛇競技場對戰！', en: 'You are invited to a Snake Arena match!' }, index: false };
  if (path.startsWith('/blocks/room/')) return { title: { zh: '方塊對戰房間｜JY Games', en: 'Block Puzzle Battle room | JY Games' }, description: { zh: '邀請你來方塊消除對戰！', en: 'You are invited to a Block Puzzle Battle!' }, index: false };
  if (path.startsWith('/room/')) return { title: { zh: '對戰房間｜JY Games', en: 'Game room | JY Games' }, description: { zh: '邀請你來下一盤！', en: 'You are invited to a game!' }, index: false };
  return PAGES[path] ?? { title: { zh: 'JY Games', en: 'JY Games' }, description: PAGES['/'].description, index: false };
}
