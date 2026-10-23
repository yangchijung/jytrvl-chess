// Crazy Bumper — the six animal drivers and six cars a child can pick from (all original shapes built from
// spheres, capsules and cylinders). In P1 every car has the same physics; only the look differs.

export type AnimalId = 'bear' | 'rabbit' | 'cat' | 'frog' | 'panda' | 'penguin';
export type CarId = 'lemon' | 'bubblegum' | 'mint' | 'apple' | 'grape' | 'cherry';
export type ShellShape = 'round' | 'bubble' | 'rocket' | 'boxy' | 'teardrop' | 'racer';

export interface AnimalSpec {
  id: AnimalId;
  /** head fur, muzzle / belly, ears (inner), nose */
  fur: string;
  face: string;
  ear: string;
  nose: string;
  ears: 'round' | 'long' | 'pointy' | 'none' | 'panda' | 'tuft';
  /** names for screen readers only (never shown as text) */
  name: { zh: string; en: string };
}

export interface CarSpec {
  id: CarId;
  body: string;
  ring: string;
  /** the trim colour: seat, fins, spoiler */
  trim: string;
  shell: ShellShape;
  fins: 'none' | 'tail' | 'side' | 'spoiler' | 'twin';
  antenna: 'straight' | 'tall' | 'curly';
  name: { zh: string; en: string };
}

export const ANIMALS: readonly AnimalSpec[] = [
  { id: 'bear', fur: '#B9784A', face: '#F1D2A8', ear: '#8A5432', nose: '#3B2618', ears: 'round', name: { zh: '小熊', en: 'Bear' } },
  { id: 'rabbit', fur: '#FFFFFF', face: '#FFE3EC', ear: '#FF9EBB', nose: '#E8507A', ears: 'long', name: { zh: '兔子', en: 'Rabbit' } },
  { id: 'cat', fur: '#FFB04D', face: '#FFF1DC', ear: '#E07B1F', nose: '#E85A70', ears: 'pointy', name: { zh: '貓咪', en: 'Cat' } },
  { id: 'frog', fur: '#5BCB3A', face: '#C9F59A', ear: '#FFFFFF', nose: '#2E7D1F', ears: 'none', name: { zh: '青蛙', en: 'Frog' } },
  { id: 'panda', fur: '#FFFFFF', face: '#FFFFFF', ear: '#262626', nose: '#262626', ears: 'panda', name: { zh: '熊貓', en: 'Panda' } },
  { id: 'penguin', fur: '#2D3A4F', face: '#FFFFFF', ear: '#2D3A4F', nose: '#FF9F1C', ears: 'tuft', name: { zh: '企鵝', en: 'Penguin' } },
];

export const CARS: readonly CarSpec[] = [
  { id: 'lemon', body: '#FFD600', ring: '#FF6D00', trim: '#FFFFFF', shell: 'round', fins: 'none', antenna: 'straight', name: { zh: '檸檬車', en: 'Lemon car' } },
  { id: 'bubblegum', body: '#FF4081', ring: '#FFFFFF', trim: '#FFC1D9', shell: 'bubble', fins: 'twin', antenna: 'curly', name: { zh: '泡泡糖車', en: 'Bubblegum car' } },
  { id: 'mint', body: '#00E5FF', ring: '#1A4E8A', trim: '#FFFFFF', shell: 'rocket', fins: 'tail', antenna: 'tall', name: { zh: '薄荷車', en: 'Mint car' } },
  { id: 'apple', body: '#76FF03', ring: '#1B7F3A', trim: '#FFF59D', shell: 'boxy', fins: 'side', antenna: 'straight', name: { zh: '蘋果車', en: 'Apple car' } },
  { id: 'grape', body: '#B98CFF', ring: '#4A2C8F', trim: '#FFFFFF', shell: 'teardrop', fins: 'side', antenna: 'curly', name: { zh: '葡萄車', en: 'Grape car' } },
  { id: 'cherry', body: '#FF3D3D', ring: '#FFEA00', trim: '#FFFFFF', shell: 'racer', fins: 'spoiler', antenna: 'tall', name: { zh: '櫻桃車', en: 'Cherry car' } },
];

export const DEFAULT_PICK = { animal: 'bear' as AnimalId, car: 'lemon' as CarId };
/** the AI cars use the spec colours (pink, mint, green) first, then whatever the player did not take */
const AI_CAR_ORDER: CarId[] = ['bubblegum', 'mint', 'apple', 'grape', 'cherry', 'lemon'];
const AI_ANIMAL_ORDER: AnimalId[] = ['rabbit', 'cat', 'frog', 'panda', 'penguin', 'bear'];

export const animalById = (id: string): AnimalSpec => ANIMALS.find((a) => a.id === id) ?? ANIMALS[0];
export const carById = (id: string): CarSpec => CARS.find((c) => c.id === id) ?? CARS[0];

/** the four line-ups: the player's pick first, then three AI cars that never repeat the player's car or animal */
export function lineUp(pick: { animal: AnimalId; car: CarId }, bots = 3): { animal: AnimalSpec; car: CarSpec }[] {
  const cars = AI_CAR_ORDER.filter((c) => c !== pick.car);
  const animals = AI_ANIMAL_ORDER.filter((a) => a !== pick.animal);
  const out = [{ animal: animalById(pick.animal), car: carById(pick.car) }];
  for (let i = 0; i < bots; i++) out.push({ animal: animalById(animals[i]), car: carById(cars[i]) });
  return out;
}

const KEY = 'jy-bumper-pick';
/** last choice, so a returning child taps one button and plays (storage may be blocked: then the default) */
export function loadPick(): { animal: AnimalId; car: CarId } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PICK };
    const v = JSON.parse(raw) as { animal?: string; car?: string };
    return { animal: animalById(v.animal ?? '').id, car: carById(v.car ?? '').id };
  } catch {
    return { ...DEFAULT_PICK };
  }
}
export function savePick(p: { animal: AnimalId; car: CarId }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode or blocked storage: the choice lasts for this visit only */
  }
}
