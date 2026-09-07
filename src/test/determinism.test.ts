import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { Rng } from "../engine/rng.js";
import { scenario } from "./helpers.js";

const EXAMPLE = scenario({ turns: 7, seed: 20260903, rotation: ["ultimate", "active1", "active2", "basic"] });

test("same scenario + same seed ⇒ byte-identical log and results (golden determinism)", () => {
  const a = simulateScenario(EXAMPLE);
  const b = simulateScenario(EXAMPLE);
  assert.equal(JSON.stringify(a.log), JSON.stringify(b.log));
  assert.deepEqual(a.totals, b.totals);
  assert.deepEqual(a.warnings, b.warnings);
});

test("state isolation: sequential runs in one process do not contaminate each other (A then B == B alone)", () => {
  const A = scenario({ turns: 3, seed: 5, rotation: ["ultimate", "active1", "basic"], keys: [] });
  const B = scenario({ turns: 4, seed: 99, rotation: ["active2", "basic"], dummy: { stability: 4, weaknesses: ["burn"] } });
  const bSolo = simulateScenario(B);
  const aSolo = simulateScenario(A);
  // Run A first in the SAME process, then B — must be byte-identical to B alone.
  simulateScenario(A);
  const bAfterA = simulateScenario(B);
  assert.equal(JSON.stringify(bAfterA.log), JSON.stringify(bSolo.log));
  assert.deepEqual(bAfterA.totals, bSolo.totals);
  // And the reverse order: B first, then A — identical to A alone.
  simulateScenario(B);
  const aAfterB = simulateScenario(A);
  assert.equal(JSON.stringify(aAfterB.log), JSON.stringify(aSolo.log));
  assert.deepEqual(aAfterB.totals, aSolo.totals);
  // Repeatability: three independent runs of B are all identical.
  const b3 = simulateScenario(B);
  assert.equal(JSON.stringify(b3.log), JSON.stringify(bSolo.log));
});

test("sim-level: different seeds reliably produce divergent crit sequences (RNG through the simulation)", () => {
  // Qiongjiu basic has crit rate 20% — each 7-turn run draws crits per hit.
  // We do NOT depend on any specific outcome: across a batch of seeds at least
  // two distinct 7-bit crit sequences must occur (all-identical across 16 seeds
  // would have probability ≈ 2^-105).
  const critSeq = (seed: number) =>
    JSON.stringify(simulateScenario(scenario({ turns: 7, seed, rotation: ["basic"] })).log.map((e) => !!e.critical));
  const seen = new Set<string>();
  for (let s = 0; s < 16; s++) seen.add(critSeq(s * 1000 + 7));
  assert.ok(seen.size >= 2, `expected divergent crit sequences across seeds, got ${seen.size}`);
});

test("Rng is deterministic per seed and divergent across seeds", () => {
  const a = new Rng(42);
  const b = new Rng(42);
  const c = new Rng(43);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
  assert.notDeepEqual([a.next()], [c.next()]);
});

test("crit draws flow through the seeded RNG (no global randomness)", () => {
  // High number of hits with crit rate 20% — must be the same across identical seeds.
  const a = simulateScenario(EXAMPLE);
  const b = simulateScenario(EXAMPLE);
  const critsA = a.log.filter((e) => e.critical).length;
  const critsB = b.log.filter((e) => e.critical).length;
  assert.equal(critsA, critsB);
});