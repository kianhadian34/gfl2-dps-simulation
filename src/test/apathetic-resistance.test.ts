import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry } from "./helpers.js";
import { REGISTRY } from "../data/registry.js";
import type { CharacterDef, Scenario, SkillDefVariant } from "../model/types.js";

/**
 * APATHETIC RESISTANCE (2026) — Vector's Searing Finale Lv.3 (V6) self-buff:
 * "Vector gains Apathetic Resistance, lasting for 2 turns."
 * The game's own effect record: "Critical damage is increased by 25%. Considered a Buff,
 * cannot be cleansed."
 *
 * Implemented as a plain `stat_modifier` on `critDmg` (+0.25 flat). That required adding `critDmg`
 * to the stat union; the crit multiplier is the confirmed `1 + Crit DMG` (U1/U19), so the buff
 * enters that same multiplier through the ONE `statModifier` path — no parallel crit path, no new
 * bucket.
 *
 * FIXTURE MATH (deliberately exact): panel ATK 1000, target DEF 0, no cover, no weakness, no
 * bracket modifiers, `critRate: 1` (every attack crits — rate 1 ≤ the 100% cap) ⇒ the chain
 * collapses to `ceil(ATK × critMultiplier)`. Base critDmg 0.2 (the repo convention: 0.2 = the
 * displayed 120%), so:
 *   without the buff → ceil(1000 × 1.20) = 1200
 *   with the buff    → ceil(1000 × 1.45) = 1450
 *
 * TIMING: the buff is SELF-applied by the holder's own action, so the established, in-game-VALIDATED
 * U7 self-applied rule applies — it ticks at the END of the SAME casting action
 * (`docs/research.md` §3.10 / U7; pinned by `status-timing.test.ts`). With `durationRounds: 2` it
 * therefore covers the rest of the casting turn plus the holder's NEXT turn, then expires.
 */

const ATK = 1000;
const BASE_CDMG = 0.2;

/** The fixture doll. `grant` = what the ULTIMATE applies to itself (AR, optionally + Extra Command). */
function fixture(opts: { ar?: boolean; extraCommand?: boolean } = {}): CharacterDef {
  const basic: SkillDefVariant = {
    id: "ar_basic",
    name: "ar_basic",
    type: "basic",
    element: null,
    multiplier: 1.0,
    stabDamage: 0,
    cooldown: 0,
    confectanceCost: 0,
  };
  const ult: SkillDefVariant = {
    id: "ar_ult",
    name: "ar_ult",
    type: "ultimate",
    element: null,
    multiplier: 0, // buff-only (like Vector's own Ultimate being Buff/Debuff-classified)
    stabDamage: 0,
    cooldown: 6, // high, so the granting action happens once
    confectanceCost: 0,
    appliesStatuses: [
      ...(opts.ar ? [{ statusId: "apathetic_resistance", stacks: 1, target: "self" as const }] : []),
      ...(opts.extraCommand ? [{ statusId: "extra_command", stacks: 1, target: "self" as const }] : []),
    ],
  };
  const wrap = (s: SkillDefVariant) => ({ id: s.id, name: s.name, type: s.type, levels: { 1: s } });
  return {
    id: "ar_test",
    name: "Apathetic Test",
    class: "support",
    phase: null,
    base: { atk: ATK, hp: 1000, def: 0, stability: 0, critRate: 1, critDmg: BASE_CDMG },
    skills: { basic: wrap(basic), ultimate: wrap(ult) },
    passive: { id: "ar_passive", name: "-", effects: [] },
    fixedKeys: [],
  };
}

