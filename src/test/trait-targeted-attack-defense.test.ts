import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { applyStatus, multiplicativeTakenMods, tickStatuses } from "../engine/statuses.js";
import { customRegistry, makeAlly, abilities } from "./helpers.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import type { CharacterDef, Scenario } from "../model/types.js";

/**
 * TARGETED ATTACK DEFENSE I (Golden Melody Trait outcome #7 — authoritative tooltip,
 * VALIDATED 2026): "While active, damage taken from targeted attacks is reduced by 10%",
 * lasts 1 turn.
 * - Target-side: reuses the generic `damage_reduction` pipeline, gated to incoming
 *   `whenIncomingCategory: "targeted"` (targeted = not AoE, matching the `def_ignore`
 *   aoe:false semantics). AoE incoming damage is unaffected. No other behavior invented.
 * - Area Defense I (the AoE mirror) is unchanged by this generalization.
 *
 * In-sim integration mirrors Area Defense I / FK3: a TEST-ONLY key's `alliedAttackDefDown`
 * lands the buff on the dummy immediately BEFORE the allied hit resolves.
 * Oracle: atk 1000 · mult 0.8 · DEF 4000 → baseline ceil(800 × 1000/5000) = 160;
 * with −10% taken → ceil(160 × 0.9) = 144.
 */

const DEF = 4000;
const NO_BUFF = 160;
const WITH_BUFF = 144;

function attacker(id: string, aoe: boolean): CharacterDef {
  const ally = makeAlly(id, 1000);
  ally.skills.basic = abilities({
    basic: { ...ally.skills.basic.levels[1], multiplier: 0.8, damageCategory: aoe ? "aoe" : undefined },
    active1: ally.skills.active1.levels[1],
    active2: ally.skills.active2.levels[1],
    ultimate: ally.skills.ultimate.levels[1],
  }).basic;
  return ally;
}

/** Qiongjiu-clone in Support Mode carrying the TEST-ONLY Targeted Defense key. */
function supportHolder(withKey: boolean, statusId: string): CharacterDef {
  const q = structuredClone(QIONGJIU);
  q.id = "qjfix";
  q.base = { ...q.base, critRate: 0 };
  q.fixedKeys = withKey
    ? [
        {
          id: "fixture_taken_def_key",
          name: "Taken Defense Test Key",
          verified: true,
          battleStartEffects: [],
          alliedAttackDefDown: { statusId, durationRounds: 1 },
        },
      ]
    : [];
  return q;
}

function run(opts: { aoe: boolean; withKey: boolean; statusId: string }): ReturnType<typeof simulateScenario> {
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "ally", rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: "qjfix", rotation: ["basic"], equippedFixedKeys: opts.withKey ? ["fixture_taken_def_key"] : [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: DEF, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ ally: attacker("ally", opts.aoe), qjfix: supportHolder(opts.withKey, opts.statusId) }));
}

const allyHit = (r: ReturnType<typeof simulateScenario>) => r.log.find((e) => e.action === "ally_basic")!;

test("targeted damage: 10% less while Targeted Attack Defense I is active", () => {
  const r = run({ aoe: false, withKey: true, statusId: "trait_targeted_attack_defense_i" });
  const hit = allyHit(r);
  assert.ok(hit.statusesApplied.includes("trait_targeted_attack_defense_i"), "buff applied before the allied hit");
  assert.equal(hit.finalDamage, WITH_BUFF, "160 × 0.9 → 144 (−10% taken on targeted)");
  assert.equal(hit.reductionMult, 0.9, "reduction chain 0.9 on the targeted hit");
});

test("AoE damage is UNCHANGED while Targeted Attack Defense I is active (targeted-only)", () => {
  const r = run({ aoe: true, withKey: true, statusId: "trait_targeted_attack_defense_i" });
  const hit = allyHit(r);
  assert.ok(hit.statusesApplied.includes("trait_targeted_attack_defense_i"), "buff still applied (key is category-agnostic)");
  assert.equal(hit.finalDamage, NO_BUFF, "AoE hit takes full 160");
  assert.equal(hit.reductionMult, 1, "no reduction on AoE incoming damage");
});

test("no buff: targeted and AoE damage are unchanged (baseline)", () => {
  const tgt = run({ aoe: false, withKey: false, statusId: "trait_targeted_attack_defense_i" });
  const aoe = run({ aoe: true, withKey: false, statusId: "trait_targeted_attack_defense_i" });
  assert.ok(!allyHit(tgt).statusesApplied.includes("trait_targeted_attack_defense_i"));
  assert.equal(allyHit(tgt).finalDamage, NO_BUFF);
  assert.equal(allyHit(aoe).finalDamage, NO_BUFF);
  assert.equal(allyHit(tgt).reductionMult, 1);
});

test("buff expiration after 1 turn (action-end tick removes the reduction)", () => {
  const st = createState(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: "ally", rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: DEF, stability: 0, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ ally: attacker("ally", false) }),
    new Set(),
  );
  const d = st.dummy;
  applyStatus(st, d, { statusId: "trait_targeted_attack_defense_i", source: "test" });
  assert.equal(multiplicativeTakenMods(d, st.statusRegistry, false).red, 0.9, "active: ×0.9 damage taken on targeted");
  assert.equal(multiplicativeTakenMods(d, st.statusRegistry, true).red, 1, "AoE incoming: full multiplier");
  tickStatuses(st, d, "ownActionEnd");
  assert.equal(multiplicativeTakenMods(d, st.statusRegistry, false).red, 1, "expired after one action end");
});

test("Area Defense I remains unchanged (AoE mirror still works; never applies to targeted)", () => {
  const aoeReduced = run({ aoe: true, withKey: true, statusId: "trait_area_defense_i" });
  assert.ok(allyHit(aoeReduced).statusesApplied.includes("trait_area_defense_i"));
  assert.equal(allyHit(aoeReduced).finalDamage, WITH_BUFF, "Area Defense I: AoE still 144");
  assert.equal(allyHit(aoeReduced).reductionMult, 0.9);
  const tgtUntouched = run({ aoe: false, withKey: true, statusId: "trait_area_defense_i" });
  assert.equal(allyHit(tgtUntouched).finalDamage, NO_BUFF, "Area Defense I: targeted still 160");
  assert.equal(allyHit(tgtUntouched).reductionMult, 1);
});