/**
 * Seeded PRNG. The simulation never touches Math.random, so every run is
 * reproducible and the `random` priority rule is genuinely testable.
 */
export interface Rng {
  next: () => number;
}

export const makeRng = (seed: number): Rng => {
  let state = Math.trunc(seed) % 4294967296;
  const next = (): number => {
    state = (state + 0x6d2b79f5) % 4294967296;
    let t = state;
    t = Math.imul(t ^ Math.trunc(t / 32768), t | 1);
    t += Math.imul(t ^ Math.trunc(t / 128), t | 61);
    const out = (t ^ Math.trunc(t / 16384)) % 4294967296;
    return Math.abs(out) / 4294967296;
  };
  return { next };
};