function run(def: CharacterDef, rotation: Scenario["team"][number]["rotation"], turns = 4) {
  const scenario: Scenario = {
    version: 1,
    seed: 1,
    turns,
    team: [{ characterId: "ar_test", rotation, applyDispatchStats: false, equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: {},
  };
  return simulateScenario(scenario, customRegistry({ ar_test: def }));
}

const basics = (r: ReturnType<typeof run>) => r.log.filter((e) => e.action === "ar_basic");

/** CONTROL: without the buff, an always-crit Basic is ceil(1000 × 1.20) = 1200. */
test("control: without the buff the crit multiplier is the base 1 + 0.2", () => {
  const r = run(fixture(), ["basic"], 2);
  assert.deepEqual(r.log.map((e) => e.critMultiplier), [1.2, 1.2]);
  assert.deepEqual(r.log.map((e) => e.finalDamage), [1200, 1200]);
});

/** The buff: +25% Crit DMG ⇒ multiplier 1.45 ⇒ damage ceil(1000 × 1.45) = 1450. */
test("Apathetic Resistance raises the crit multiplier to 1.45 (+25% Crit DMG)", () => {
  const r = run(fixture({ ar: true }), ["ultimate", "basic"], 3);
  const granted = r.log[0];
  assert.equal(granted.action, "ar_ult");
  assert.deepEqual(granted.statusesApplied, ["apathetic_resistance"]);
  const withBuff = basics(r)[0];
  assert.equal(withBuff.critMultiplier, 1.45, "1 + (0.2 base + 0.25 buff)");
  assert.equal(withBuff.finalDamage, 1450, "ceil(1000 × 1.45)");
});

/**
 * Duration: self-applied (U7 rule) ⇒ the buff covers the casting turn's remaining actions AND the
 * holder's next turn, then expires. `durationRounds: 2` ⇒ exactly ONE subsequent unit-turn benefits.
 */
test("the self-applied buff covers the casting turn + the next turn, then expires", () => {
  const r = run(fixture({ ar: true }), ["ultimate", "basic"], 4);
  const b = basics(r);
  assert.equal(b.length, 3, "one Basic in each of rounds 2–4");
  assert.equal(b[0].critMultiplier, 1.45, "round 2: buff active");
  assert.equal(b[1].critMultiplier, 1.2, "round 3: expired (U7 self-applied tick)");
  assert.equal(b[2].critMultiplier, 1.2, "round 4: still expired");
});

/**
 * Vector's ACTUAL V6 flow: the Ultimate grants BOTH Apathetic Resistance and Extra Command, so the
 * extra action in the SAME unit-turn already benefits from the fresh Crit-DMG buff (the end-of-turn
 * tick runs once, after all the unit's actions — see `docs/research.md` §3.24).
 */
test("V6 flow: the Ultimate's extra action benefits from the freshly-granted buff", () => {
  const r = run(fixture({ ar: true, extraCommand: true }), ["ultimate", "basic"], 2);
  assert.deepEqual(r.log.map((e) => e.action), ["ar_ult", "ar_basic", "ar_basic"], "ult + extra action, then round 2");
  assert.equal(r.log[0].round, r.log[1].round, "the extra action is in the SAME round as the ult");
  assert.equal(r.log[1].critMultiplier, 1.45, "the extra action uses the fresh buff");
  assert.equal(r.log[1].finalDamage, 1450);
});

/** The source states "cannot be cleansed" — an explicit immunity, unlike Extra Command. */
test("Apathetic Resistance is not purgeable and is a 2-turn Crit-DMG buff", () => {
  const def = REGISTRY.getStatus("apathetic_resistance")!;
  assert.equal(def.purgeable, false, "source record: 'cannot be cleansed'");
  assert.equal(def.durationRounds, 2);
  assert.equal(def.category, "buff");
  assert.deepEqual(def.effects, [{ kind: "stat_modifier", stat: "critDmg", mode: "flat", value: 0.25 }]);
});

/** The crit path stays ONE path: the buff touches Crit DMG only — never ATK/HP/DEF or Crit Rate. */
test("the buff affects Crit DMG only — ATK and Crit Rate are untouched", () => {
  const r = run(fixture({ ar: true }), ["ultimate", "basic"], 2);
  const withBuff = basics(r)[0];
  assert.equal(withBuff.attackerAtk, ATK, "panel ATK unchanged by a crit-only buff");
  assert.equal(withBuff.critMultiplier, 1.45);
  assert.equal(withBuff.critical, true, "critRate 1 still crits (the 100% cap is unaffected)");
});

/** critDmg stays CONTINUOUS — no integer rounding is applied to a crit stat. */
test("critDmg is continuous: 1 + 0.45 is exactly 1.45, never rounded to an integer stat", () => {
  const r = run(fixture({ ar: true }), ["ultimate", "basic"], 2);
  const withBuff = basics(r)[0];
  assert.equal(withBuff.critMultiplier, 1.45);
  // The rounding rule applies to ATK/HP/DEF only; a fractional Crit DMG must survive intact.
  assert.notEqual(withBuff.critMultiplier, 1);
});
