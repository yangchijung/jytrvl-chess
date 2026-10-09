import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { GameHub } from './pages/GameHub';
import { Play } from './pages/Play';
import { Room } from './pages/Room';
import { Matchmaking } from './pages/Matchmaking';
import { Learn, Settings, Profile, History, Replay, Leaderboard, NotFound } from './pages/Misc';
import { About, Privacy, Terms } from './pages/Static';
import { TerritoryHub, TerritoryPlay, TerritoryNewRoom } from './territory/pages';
import { TerritoryRoomPage, TerritoryMatchPage } from './territory/online-pages';
import { TerritoryLearn } from './territory/Learn';

function pages(prefix: string) {
  const p = (s: string) => `${prefix}${s}`;
  return [
    <Route key={p('/')} path={p('/') || '/'} element={<Home />} />,
    <Route key={p('/chess')} path={p('/chess')} element={<GameHub game="chess" />} />,
    <Route key={p('/xiangqi')} path={p('/xiangqi')} element={<GameHub game="xiangqi" />} />,
    <Route key={p('/banqi')} path={p('/banqi')} element={<GameHub game="banqi" />} />,
    <Route key={p('/learn/territory')} path={p('/learn/territory')} element={<TerritoryLearn />} />,
    <Route key={p('/learn')} path={p('/learn/:game')} element={<Learn />} />,
    <Route key={p('/territory')} path={p('/territory')} element={<TerritoryHub />} />,
    <Route key={p('/territory/play')} path={p('/territory/play')} element={<TerritoryPlay />} />,
    <Route key={p('/territory/new-room')} path={p('/territory/new-room')} element={<TerritoryNewRoom />} />,
    <Route key={p('/territory/room')} path={p('/territory/room/:id')} element={<TerritoryRoomPage />} />,
    <Route key={p('/territory/match')} path={p('/territory/match')} element={<TerritoryMatchPage />} />,
    <Route key={p('/play')} path={p('/play')} element={<Play />} />,
    <Route key={p('/room')} path={p('/room/:id')} element={<Room />} />,
    <Route key={p('/matchmaking')} path={p('/matchmaking')} element={<Matchmaking />} />,
    <Route key={p('/profile')} path={p('/profile')} element={<Profile />} />,
    <Route key={p('/history')} path={p('/history')} element={<History />} />,
    <Route key={p('/history/id')} path={p('/history/:id')} element={<Replay />} />,
    <Route key={p('/leaderboard')} path={p('/leaderboard')} element={<Leaderboard />} />,
    <Route key={p('/settings')} path={p('/settings')} element={<Settings />} />,
    <Route key={p('/about')} path={p('/about')} element={<About />} />,
    <Route key={p('/privacy')} path={p('/privacy')} element={<Privacy />} />,
    <Route key={p('/terms')} path={p('/terms')} element={<Terms />} />,
  ];
}

export function App() {
  return (
    <Layout>
      <Routes>
        {pages('')}
        {pages('/en')}
        <Route path="/en" element={<Home />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
