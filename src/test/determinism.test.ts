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