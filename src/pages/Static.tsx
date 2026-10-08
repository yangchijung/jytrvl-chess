import { useI18n } from '../i18n';
import { PageTitle } from '../components/ui';
import { REPO_URL, CONTACT_EMAIL } from '../lib/config';

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="prose-jy max-w-3xl space-y-4 leading-relaxed">{children}</div>;
}

export function About() {
  const { t, lang } = useI18n();
  return (
    <div>
      <PageTitle>{t('about.title')}</PageTitle>
      {lang === 'zh' ? (
        <Prose>
          <p>JY Chess 是由 JetNet Ltd. 開發的線上棋藝平台，提供西洋棋、中國象棋與台灣暗棋，適合家庭、兒童與進階玩家。</p>
          <h2>規則版本</h2>
          <ul>
            <li>西洋棋：FIDE《Laws of Chess》2023 年版。</li>
            <li>中國象棋：JY Chess 台灣象棋規則 v1.0（含長將、長捉裁決）。</li>
            <li>台灣暗棋：JY Chess 台灣暗棋規則 v1.0（台灣常見版，可切換地方規則）。</li>
          </ul>
          <h2>開放原始碼與授權</h2>
          <p>
            本網站完整原始碼以 GNU GPL v3 授權公開：
            <a href={REPO_URL} className="underline" rel="noopener">
              {REPO_URL}
            </a>
          </p>
          <ul>
            <li>Stockfish 19（stockfish.js，GPL-3.0）— 西洋棋 AI 與教練。</li>
            <li>Fairy-Stockfish WASM（GPL-3.0）— 中國象棋 AI 與教練。</li>
            <li>chess.js（BSD-2-Clause）— 西洋棋規則。</li>
            <li>西洋棋棋子圖案：Colin M.L. Burnett「cburnett」（GPLv2+）。</li>
            <li>字型：Noto Serif TC、Inter（SIL Open Font License 1.1）。</li>
            <li>中國象棋、暗棋規則引擎與暗棋 AI 為 JY Chess 自行開發。</li>
          </ul>
          <p>引擎原始碼位置另列於 /engines/SOURCES.txt。</p>
          <h2>聯絡</h2>
          <p>{CONTACT_EMAIL}</p>
        </Prose>
      ) : (
        <Prose>
          <p>JY Chess is an online board game platform by JetNet Ltd. for Chess, Xiangqi and Taiwanese Banqi — built for families, children and experienced players alike.</p>
          <h2>Rule versions</h2>
          <ul>
            <li>Chess: FIDE Laws of Chess, 2023 edition.</li>
            <li>Xiangqi: JY Chess Taiwan Xiangqi Rules v1.0 (with perpetual check / chase adjudication).</li>
            <li>Banqi: JY Chess Taiwan Banqi Rules v1.0 (Taiwan standard, switchable house rules).</li>
          </ul>
          <h2>Open source & licences</h2>
          <p>
            The complete source code of this site is published under the GNU GPL v3:{' '}
            <a href={REPO_URL} className="underline" rel="noopener">
              {REPO_URL}
            </a>
          </p>
          <ul>
            <li>Stockfish 19 (stockfish.js, GPL-3.0) — chess AI and coach.</li>
            <li>Fairy-Stockfish WASM (GPL-3.0) — xiangqi AI and coach.</li>
            <li>chess.js (BSD-2-Clause) — chess rules.</li>
            <li>Chess piece artwork: “cburnett” by Colin M.L. Burnett (GPLv2+).</li>
            <li>Fonts: Noto Serif TC, Inter (SIL Open Font License 1.1).</li>
            <li>The xiangqi and banqi rule engines and the banqi AI were written for JY Chess.</li>
          </ul>
          <p>Engine source locations are listed in /engines/SOURCES.txt.</p>
          <h2>Contact</h2>
          <p>{CONTACT_EMAIL}</p>
        </Prose>
      )}
    </div>
  );
}

