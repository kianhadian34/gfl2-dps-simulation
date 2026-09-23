import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { applyStatus, multiplicativeTakenMods, tickStatuses } from "../engine/statuses.js";
import { customRegistry, makeAlly, abilities } from "./helpers.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import type { CharacterDef, Scenario } from "../model/types.js";

/**
 * AREA DEFENSE I (Golden Melody Trait outcome #6 — authoritative tooltip, VALIDATED 2026):
 * "While active, damage taken from AoE attacks is reduced by 10%", lasts 1 turn.
 * - Target-side: uses the EXISTING `damage_reduction` pipeline, gated to incoming
 *   `damageCategory === "aoe"` (`whenIncomingCategory: "aoe"`). Targeted damage is
 *   unaffected. No other behavior is invented.
 *
 * In-sim integration mirrors the FK3 Targeted Training pattern: a fixture key's
 * `alliedAttackDefDown` lands the buff on the dummy immediately BEFORE the allied hit
 * resolves, so the very same attack observes (or not, for targeted) the reduction.
 * Oracle: atk 1000 · mult 0.8 · DEF 4000 → baseline ceil(800 × 1000/5000) = 160;
 * with −10% taken → ceil(160 × 0.9) = 144.
 */

const DEF = 4000;
const NO_BUFF = 160;
const WITH_BUFF = 144;

/** Minimal doll: basic-only + full support skeleton; `aoe` toggles damageCategory on the basic. */
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

/** Qiongjiu-clone in Support Mode carrying the TEST-ONLY Area Defense key (alliedAttackDefDown). */
function supportHolder(withKey: boolean): CharacterDef {
  const q = structuredClone(QIONGJIU);
  q.id = "qjfix";
  q.base = { ...q.base, critRate: 0 };
  q.fixedKeys = withKey
    ? [
        {
          id: "fixture_area_defense_key",
          name: "Area Defense I Test Key",
          verified: true,
          battleStartEffects: [],
          alliedAttackDefDown: { statusId: "trait_area_defense_i", durationRounds: 1 },
        },
      ]
    : [];
  return q;
}

function run(opts: { aoe: boolean; withKey: boolean }): ReturnType<typeof simulateScenario> {
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "ally", rotation: ["basic"], equippedFixedKeys: [] },
      { characterId: "qjfix", rotation: ["basic"], equippedFixedKeys: opts.withKey ? ["fixture_area_defense_key"] : [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: DEF, stability: 0, weaknesses: [], phase: null, cover: "none" },
  };
  return simulateScenario(sc, customRegistry({ ally: attacker("ally", opts.aoe), qjfix: supportHolder(opts.withKey) }));
}

const allyHit = (r: ReturnType<typeof simulateScenario>) => r.log.find((e) => e.action === "ally_basic")!;

test("AoE damage: 10% less damage while Area Defense I is active", () => {
  const r = run({ aoe: true, withKey: true });
  const hit = allyHit(r);
  assert.ok(hit.statusesApplied.includes("trait_area_defense_i"), "buff applied before the allied hit");
  assert.equal(hit.finalDamage, WITH_BUFF, "160 × 0.9 → 144 (−10% taken on AoE)");
  assert.equal(hit.reductionMult, 0.9, "reduction chain 0.9 on the AoE hit");
});

test("targeted damage is UNCHANGED even while Area Defense I is active (AoE-only)", () => {
  const r = run({ aoe: false, withKey: true });
  const hit = allyHit(r);
  assert.ok(hit.statusesApplied.includes("trait_area_defense_i"), "buff still applied (key is category-agnostic)");
  assert.equal(hit.finalDamage, NO_BUFF, "targeted hit takes full 160");
  assert.equal(hit.reductionMult, 1, "no reduction on targeted incoming damage");
});

test("no buff: AoE and targeted damage are unchanged (baseline)", () => {
  const aoe = run({ aoe: true, withKey: false });
  const tgt = run({ aoe: false, withKey: false });
  assert.ok(!allyHit(aoe).statusesApplied.includes("trait_area_defense_i"), "no buff without the key");
  assert.equal(allyHit(aoe).finalDamage, NO_BUFF);
  assert.equal(allyHit(tgt).finalDamage, NO_BUFF);
  assert.equal(allyHit(aoe).reductionMult, 1);
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
    customRegistry({ ally: attacker("ally", true) }),
    new Set(),
  );
  const d = st.dummy;
  applyStatus(st, d, { statusId: "trait_area_defense_i", source: "test" });
  const red = multiplicativeTakenMods(d, st.statusRegistry, true).red;
  assert.equal(red, 0.9, "active: ×0.9 damage taken on AoE");
  assert.equal(multiplicativeTakenMods(d, st.statusRegistry, false).red, 1, "targeted incoming: full multiplier");
  tickStatuses(st, d, "ownActionEnd");
  assert.equal(multiplicativeTakenMods(d, st.statusRegistry, true).red, 1, "expired after one action end");
});