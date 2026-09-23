/**
 * Deterministic seeded RNG (mulberry32). The ONLY randomness source in the
 * engine (docs/architecture.md §4). Same seed ⇒ same sequence ⇒ same simulation.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Uniform [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Probability gate; short-circuits at 0/1 so fixed outcomes never consume the stream. */
  chance(p: number): boolean {
    if (p >= 1) return true;
    if (p <= 0) return false;
    return this.next() < p;
  }

  /**
   * Uniform integer in [0, n). Deterministic: identical seeds => identical values.
   * Used for the uniform 1/N selection rule (weapon Trait, VALIDATED in-game 2026 —
   * equal probability across the N outcomes, no weights/priorities invented).
   */
  nextInt(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.next() * n);
  }
}