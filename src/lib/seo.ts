// Page metadata shared by the SPA (runtime) and the build-time prerenderer (scripts/prerender.ts).
export const ORIGIN = 'https://chess.jytrvl.com';

export interface PageMeta {
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  index: boolean;
}

export const PAGES: Record<string, PageMeta> = {
  '/': {
    title: { zh: 'JY Chess｜西洋棋・中國象棋・台灣暗棋線上對戰', en: 'JY Chess | Play Chess, Xiangqi & Banqi Online' },
    description: {
      zh: '免費線上棋藝平台：西洋棋、中國象棋、台灣暗棋。三級電腦 AI、即時線上對戰、互動教學與 AI 教練，適合兒童與成人。',
      en: 'Free online board game platform for Chess, Xiangqi and Taiwanese Banqi: three AI levels, real-time online play, interactive lessons and an AI coach.',
    },
    index: true,
  },
  '/chess': {
    title: { zh: '西洋棋線上對戰｜JY Chess', en: 'Play Chess Online | JY Chess' },
    description: { zh: '依 FIDE 正式規則的西洋棋：與 Stockfish AI 對戰、雙人同機或線上邀請朋友。', en: 'Chess under official FIDE rules: play Stockfish at three levels, on one device, or online with friends.' },
    index: true,
  },
  '/xiangqi': {
    title: { zh: '中國象棋線上對戰｜JY Chess', en: 'Play Xiangqi (Chinese Chess) Online | JY Chess' },
    description: { zh: '台灣常見規則的中國象棋，含長將長捉裁決；電腦三級難度、線上對戰與互動教學。', en: 'Xiangqi with Taiwan-style rules including perpetual check and chase; three AI levels, online play and lessons.' },
    index: true,
  },
  '/banqi': {
    title: { zh: '台灣暗棋線上對戰｜JY Chess', en: 'Play Taiwanese Banqi (Dark Chess) Online | JY Chess' },
    description: { zh: '4×8 翻棋對戰的台灣暗棋，可切換地方規則；公平的伺服器洗牌與不作弊的電腦 AI。', en: 'Taiwanese Banqi (dark chess) on a 4×8 board with switchable house rules, fair server shuffles and a non-cheating AI.' },
    index: true,
  },
  '/learn/chess': {
    title: { zh: '西洋棋規則教學｜JY Chess', en: 'Learn Chess Rules | JY Chess' },
    description: { zh: '從棋子名稱到王車易位、吃過路兵與升變，互動式一步一步學會西洋棋。', en: 'Interactive step-by-step chess lessons from the pieces to castling, en passant and promotion.' },
    index: true,
  },
  '/learn/xiangqi': {
    title: { zh: '中國象棋規則教學｜JY Chess', en: 'Learn Xiangqi Rules | JY Chess' },
    description: { zh: '蹩馬腿、塞象眼、炮打隔子、將帥不照面——互動練習學會中國象棋。', en: 'Hobbled horses, blocked elephants, cannon screens and the flying general — learn xiangqi by doing.' },
    index: true,
  },
  '/learn/banqi': {
    title: { zh: '台灣暗棋規則教學｜JY Chess', en: 'Learn Banqi Rules | JY Chess' },
    description: { zh: '翻棋、階級、兵吃帥、炮跳吃：台灣暗棋互動教學。', en: 'Flipping, ranks, soldiers vs generals and cannon jumps: interactive Banqi lessons.' },
    index: true,
  },
  '/leaderboard': {
    title: { zh: '排行榜｜JY Chess', en: 'Leaderboard | JY Chess' },
    description: { zh: '西洋棋、中國象棋、台灣暗棋分開計算的線上積分排行榜。', en: 'Separate online rating leaderboards for Chess, Xiangqi and Banqi.' },
    index: true,
  },
  '/about': {
    title: { zh: '關於 JY Chess', en: 'About JY Chess' },
    description: { zh: 'JY Chess 由 JetNet Ltd. 開發，原始碼以 GPL-3.0 公開。', en: 'JY Chess is developed by JetNet Ltd.; its source code is published under GPL-3.0.' },
    index: true,
  },
  '/privacy': {
    title: { zh: '隱私權政策｜JY Chess', en: 'Privacy Policy | JY Chess' },
    description: { zh: 'JY Chess 如何蒐集、使用與保護你的資料。', en: 'How JY Chess collects, uses and protects your data.' },
    index: true,
  },
  '/terms': {
    title: { zh: '服務條款｜JY Chess', en: 'Terms of Service | JY Chess' },
    description: { zh: '使用 JY Chess 的服務條款。', en: 'Terms for using JY Chess.' },
    index: true,
  },
  '/play': {
    title: { zh: '開始遊戲｜JY Chess', en: 'Play | JY Chess' },
    description: { zh: '選擇棋類與遊戲模式。', en: 'Choose a game and a mode.' },
    index: false,
  },
  '/matchmaking': { title: { zh: '線上配對｜JY Chess', en: 'Matchmaking | JY Chess' }, description: { zh: '線上自動配對。', en: 'Online matchmaking.' }, index: false },
  '/profile': { title: { zh: '玩家資料｜JY Chess', en: 'Profile | JY Chess' }, description: { zh: '玩家資料。', en: 'Player profile.' }, index: false },
  '/history': { title: { zh: '對局紀錄｜JY Chess', en: 'History | JY Chess' }, description: { zh: '對局紀錄。', en: 'Game history.' }, index: false },
  '/settings': { title: { zh: '設定｜JY Chess', en: 'Settings | JY Chess' }, description: { zh: '網站設定。', en: 'Settings.' }, index: false },
};

export function metaFor(path: string): PageMeta {
  if (path.startsWith('/room/')) return { title: { zh: '對戰房間｜JY Chess', en: 'Game room | JY Chess' }, description: { zh: '邀請你來下一盤！', en: 'You are invited to a game!' }, index: false };
  return PAGES[path] ?? { title: { zh: 'JY Chess', en: 'JY Chess' }, description: PAGES['/'].description, index: false };
}
