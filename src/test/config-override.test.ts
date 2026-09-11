import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario, customRegistry, makeAlly } from "./helpers.js";
import type { ConfigOverrides, Scenario } from "../model/types.js";

// Every UNVERIFIED value that affects Qiongjiu's simulation must be changeable
// through scenario config alone — no engine edits (docs/research.md §4 items:
// U1 crit, U3 exposed dmg%, U4 exposed duration, U7/U8 tick point & durations (RESOLVED — knobs
// remain for alternative testing), U9 confectance cap/start, U11 cooldown model).

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

/** Two-doll scenario (ally first) so Qiongjiu's Support Action fires each round AFTER the ally's hit. */
function qjSupportScenario(rotation: ("basic" | "active1" | "active2" | "ultimate")[], cfg: ConfigOverrides, turns = 2): Scenario {
  return {
    version: 1,
    seed: 5,
    turns,
    team: [
      { characterId: "over_ally", rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: "qiongjiu", rotation, equippedFixedKeys: ["qiongjiu_fk1_concentration"] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: cfg,
  };
}

test("statusOverrides.perStackValue changes damage of that status without engine changes (Support Boost II, support-scoped)", () => {
  // Authoritative (2026): SB II is +30% Support ACTION damage (generic `actions:'support'`),
  // flat magnitude under the RANK-INHERITANCE rule (stacks = activations, not a multiplier).
  // r1: QJ ultimate (SB II ×3…×4 at max); r2: ally basic → QJ support with SB II (+0.30 once).
  const base: ConfigOverrides = { confectanceStart: 6, statusOverrides: { support_boost_ii: { durationRounds: 2 } } };
  const ally = makeAlly("over_ally", 1000);
  const dflt = simulateScenario(qjSupportScenario(["ultimate", "basic"], base), customRegistry({ over_ally: ally }));
  const boosted = simulateScenario(
    qjSupportScenario(["ultimate", "basic"], { ...base, statusOverrides: { support_boost_ii: { durationRounds: 2, perStackValue: 0.45 } } }),
    customRegistry({ over_ally: ally }),
  );
  const supD = dflt.log.find((e) => e.supportAttack && e.round === 2)!;
  const supB = boosted.log.find((e) => e.supportAttack && e.round === 2)!;
  assert.ok(supB.finalDamage > supD.finalDamage);
  // r2 support bracket: default 1 + 0.10 (no-cover) + 0.30 (SB II, flat) = 1.40; perStackValue override 1 + 0.10 + 0.45 = 1.55.
  assert.ok(Math.abs(supD.bonusBracket - 1.4) < 1e-9, `default support bracket ${supD.bonusBracket}`);
  assert.ok(Math.abs(supB.bonusBracket - 1.55) < 1e-9, `override support bracket ${supB.bonusBracket}`);
  // Authoritative scoping: SB II must NOT affect Qiongjiu's normal attack (no-cover only).
  const main = dflt.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(main.bonusBracket - 1.1) < 1e-9, `main bracket ${main.bonusBracket}`);
});

test("SB I is persistent; a finite durationRounds override SHORTENS the window (Support Boost I, support-scoped)", () => {
  // r1: ally basic → support (no SB); QJ Common Rail applies SB I (self, persistent). Default
  // SB I has NO duration — it survives to r2's support (1.25); a durationRounds:1 override
  // (self-tick at the casting action's end) expires it before r2 (1.10).
  const ally = makeAlly("over_ally", 1000);
  const dflt = simulateScenario(
    qjSupportScenario(["active1", "basic", "basic"], {}, 3),
    customRegistry({ over_ally: ally }),
  );
  const shorter = simulateScenario(
    qjSupportScenario(["active1", "basic", "basic"], { statusOverrides: { support_boost_i: { durationRounds: 1 } } }, 3),
    customRegistry({ over_ally: ally }),
  );
  assert.ok(dflt.totals.damage > shorter.totals.damage, "persistent SB I out-damages a 1-round-capped copy");
  const r2d = dflt.log.find((e) => e.supportAttack && e.round === 2)!;
  const r2s = shorter.log.find((e) => e.supportAttack && e.round === 2)!;
  assert.ok(Math.abs(r2d.bonusBracket - 1.25) < 1e-9, `default (persistent) r2 support bracket ${r2d.bonusBracket}`);
  assert.ok(Math.abs(r2s.bonusBracket - 1.1) < 1e-9, `1-round override r2 support bracket ${r2s.bonusBracket}`);
});

test("statusOverrides.tickAt alternative (roundEnd) is honored (U7 knob — default model unchanged)", () => {
  // With the validated rule (buff ticks at the OWNER's action end, including self-applied
  // buffs at the casting action's end), a solo self-caster ticks ownActionEnd statuses once
  // per round; the roundEnd alternative also ticks once per round — identical cadence. The
  // knob stays selectable; we prove the default model is unchanged by comparing explicit runs.
  const ally = makeAlly("over_ally", 1000);
  const base: ConfigOverrides = { statusOverrides: { support_boost_i: { durationRounds: 2 } } };
  const ownEnd = simulateScenario(
    qjSupportScenario(["active1", "basic"], { ...base, statusOverrides: { support_boost_i: { durationRounds: 2, tickAt: "ownActionEnd" } } }),
    customRegistry({ over_ally: ally }),
  );
  const roundEnd = simulateScenario(
    qjSupportScenario(["active1", "basic"], { ...base, statusOverrides: { support_boost_i: { durationRounds: 2, tickAt: "roundEnd" } } }),
    customRegistry({ over_ally: ally }),
  );
  // r1 Common Rail (self SB I, duration 2); r2 support keeps the buff under both models: 1 + 0.10 + 0.15 = 1.25.
  const r2a = ownEnd.log.find((e) => e.supportAttack && e.round === 2)!;
  const r2b = roundEnd.log.find((e) => e.supportAttack && e.round === 2)!;
  assert.ok(Math.abs(r2a.bonusBracket - 1.25) < 1e-9, `ownActionEnd bracket ${r2a.bonusBracket}`);
  assert.ok(Math.abs(r2b.bonusBracket - 1.25) < 1e-9, `roundEnd bracket ${r2b.bonusBracket}`);
  assert.equal(JSON.stringify(ownEnd.log), JSON.stringify(roundEnd.log), "solo self-caster cadence is identical");
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