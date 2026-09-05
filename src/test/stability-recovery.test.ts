import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario } from "./helpers.js";
import { STABILITY_RECOVERY_DELAY } from "../engine/stability.js";

// Confirmed in-game (2026-09-03, research §3.7 / U6):
//   break during turn N  →  stability restored on turn N+2 (exactly 2 turns
//   later), restored to max. U3: there is NO universal Exposed damage
//   multiplier (resolved) — the flag is pure state for this window.
//
// Observation via log: ev.exposed is true for hits while the target is broken
// and false after recovery. Qiongjiu basic deals 2 stability damage and the
// ultimate deals 0; active2 (Guide to Victory) deals 0 base stability damage,
// while active1 (Common Rail) has base 3 (validated 2026) — rotating between
// them lets us watch the window without re-breaking. NOTE (U11 confirmed): CD-1
// skills are unavailable on the immediately following turn, so 0-stab
// observation turns must NOT chain two actives back-to-back (the ultimate is a
// 0-stab, cd-0 option for observation turns after recovery).

test("break during Turn 2 → stability restored on Turn 4 (confirmed in-game)", () => {
  // stability 4: r1 basic 4→2 (no break), r2 basic 2→0 (break), r3 exposed
  // (active2, 0 stab), r4 restored + basic 4→2 (unexposed), r5 active2 (unexposed).
  const r = simulateScenario(
    scenario({ turns: 5, seed: 7, rotation: ["basic", "basic", "active2", "basic", "active2"], dummy: { stability: 4 } }),
  );
  // Main actions only — status_tick events (Overburn 2026) carry no exposed flag.
  assert.deepEqual(
    r.log.filter((e) => e.actionType !== "status_tick").map((e) => e.exposed),
    [false, true, true, false, false],
  );
});

test("break during Turn 1 → stability restored on Turn 3 (confirmed in-game)", () => {
  // stability 2: r1 basic 2→0 (break), r2 exposed (active2, 0 stab),
  // r3 ultimate (0 stab, cd 0 — first cast — cannot re-break after recovery).
  const r = simulateScenario(
    scenario({ turns: 3, seed: 7, rotation: ["basic", "active2", "ultimate"], dummy: { stability: 2 } }),
  );
  // Main actions only — status_tick events (Overburn 2026) carry no exposed flag;
  // `?? false`: the ultimate is a non-damaging action (no hit → no exposed flag).
  assert.deepEqual(
    r.log.filter((e) => e.actionType !== "status_tick").map((e) => e.exposed ?? false),
    [true, true, false],
  );
});

test("no earlier restoration: the 2-turn delay is exact (confirmed rule)", () => {
  // Turn 2 must still show the window — recovery ticks only after 2 full rounds.
  const run = () => scenario({ turns: 2, seed: 7, rotation: ["basic", "active2"], dummy: { stability: 2 } });
  const r = simulateScenario(run());
  // Main actions only — status_tick events (Overburn 2026) carry no exposed flag.
  assert.deepEqual(
    r.log.filter((e) => e.actionType !== "status_tick").map((e) => e.exposed ?? false),
    [true, true],
  );
  const again = simulateScenario(run());
  assert.equal(JSON.stringify(r.log), JSON.stringify(again.log));
});

test("recovery delay constant is exactly 2 turns", () => {
  assert.equal(STABILITY_RECOVERY_DELAY, 2);
});