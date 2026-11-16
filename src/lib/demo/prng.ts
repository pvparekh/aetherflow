// Small seeded pseudo-random generator for the demo dataset. Isomorphic and
// dependency-free so the public demo can regenerate the data in the browser.
//
// mulberry32: 32-bit state, fast, and statistically good enough for synthetic
// data. Not for anything security-related.

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks by relative weight. */
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  /** Dollar amount in [min, max], rounded to cents. */
  money(min: number, max: number): number;
  /**
   * Dollar amount skewed towards the low end of [min, max], the shape of
   * most everyday spending (many small baskets, a few large ones).
   */
  skewedMoney(min: number, max: number): number;
  /** Uppercase alphanumeric reference id containing at least one digit. */
  ref(length: number): string;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const cents = (value: number) => Math.round(value * 100) / 100;
  const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items) => {
      const total = items.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [item, weight] of items) {
        roll -= weight;
        if (roll < 0) return item;
      }
      return items[items.length - 1][0];
    },
    money: (min, max) => cents(min + next() * (max - min)),
    skewedMoney: (min, max) => cents(min + (max - min) * next() ** 1.8),
    ref: (length) => {
      let out = "";
      for (let i = 0; i < length; i++) out += REF_CHARS[int(0, REF_CHARS.length - 1)];
      return /\d/.test(out) ? out : `${out.slice(0, -1)}${int(1, 9)}`;
    },
  };
}
