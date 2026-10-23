// Page metadata shared by the SPA (runtime) and the build-time prerenderer (scripts/prerender.ts).
export const ORIGIN = 'https://chess.jytrvl.com';

export interface PageMeta {
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  index: boolean;
}

export const PAGES: Record<string, PageMeta> = {
  '/': {
    title: { zh: 'JY Games｜西洋棋・象棋・暗棋・領地爭奪戰・貪食蛇・瘋狂碰碰車・方塊消除・數獨・色彩塗鴉樂・數學遊樂島・手繪雲霄飛車', en: 'JY Games | Chess, Xiangqi, Banqi, Territory Rush, Snake Arena, Crazy Bumper, Block Puzzle Battle, Sudoku, Color Doodle, Math Island & Sketch Coaster' },
    description: {
      zh: '免費線上遊戲平台：棋藝策略（西洋棋、中國象棋、台灣暗棋）、即時競技（領地爭奪戰、貪食蛇競技場、瘋狂碰碰車）與益智創作（方塊消除對戰、經典數獨、色彩塗鴉樂）。三級電腦 AI、線上對戰、互動教學。',
      en: 'Free online game platform: strategy (Chess, Xiangqi, Banqi), real-time action (Territory Rush, Snake Arena, Crazy Bumper) and puzzles & creativity (Block Puzzle Battle, Classic Sudoku, Color Doodle). Three AI levels, online play and interactive lessons.',
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
  '/sudoku': {
    title: { zh: '經典數獨｜線上數獨，三種難度｜JY Games', en: 'Classic Sudoku | Play Sudoku Online, Three Levels | JY Games' },
    description: {
      zh: '免登入的經典 9×9 數獨：簡單、中等、困難三種邏輯難度，每題唯一解；筆記、復原、可解釋的提示與本機自動保存。',
      en: 'Classic 9×9 Sudoku with no sign-in: easy, medium and hard logic levels, every puzzle with one solution; notes, undo, explained hints and local autosave.',
    },
    index: true,
  },
  '/math': {
    title: { zh: '數學遊樂島｜一到三年級動手數學遊戲｜JY Games', en: 'Math Island | Hands-on Maths Games for Grades 1–3 | JY Games' },
    description: { zh: '免登入的兒童數學小遊戲：一年級蘋果籃（合起來數一數）、湊十小火車（先湊成 10）、零錢小商店（用錢幣付錢）、天平等一等（等號的意思）、時鐘修理站（撥時鐘），二年級乘法花圃，三年級分裝工廠（平分）、數線青蛙。動手擺一擺再數一數，附國語朗讀，不計時、不扣分。', en: 'Free kids maths games with no sign-in: Apple Basket (putting together), Make-Ten Train, Coin Shop, Balance Scale and Clock Repair for grades 1–2, Multiplication Garden for grade 2, and Packing Factory and Number-Line Frog for grade 3. Move things, then count; Mandarin voice prompts, no timer, no penalties.' },
    index: true,
  },
  '/math/parent': {
    title: { zh: '給大人看｜數學遊樂島｜JY Games', en: 'For adults | Math Island | JY Games' },
    description: { zh: '數學遊樂島的大人說明：每款遊戲練什麼、對應課綱、年級顏色、隱私與朗讀。', en: 'Math Island for adults: what each game practises, curriculum links, grade colours, privacy and spoken prompts.' },
    index: true,
  },
  '/math/g1/apple': {
    title: { zh: '蘋果籃｜一年級合起來數一數｜數學遊樂島｜JY Games', en: 'Apple Basket | Grade 1 Putting Together | Math Island | JY Games' },
    description: { zh: '一年級：把兩堆蘋果放進籃子，數一數一共幾顆。5 題，答錯可以再數一次。', en: 'Grade 1: put two groups of apples into the basket and count them. 5 problems; a wrong answer can be counted again.' },
    index: true,
  },
  '/math/g1/train': {
    title: { zh: '湊十小火車｜一年級先湊成 10｜數學遊樂島｜JY Games', en: 'Make-Ten Train | Grade 1 Make Ten First | Math Island | JY Games' },
    description: { zh: '一年級：請乘客上火車，第一節坐滿 10 人再坐第二節，看懂 8 加 5 是 10 和 3。5 題，答錯可以再數一次。', en: 'Grade 1: board the riders, filling car 1 to ten before car 2, and see 8 + 5 as 10 and 3. 5 problems; a wrong answer can be counted again.' },
    index: true,
  },
  '/math/g1/shop': {
    title: { zh: '零錢小商店｜一、二年級用錢幣付錢｜數學遊樂島｜JY Games', en: 'Coin Shop | Grades 1–2 Paying with Coins | Math Island | JY Games' },
    description: { zh: '一、二年級：用 1、5、10、50 元硬幣湊出剛好的價錢。錢不夠或付太多會告訴你差多少。5 題。', en: 'Grades 1–2: pay the exact price with 1, 5, 10 and 50 dollar coins. Too little or too much tells you by how much. 5 problems.' },
    index: true,
  },
  '/math/g1/balance': {
    title: { zh: '天平等一等｜一、二年級等號的意思｜數學遊樂島｜JY Games', en: 'Balance Scale | Grades 1–2 What = Means | Math Island | JY Games' },
    description: { zh: '一、二年級：放積木讓天平兩邊一樣重，認識等號是「兩邊一樣多」，□ 不一定在右邊。5 題。', en: 'Grades 1–2: add blocks until the scale is level, and learn that = means both sides are the same; the box is not always on the right. 5 problems.' },
    index: true,
  },
  '/math/g1/clock': {
    title: { zh: '時鐘修理站｜一、二年級撥時鐘｜數學遊樂島｜JY Games', en: 'Clock Repair | Grades 1–2 Setting the Clock | Math Island | JY Games' },
    description: { zh: '一、二年級：轉長針撥時鐘，短針會跟著走，走過 12 點上午變下午。整點、半點、幾時幾分，5 題。', en: 'Grades 1–2: turn the minute hand and the hour hand follows; past 12 the morning turns into afternoon. Whole and half hours, then hours and minutes. 5 problems.' },
    index: true,
  },
  '/math/g2/garden': {
    title: { zh: '乘法花圃｜二年級乘法的意思｜數學遊樂島｜JY Games', en: 'Multiplication Garden | Grade 2 What Multiplying Means | Math Island | JY Games' },
    description: { zh: '二年級：拉出一塊花圃，每排一樣多，看懂「每排幾朵 × 幾排」，轉過來花一樣多。不用背九九乘法表。5 題。', en: 'Grade 2: pull out a flower bed with equal rows, see “in each row × rows”, and turn it round to find the same number. No times-table drills. 5 problems.' },
    index: true,
  },
  '/math/g3/frog': {
    title: { zh: '數線青蛙｜三年級數線｜數學遊樂島｜JY Games', en: 'Number-Line Frog | Grade 3 Number Lines | Math Island | JY Games' },
    description: { zh: '三年級：青蛙在數線上跳，選出牠會停在哪裡。刻度 1、10、100，還有只標兩端的數線。5 題。', en: 'Grade 3: the frog jumps along the number line; pick where it lands. Marks of 1, 10 and 100, and a line labelled only at its ends. 5 problems.' },
    index: true,
  },
  '/math/g3/factory': {
    title: { zh: '分裝工廠｜三年級平分｜數學遊樂島｜JY Games', en: 'Packing Factory | Grade 3 Equal Sharing | Math Island | JY Games' },
    description: { zh: '三年級：把餅乾平分到每一盒，再說每盒有幾個。5 題，答錯可以再分一次。', en: 'Grade 3: share cookies equally into boxes, then say how many are in each. 5 problems; a wrong answer can be shared again.' },
    index: true,
  },
  '/territory/flow': {
    title: { zh: '領地爭奪戰 連續轉向（預覽）｜JY Games', en: 'Territory Rush free steering (preview) | JY Games' },
    description: { zh: '滑鼠指向或手指觸碰就轉向的領地爭奪戰試玩預覽。', en: 'Preview of Territory Rush with point-to-steer and touch steering.' },
    index: false,
  },
  '/doodle': {
    title: { zh: '色彩塗鴉樂｜線上畫畫與混色｜JY Games', en: 'Color Doodle | Draw and Mix Colours Online | JY Games' },
    description: { zh: '打開就能畫：用紅黃藍混出橙綠紫，六個短任務、格子蓋印章，作品只存在自己的瀏覽器並可存成圖片。適合 5–12 歲。', en: 'Start drawing right away: mix red, yellow and blue into orange, green and purple, six short tasks, a stamp grid, and pictures that stay in your browser and save as PNG. For ages 5–12.' },
    index: true,
  },
  '/learn/doodle': {
    title: { zh: '色彩塗鴉樂玩法｜JY Games', en: 'How to Play Color Doodle | JY Games' },
    description: { zh: '三步：選顏色畫畫、兩色混一混、完成小任務。', en: 'Three steps: pick a colour and draw, mix two colours, try a short task.' },
    index: true,
  },
  '/rescue': {
    title: { zh: '星球救援隊（試玩原型）｜JY Games', en: 'Planet Rescue Crew (prototype) | JY Games' },
    description: { zh: '三個角色各看一張不同的資料卡，同一台平板一起排計畫，把零件送回基地。兒童合作與邏輯試玩原型。', en: 'Three roles each see a different card and plan together on one tablet to get the parts to the base. Kids teamwork and logic prototype.' },
    index: false,
  },
  '/trail': {
    title: { zh: '逆風探險賽（試玩原型）｜JY Games', en: 'Try Again Trail (prototype) | JY Games' },
    description: { zh: '在公開地圖上安排能量與路線，集滿三個徽章先到營地；結束後回看一個轉折再練習。兒童策略試玩原型。', en: 'Plan energy and routes on an open map, collect three badges and reach camp first; then look back at one turn and practise. Kids strategy prototype.' },
    index: false,
  },
  '/robot': {
    title: { zh: '機器人快遞站（試玩原型）｜JY Games', en: 'Robot Delivery Lab (prototype) | JY Games' },
    description: { zh: '用圖片指令排順序，讓機器人把包裹送到同色的門。兒童程式思維試玩原型。', en: 'Line up picture blocks so the robot delivers each parcel to its matching door. Kids coding playtest prototype.' },
    index: false,
  },
  '/restaurant': {
    title: { zh: '餐廳當老闆（一日原型）｜JY Games', en: 'Little Restaurant Owner (one-day prototype) | JY Games' },
    description: { zh: '選菜單、合併採買共用食材、分批備餐，打烊後看懂帳本。試玩原型。', en: 'Pick a menu, buy shared ingredients together, cook in batches and read the books. Playtest prototype.' },
    index: false,
  },
  '/bumper': {
    title: { zh: '瘋狂碰碰車｜JY Games', en: 'Crazy Bumper | JY Games' },
    description: { zh: '3D 碰碰車：選一隻動物和一台車，60 秒在嘉年華場地裡互撞、搶道具、撿星星。', en: 'A 3D bumper-car game: pick an animal and a car, bump around a carnival arena for 60 seconds, grab power-ups and collect stars.' },
    index: true,
  },
  '/learn/sudoku': {
    title: { zh: '數獨規則教學｜JY Games', en: 'How to Play Sudoku | JY Games' },
    description: { zh: '五個互動步驟：每列、每行、每宮 1–9，單一候選，以及筆記與提示。', en: 'Five interactive steps: rows, columns and boxes 1–9, single candidates, notes and hints.' },
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
  if (path.startsWith('/rescue/room/')) return { title: { zh: '星球救援隊房間｜JY Games', en: 'Planet Rescue Crew room | JY Games' }, description: { zh: '邀請你一起修好基地！', en: 'You are invited to help fix the base!' }, index: false };
  if (path.startsWith('/territory/room/')) return { title: { zh: '領地爭奪戰房間｜JY Games', en: 'Territory Rush room | JY Games' }, description: { zh: '邀請你來搶地盤！', en: 'You are invited to a Territory Rush match!' }, index: false };
  if (path.startsWith('/snake/room/')) return { title: { zh: '貪食蛇房間｜JY Games', en: 'Snake Arena room | JY Games' }, description: { zh: '邀請你來貪食蛇競技場對戰！', en: 'You are invited to a Snake Arena match!' }, index: false };
  if (path.startsWith('/blocks/room/')) return { title: { zh: '方塊對戰房間｜JY Games', en: 'Block Puzzle Battle room | JY Games' }, description: { zh: '邀請你來方塊消除對戰！', en: 'You are invited to a Block Puzzle Battle!' }, index: false };
  if (path.startsWith('/room/')) return { title: { zh: '對戰房間｜JY Games', en: 'Game room | JY Games' }, description: { zh: '邀請你來下一盤！', en: 'You are invited to a game!' }, index: false };
  return PAGES[path] ?? { title: { zh: 'JY Games', en: 'JY Games' }, description: PAGES['/'].description, index: false };
}