export function Privacy() {
  const { t, lang } = useI18n();
  return (
    <div>
      <PageTitle sub={lang === 'zh' ? '最後更新：2026 年 10 月' : 'Last updated: October 2026'}>{t('privacy.title')}</PageTitle>
      {lang === 'zh' ? (
        <Prose>
          <h2>我們蒐集的資料</h2>
          <ul>
            <li>訪客：一組隨機產生的訪客識別碼（存在 Cookie），用於線上對戰辨識同一位玩家。不需提供任何個人資料。</li>
            <li>Google 登入：Google 帳號識別碼（sub）、電子郵件與名字（僅用於產生預設暱稱）。我們不會取得你的 Google 密碼。</li>
            <li>對局資料：線上對局的棋步、結果與積分。</li>
            <li>安全用途：連線 IP 位址的單向雜湊值，用於流量限制與防止同一網路刷分；不儲存原始 IP。</li>
            <li>錯誤紀錄：網站錯誤訊息（不含個人資料），用於維護網站。</li>
          </ul>
          <h2>Cookie 與本機儲存</h2>
          <p>只使用必要 Cookie：登入工作階段（jy_sid）、訪客識別（jy_gid）、登入流程暫存（jy_oauth）。網站設定與本機對局存在你的瀏覽器 localStorage。不使用廣告或第三方追蹤。</p>
          <h2>資料使用與分享</h2>
          <p>資料只用於提供遊戲、紀錄、排行榜與維護安全；不出售、不分享給第三方行銷。網站由 Cloudflare 託管與處理流量。</p>
          <h2>保存與刪除</h2>
          <p>你可以在「玩家資料」頁面隨時刪除帳號，系統會刪除帳號、登入工作階段與積分，並把歷史對局中的名稱改為「deleted」。登入工作階段 30 天後失效。</p>
          <h2>兒童</h2>
          <p>訪客模式不需要任何個人資料，適合兒童使用。兒童使用 Google 登入應經家長同意。</p>
          <h2>聯絡</h2>
          <p>{CONTACT_EMAIL}</p>
          <p className="text-sm text-[var(--muted)]">本政策依中華民國《個人資料保護法》精神撰寫，正式上線前建議由法律顧問審閱。</p>
        </Prose>
      ) : (
        <Prose>
          <h2>What we collect</h2>
          <ul>
            <li>Guests: a random guest identifier stored in a cookie so online games can recognise you. No personal data is required.</li>
            <li>Google sign-in: your Google account ID (sub), email address and first name (only to create a default nickname). We never see your password.</li>
            <li>Game data: moves, results and ratings of online games.</li>
            <li>Security: a one-way hash of your IP address for rate limiting and anti-cheating; raw IP addresses are not stored.</li>
            <li>Error logs: technical error messages without personal data.</li>
          </ul>
          <h2>Cookies & local storage</h2>
          <p>Only essential cookies: the sign-in session (jy_sid), guest ID (jy_gid) and a temporary sign-in state (jy_oauth). Settings and local games are kept in your browser’s localStorage. No advertising or third-party tracking.</p>
          <h2>Use & sharing</h2>
          <p>Data is used only to run the games, history, leaderboards and security. It is never sold or shared for marketing. The site is hosted by Cloudflare.</p>
          <h2>Retention & deletion</h2>
          <p>Delete your account anytime on the Profile page: your account, sessions and ratings are removed and your name in past games is replaced by “deleted”. Sessions expire after 30 days.</p>
          <h2>Children</h2>
          <p>Guest mode needs no personal data. Children should sign in with Google only with a parent’s permission.</p>
          <h2>Contact</h2>
          <p>{CONTACT_EMAIL}</p>
        </Prose>
      )}
    </div>
  );
}

export function Terms() {
  const { t, lang } = useI18n();
  return (
    <div>
      <PageTitle sub={lang === 'zh' ? '最後更新：2026 年 10 月' : 'Last updated: October 2026'}>{t('terms.title')}</PageTitle>
      {lang === 'zh' ? (
        <Prose>
          <ol className="list-decimal space-y-3 pl-5">
            <li>JY Chess 免費提供，服務以現況提供，可能因維護而暫停。</li>
            <li>公平競賽：計分對局中禁止使用外部引擎、多帳號或與他人串通刷分。系統會自動排除可疑對局，違規帳號可能被停權。</li>
            <li>暱稱不得含有冒犯、歧視或冒充他人的內容。</li>
            <li>禁止干擾服務運作，包括自動化大量請求或嘗試竄改對局資料。</li>
            <li>網站原始碼以 GPL-3.0 授權；你可依授權條款使用、修改與散布。</li>
            <li>本條款適用中華民國法律。</li>
          </ol>
          <p className="text-sm text-[var(--muted)]">正式上線前建議由法律顧問審閱。</p>
        </Prose>
      ) : (
        <Prose>
          <ol className="list-decimal space-y-3 pl-5">
            <li>JY Chess is free and provided “as is”; it may be unavailable during maintenance.</li>
            <li>Fair play: in rated games, external engines, multiple accounts and collusion are forbidden. Suspicious games are excluded automatically and offending accounts may be suspended.</li>
            <li>Nicknames must not be offensive, discriminatory or impersonate others.</li>
            <li>Do not disrupt the service, including automated mass requests or attempts to tamper with games.</li>
            <li>The site’s source code is licensed under GPL-3.0 and may be used, modified and shared under its terms.</li>
            <li>These terms are governed by the laws of Taiwan (R.O.C.).</li>
          </ol>
        </Prose>
      )}
    </div>
  );
}
