// Rush Taxi — the garage remembers the last cab and driver (per browser), so a returning child is two taps from
// driving: mode, then 出發. Storage may be missing or throw (private mode, blocked site data): fall back to defaults.
import { CARS, DRIVERS } from '../vehicle/roster';

export interface GarageChoice {
  car: string;
  driver: string;
}
export const GARAGE_KEY = 'jy.taxi.garage';
export const DEFAULT_CHOICE: GarageChoice = { car: CARS[0].id, driver: DRIVERS[0].id };

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** the saved choice; unknown ids (a cab removed later, a hand-edited value) fall back one by one to the defaults */
export function loadChoice(store: Store | null = defaultStore()): GarageChoice {
  try {
    const raw = store?.getItem(GARAGE_KEY);
    if (!raw) return { ...DEFAULT_CHOICE };
    const v = JSON.parse(raw) as Partial<GarageChoice> | null;
    return {
      car: CARS.some((c) => c.id === v?.car) ? v!.car! : DEFAULT_CHOICE.car,
      driver: DRIVERS.some((d) => d.id === v?.driver) ? v!.driver! : DEFAULT_CHOICE.driver,
    };
  } catch {
    return { ...DEFAULT_CHOICE };
  }
}

export function saveChoice(choice: GarageChoice, store: Store | null = defaultStore()) {
  try {
    store?.setItem(GARAGE_KEY, JSON.stringify({ car: choice.car, driver: choice.driver }));
  } catch {
    /* storage full or blocked: the choice still holds for this visit */
  }
}
