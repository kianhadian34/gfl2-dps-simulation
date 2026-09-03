import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario } from "./helpers.js";
import { STABILITY_RECOVERY_DELAY } from "../engine/stability.js";

// Confirmed in-game (2026-09-03, research §3.7 / U6):
//   break during turn N  →  stability restored on turn N+2 (exactly 2 turns
//   later), restored to max. The Exposed damage-% (U3) is untouched by this —
//   it remains configOverrides.exposedDamageMult (UNVERIFIED).
//
// Observation via log: ev.exposed is true for hits while the target is broken
// and false after recovery. Qiongjiu basic deals 2 stability damage; active2
// (Guide to Victory) deals normal damage with 0 stability damage, so rotating
// between them lets us watch the window without re-breaking.

test("break during Turn 2 → stability restored on Turn 4 (confirmed in-game)", () => {
  // stability 4: r1 basic 4→2 (no break), r2 basic 2→0 (break), r3 (exposed),
  // r4 restored (active2, 0 stab, unexposed), r5 basic 4→2 (proves full restore).
  const r = simulateScenario(
    scenario({ turns: 5, seed: 7, rotation: ["basic", "basic", "active2", "active2", "basic"], dummy: { stability: 4 } }),
  );
  assert.deepEqual(r.log.map((e) => e.exposed), [false, true, true, false, false]);
});

test("break during Turn 1 → stability restored on Turn 3 (confirmed in-game)", () => {
  // stability 2: r1 basic 2→0 (break), r2 exposed (active2, 0 stab),
  // r3 restored (active2 unexposed — 0 stab cannot re-break).
  const r = simulateScenario(
    scenario({ turns: 3, seed: 7, rotation: ["basic", "active2", "active2"], dummy: { stability: 2 } }),
  );
  assert.deepEqual(r.log.map((e) => e.exposed), [true, true, false]);
});

test("no earlier restoration: the 2-turn delay is exact (confirmed rule)", () => {
  // Turn 2 must still show the window even if the dummy would be reachable —
  // recovery ticks only after 2 full rounds.
  const r = simulateScenario(scenario({ turns: 2, seed: 7, rotation: ["basic", "active2"], dummy: { stability: 2 } }));
  assert.deepEqual(r.log.map((e) => e.exposed), [true, true]);
  const again = simulateScenario(scenario({ turns: 2, seed: 7, rotation: ["basic", "active2"], dummy: { stability: 2 } }));
  assert.equal(JSON.stringify(r.log), JSON.stringify(again.log));
});

test("recovery delay constant is exactly 2 turns", () => {
  assert.equal(STABILITY_RECOVERY_DELAY, 2);
});