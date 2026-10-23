// Rush Taxi — stage 2 places on the grey-box ground: where passengers wait (on the roads and in the plaza) and the
// named destinations. Roads run along x or z = ±30, ±90, ±150; the plaza is the open middle. Stage 3 replaces this
// with the city's landmark JSON (30+ original destinations with signs).
import type { Place, Spot } from './rules';

export const STOPS: Spot[] = [
  [12, -30],
  [-25, -40],
  [-60, 5],
  [55, 25],
  [5, 60],
  [-70, 70],
  [90, -30],
  [-90, 30],
  [30, 150],
  [-30, -150],
  [150, -30],
  [-150, 30],
  [90, 120],
  [-90, -90],
  [150, 150],
  [60, -150],
].map(([x, z], i) => ({ id: `s${i}`, x, z }));

const P = (id: string, zh: string, en: string, x: number, z: number): Place => ({ id, name: { zh, en }, x, z });
export const PLACES: Place[] = [
  P('station', '火車站', 'Train Station', 0, -150),
  P('seafood', '海鮮市場', 'Seafood Market', -150, -60),
  P('wheel', '摩天輪', 'Ferris Wheel', 150, 60),
  P('ballpark', '棒球場', 'Ballpark', -90, 150),
  P('observatory', '天文台', 'Observatory', 30, -42),
  P('ramen', '拉麵店', 'Ramen Shop', 90, -120),
  P('aquarium', '水族館', 'Aquarium', -150, 120),
  P('museum', '美術館', 'Art Museum', 150, -90),
  P('university', '大學', 'University', -90, -150),
  P('beach', '海灘', 'Beach', 120, 150),
];
