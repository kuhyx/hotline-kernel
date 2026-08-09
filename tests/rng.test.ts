import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng.js';

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toStrictEqual(seqB);
  });

  it('differs across seeds', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });

  it('stays inside [0, 1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 500; i += 1) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('truncates fractional seeds', () => {
    expect(makeRng(3.9).next()).toBe(makeRng(3).next());
  });
});
