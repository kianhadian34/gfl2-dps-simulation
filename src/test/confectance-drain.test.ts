import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, PassiveEffect, Scenario } from "../model/types.js";

/**
 * TURN-START CONFECTANCE DRAIN (2026) — Vector's Perception Block clauses 4/5, implemented GENERICALLY.
 *
 * Source: user-provided in-game evidence (2026-10-09), recorded in `docs/dolls/vector.md` §4.5 and
 * `docs/research.md` §3.12. The clauses:
 *   4. At the start of the turn, if Confectance Index is at MAXIMUM, consume ALL of it for +10% ATK
 *      until the end of the round.                                            (Lv.1 — every rank)
 *   5. For each point ABOVE the maximum, further +10%, up to +20%.            (Lv.3 — V5)
 * The user resolved "above the maximum": at V5 the holder owns 2 extra Confectance slots SEPARATE
 * from the normal 6; gains beyond 6 flow into them. The bonuses are ADDITIVE (totals +10/20/30% for
 * 0/1/2 filled extras). `confectanceMax` (U9 = 6) is UNCHANGED — the extras are a separate pool.
 *
 * FIXTURE MATH (deliberately exact): one basic attack (100% ATK, phase-less, no ammo), no weapon, no
 * keys, `applyDispatchStats: false` (panel = base = 1000 ATK), dummy DEF 0 / no cover / no weaknesses /
 * critRate 0 → the damage chain collapses to `ceil(effectiveATK)`. So damage == effective ATK, and the
 * drain's ATK% is directly readable from BOTH `finalDamage` and `log[].attackerAtk`.
 */

const ATK = 1000;

const gain = (amount: number): PassiveEffect => ({ kind: "resource_gain", resource: "confectance", amount, on: "onDamageDealt" });
const drain = (extraSlots?: number): PassiveEffect =>
  extraSlots === undefined
    ? { kind: "turn_start_confectance_drain", atkPct: 0.1 }
    : { kind: "turn_start_confectance_drain", atkPct: 0.1, extraSlots, perExtraSlotAtkPct: 0.1 };

/**
 * Controlled fixture. `levels[1]` = clause 4 only (no extra slots — the mechanic is V5-gated);
 * `levels[3]` = clause 4 + clause 5 (2 extra slots). `fortificationMap` V5 → passive Lv.3.
 */
