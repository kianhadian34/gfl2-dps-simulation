import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario } from "./helpers.js";

// Every UNVERIFIED value that affects Qiongjiu's simulation must be changeable
// through scenario config alone — no engine edits (docs/research.md §4 items:
// U1 crit, U3 exposed dmg%, U4 exposed duration, U7 tick point,
// U8 durations, U9 confectance cap/start, U11 cooldown model).

type Over = Parameters<typeof scenario>[0];

test("critMultiplier override (alternative hypothesis) changes crit damage", () => {
  // Confirmed rule is 1 + Crit DMG; the override stays as a test-only alternative.
  const high: Over = { turns: 1, seed: 1, rotation: ["basic"], config: { critMultiplier: 2.0 } };
  const alt: Over = { turns: 1, seed: 1, rotation: ["basic"], config: { critMultiplier: 1.5 } };
  const ev2 = simulateScenario(scenario(high)).log[0];
  const ev15 = simulateScenario(scenario(alt)).log[0];
  assert.equal(ev2.critical, ev15.critical); // same seed → same crit outcome
  if (ev2.critical) {
    assert.ok(ev2.finalDamage > ev15.finalDamage, "crit damage must scale with critMultiplier");
  } else {
    assert.equal(ev2.finalDamage, ev15.finalDamage);
  }
});

test("exposedDurationRounds override changes the broken-window flag timing (U4 testing knob)", () => {
  // stability 4: r1 no break, r2 breaks. Default flag persists through r3
  // (fixed 2-turn rule); an override shortens the flag (recovery still ends it).
  const dflt = simulateScenario(scenario({ turns: 4, seed: 2, dummy: { stability: 4 } }));
  const short = simulateScenario(scenario({ turns: 4, seed: 2, dummy: { stability: 4 }, config: { exposedDurationRounds: 1 } }));
  assert.deepEqual(dflt.log.map((e) => e.exposed), [false, true, true, false]);
  assert.deepEqual(short.log.map((e) => e.exposed), [false, true, false, false]);
});

test("confectanceMax + confectanceStart overrides change ultimate timing (U9)", () => {
  // Cap 2 clamps battle start 3 → 2 → ultimate (cost 3) never affordable → all basic.
  const tiny: Over = { turns: 4, rotation: ["ultimate", "basic"], keys: [], config: { confectanceMax: 2, confectanceStart: 3 } };
  const tinyR = simulateScenario(scenario(tiny));
  assert.ok(tinyR.log.every((e) => e.action === "qiongjiu_basic"));
  const big: Over = { turns: 4, rotation: ["ultimate", "basic"], keys: [], config: { confectanceMax: 10, confectanceStart: 3 } };
  const bigR = simulateScenario(scenario(big));
  assert.equal(bigR.log[0].action, "qiongjiu_pressing_momentum");
});

test("statusOverrides.perStackValue changes damage of that status without engine changes (Support Boost II)", () => {
  const base: Over = { turns: 2, seed: 5, rotation: ["ultimate", "basic"], keys: [], config: { confectanceStart: 6 } };
  const dflt = simulateScenario(scenario(base));
  const boosted = simulateScenario(
    scenario({ ...base, config: { ...base.config, statusOverrides: { support_boost_ii: { perStackValue: 0.2 } } } }),
  );
  assert.ok(boosted.totals.damage > dflt.totals.damage);
  // r2 basic bracket: default 1 + 0.10 (no-cover) + 4×0.10; override 1 + 0.10 + 4×0.20.
  const a = dflt.log.find((e) => e.action === "qiongjiu_basic")!;
  const b = boosted.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(a.bonusBracket - 1.5) < 1e-9, `default bracket ${a.bonusBracket}`);
  assert.ok(Math.abs(b.bonusBracket - 1.9) < 1e-9, `override bracket ${b.bonusBracket}`);
});

test("statusOverrides.durationRounds lengthens the buff window (Support Boost I)", () => {
  const base: Over = { turns: 3, seed: 3, rotation: ["active1", "basic", "basic"], keys: [] };
  const dflt = simulateScenario(scenario(base)); // boost covers r2 only
  const longer = simulateScenario(
    scenario({ ...base, config: { statusOverrides: { support_boost_i: { durationRounds: 3 } } } }),
  );
  assert.ok(longer.totals.damage > dflt.totals.damage);
  const r3d = dflt.log.find((e) => e.round === 3 && e.action === "qiongjiu_basic")!;
  const r3l = longer.log.find((e) => e.round === 3 && e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(r3d.bonusBracket - 1.1) < 1e-9);
  assert.ok(Math.abs(r3l.bonusBracket - 1.15) < 1e-9);
});

test("statusOverrides.tickAt roundEnd expires the buff the same round (U7)", () => {
  const base: Over = { turns: 2, seed: 4, rotation: ["active1", "basic"], keys: [] };
  const ownEnd = simulateScenario(scenario(base));
  const roundEnd = simulateScenario(
    scenario({ ...base, config: { statusOverrides: { support_boost_i: { tickAt: "roundEnd" } } } }),
  );
  const r2a = ownEnd.log.find((e) => e.round === 2)!;
  const r2b = roundEnd.log.find((e) => e.round === 2)!;
  assert.ok(Math.abs(r2a.bonusBracket - 1.15) < 1e-9, `ownActionEnd bracket ${r2a.bonusBracket}`);
  assert.ok(Math.abs(r2b.bonusBracket - 1.1) < 1e-9, `roundEnd bracket ${r2b.bonusBracket}`);
});

test("cooldownModel: confirmed default waits N full turns; the alternative stays selectable (U11)", () => {
  const base: Over = { turns: 3, rotation: ["active1"], keys: [] };
  // Confirmed default ("nextOwnTurnEnd"): CD-1 → cast T1, unavailable T2 (basic fallback), available T3.
  const dflt = simulateScenario(scenario(base));
  const explicit = simulateScenario(scenario({ ...base, config: { cooldownModel: "nextOwnTurnEnd" } }));
  assert.deepEqual(dflt.log.map((e) => e.action), ["qiongjiu_common_rail", "qiongjiu_basic", "qiongjiu_common_rail"]);
  assert.equal(JSON.stringify(dflt.log), JSON.stringify(explicit.log));
  // Alternative hypothesis retains the old behavior when explicitly requested.
  const alt = simulateScenario(scenario({ ...base, config: { cooldownModel: "endOfOwnTurn" } }));
  assert.deepEqual(alt.log.map((e) => e.action), ["qiongjiu_common_rail", "qiongjiu_common_rail", "qiongjiu_common_rail"]);
  // The alternative is flagged as non-confirmed in warnings.
  assert.ok(alt.warnings.some((w) => w.includes("non-confirmed alternative")));
});

test("overridden statuses are flagged as config-overridden in warnings", () => {
  const r = simulateScenario(
    scenario({ turns: 1, rotation: ["active1"], keys: [], config: { statusOverrides: { support_boost_i: { perStackValue: 0.07 } } } }),
  );
  assert.ok(r.warnings.some((w) => w.includes("support_boost_i") && w.includes("config-overridden")));
});