function fixture(gainAmount: number, opts: { extraSlots?: number; withDrain?: boolean } = {}): CharacterDef {
  const withDrain = opts.withDrain !== false;
  const lv1: PassiveEffect[] = [gain(gainAmount), ...(withDrain ? [drain()] : [])];
  const lv3: PassiveEffect[] = [gain(gainAmount), ...(withDrain ? [drain(opts.extraSlots ?? 2)] : [])];
  return {
    id: "drain_test",
    name: "Drain Test",
    class: "support",
    phase: null,
    base: { atk: ATK, hp: 1000, def: 0, stability: 0, critRate: 0, critDmg: 0 },
    skills: {
      basic: {
        id: "drain_test_basic",
        name: "Hit",
        type: "basic",
        levels: {
          1: { id: "drain_test_basic", name: "Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
        },
      },
    },
    passive: { id: "drain_test_passive", name: "Drain", effects: lv1, levels: { 1: lv1, 3: lv3 } },
    fixedKeys: [],
    fortificationMap: [{ v: 5, ability: "passive", toLevel: 3 }],
  };
}

function run(def: CharacterDef, opts: { confectanceStart?: number; turns?: number } = {}) {
  const scenario: Scenario = {
    version: 1,
    seed: 1,
    turns: opts.turns ?? 3,
    team: [{ characterId: "drain_test", rotation: ["basic"], applyDispatchStats: false, equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: {
      confectanceStart: opts.confectanceStart ?? 6,
      // V5 → the passive resolves to Lv.3 (the extra-slot clause). V0 → Lv.1.
      fortificationLevel: 5,
    },
  };
  return simulateScenario(scenario, customRegistry({ drain_test: def }));
}

/** Sanity anchor: no drain effect at all ⇒ damage is exactly the panel ATK every turn. */
test("control: without the drain effect the panel ATK is unchanged and the gauge just caps", () => {
  const r = run(fixture(10, { withDrain: false }));
  assert.deepEqual(r.log.map((e) => e.finalDamage), [ATK, ATK, ATK]);
  assert.deepEqual(r.log.map((e) => e.confectance?.before), [6, 6, 6]);
  assert.deepEqual(r.log.map((e) => e.confectance?.after), [6, 6, 6]);
});

/** Clause 4: at max ⇒ consume the gauge and grant +10% for the round. */
test("clause 4: an at-max gauge is consumed at turn start for +10% ATK", () => {
  const r = run(fixture(1));
  const t1 = r.log[0];
  assert.equal(t1.confectance?.before, 0, "the at-max gauge was consumed BEFORE the action");
  assert.equal(t1.attackerAtk, 1100, "ceiling(1000 × 1.10)");
  assert.equal(t1.finalDamage, 1100);
});

/** The drain is gated on the gauge being AT MAX — below it, nothing happens. */
test("no drain while the gauge is below the maximum", () => {
  const r = run(fixture(1), { confectanceStart: 3 });
  assert.equal(r.log[0].confectance?.before, 3, "gauge untouched (3 < 6)");
  assert.equal(r.log[0].attackerAtk, ATK);
  assert.equal(r.log[0].finalDamage, ATK);
});

/** Clause 5, additive: 0 / 1 / 2 FILLED extra slots give +10% / +20% / +30%. */
test("clause 5: filled extra slots add +10% each (additive ⇒ +10/+20/+30)", () => {
  // Turn 1 always starts with 0 extras (the gauge is at 6, the pool empty) ⇒ +10%.
  // The attack's Confectance gain overflows into the extra pool; turn 2 then reads it.
  const cases: Array<[gainAmount: number, turn2Atk: number]> = [
    [6, 1100], // exactly refills 6 ⇒ 0 extras ⇒ +10%
    [7, 1200], // 1 point of overflow ⇒ 1 extra ⇒ +20%
    [10, 1300], // 2 points of overflow (capped at 2) ⇒ 2 extras ⇒ +30%
  ];
  for (const [gainAmount, expected] of cases) {
    const r = run(fixture(gainAmount));
    assert.equal(r.log[0].finalDamage, 1100, `gain ${gainAmount}: turn 1 has 0 extras`);
    assert.equal(r.log[1].finalDamage, expected, `gain ${gainAmount}: turn 2 reflects the filled extras`);
    assert.equal(r.log[2].finalDamage, expected, `gain ${gainAmount}: extras persist while the gauge stays full`);
  }
});

/** The extra-slot pool is CAPPED: overflow beyond it is discarded (+30% is the ceiling). */
test("extra slots are capped — overflow beyond the pool is discarded", () => {
  const r = run(fixture(999)); // absurd single-turn gain
  assert.equal(r.log[1].finalDamage, 1300, "+30% is the ceiling");
  assert.equal(r.log[2].finalDamage, 1300);
});

/** The bonus lasts only for the round it was granted in. */
test("the bonus is round-scoped: it is cleared at the next round start", () => {
  // Drain fires on turn 1 (+10%); the turn-2 attack drains nothing (the gauge is empty after it),
  // so that round must fall back to the unmodified panel ATK.
  const r = run(fixture(1), { turns: 2 });
  assert.equal(r.log[0].finalDamage, 1100, "round 1 drained ⇒ +10%");
  assert.equal(r.log[1].finalDamage, ATK, "round 2 has no drain ⇒ no bonus");
});

/**
 * V-RANK GATING: clause 5 + the extra slots belong to Lv.3 (V5). At V0 only clause 4 exists, so the
 * same overflow yields +10% — never +20/+30 — and no extra pool is created.
 */
test("V-rank gating: without Lv.3 there are no extra slots (+10% only)", () => {
  const def = fixture(10);
  const r = simulateScenario(
    {
      version: 1,
      seed: 1,
      turns: 3,
      team: [{ characterId: "drain_test", rotation: ["basic"], applyDispatchStats: false, equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
      configOverrides: { confectanceStart: 6, fortificationLevel: 0 }, // V0 ⇒ passive Lv.1
    },
    customRegistry({ drain_test: def }),
  );
  assert.deepEqual(r.log.map((e) => e.finalDamage), [1100, 1100, 1100], "clause 4 only, every round");
});

/**
 * U9 GUARD: `confectanceMax` is NOT raised. The normal gauge never exceeds 6 — the extra slots are a
 * separate pool, so the gauge figures in the log stay ≤ the configured max even under huge gains.
 */
test("U9 guard: the normal gauge never exceeds confectanceMax (the extras are separate)", () => {
  const r = run(fixture(999));
  for (const e of r.log) {
    assert.ok((e.confectance?.before ?? 0) <= 6, `before=${e.confectance?.before} must be ≤ 6`);
    assert.ok((e.confectance?.after ?? 0) <= 6, `after=${e.confectance?.after} must be ≤ 6`);
  }
  // And the config default still says 6 (the mechanic must not have raised it).
  assert.equal(r.log[0].confectance?.after, 6);
});
