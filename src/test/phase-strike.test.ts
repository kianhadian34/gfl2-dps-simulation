import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry, makeAlly } from "./helpers.js";
import { ATTACHMENT_SETS } from "../data/attachment-sets.js";
import { statusMap } from "../data/statuses.js";
import type { CharacterDef, Scenario, SkillDefVariant } from "../model/types.js";

/**
 * PHASE STRIKE (2026) — VALIDATED in-game, IMPLEMENTED.
 *
 * The Phase Strike attachment set (`targetPhaseDebuff: true` → `additive_dealt 0.15`) applies when
 * the TARGET carries an active status whose DEFINITION has a non-null `phase` (the status's Phase
 * attribute). Data-driven: only `overburn` (Burn) is validated with a `phase` attribute; no other
 * status→Phase relationship is populated.
 *
 * In-game evidence reproduced here on controlled fixtures (Qiongjiu ATK 2388 · target DEF 5000 ·
 * Burn weakness ×1.10 · Common Rail 150% Burn · No Cover 1.20):
 *   - control (Burn WEAKNESS but NO Burn debuff) → 1529 (Phase Strike does NOT apply)
 *   - target carries `overburn` → +15% additive (bracket 1.55 with No-Cover 1.20 + DU2 0.20) → 2369 (crit)
 */

const PS = ATTACHMENT_SETS.find((s) => s.name === "Phase Strike")!.id;

/** Controlled Qiongjiu-like Burn attacker: ATK 2388, Common Rail 150% Burn applying Overburn,
 *  No-Cover +20% (+ optional Damage Up II +20%), pinned base, permanent bundle OFF. */
function burnAttacker(opts: { crit?: boolean; damageUpII?: boolean; appliesOverburn?: boolean } = {}): CharacterDef {
  const base = makeAlly("ps_qj", 2388);
  const cr: SkillDefVariant = {
    id: "ps_qj_cr",
    name: "Common Rail",
    type: "active",
    element: "burn",
    multiplier: 1.5,
    stabDamage: 0,
    cooldown: 0,
    confectanceCost: 0,
    ...(opts.appliesOverburn === false ? {} : { appliesStatuses: [{ statusId: "overburn", durationRounds: 2, target: "target" as const }] }),
  };
  const noop: SkillDefVariant = { ...cr, id: "ps_qj_noop", name: "-", multiplier: 0, appliesStatuses: undefined };
  const effects: CharacterDef["passive"]["effects"] = [
    { kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.2, when: "target.noCover" },
  ];
  if (opts.damageUpII) effects.push({ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.2, when: "always" });
  return {
    ...base,
    id: "ps_qj",
    name: "ps_qj",
    base: { ...base.base, atk: 2388, critRate: opts.crit ? 1 : 0, critDmg: 0.2 },
    skills: abilities({ basic: noop, active1: cr, active2: noop, ultimate: noop }),
    passive: { id: "ps_qj_passive", name: "-", effects },
  };
}

/** Run the attacker 2 rounds (t1 applies Overburn; t2 hits with Overburn present) with an optional
 *  active attachment set; returns the two Common Rail events. */
function run(char: CharacterDef, activeSetId?: string, crit = false): { round1: ReturnType<typeof simulateScenario>["log"][number]; round2: ReturnType<typeof simulateScenario>["log"][number] } {
  const scenario: Scenario = {
    version: 1,
    seed: 7,
    turns: 2,
    team: [{ characterId: "ps_qj", applyDispatchStats: false, baseStatOverrides: { atk: 2388, hp: 1000, def: 300, critRate: crit ? 1 : 0, critDmg: 0.2 }, rotation: ["active1"], equippedFixedKeys: [], ...(activeSetId !== undefined ? { activeAttachmentSet: activeSetId } : {}) }],
    dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 0, weaknesses: ["burn"], phase: null, cover: "none" },
  };
  const log = simulateScenario(scenario, customRegistry({ ps_qj: char })).log.filter((e) => e.action === "ps_qj_cr");
  return { round1: log[0], round2: log[1] };
}

// 0. Data: only Overburn carries a Phase attribute -------------------------------------------------

test("phase attribute data: only `overburn` carries a Phase attribute (Burn); no other status is populated", () => {
  const reg = statusMap();
  assert.equal(reg.get("overburn")?.phase, "burn", "Overburn is validated as a Burn (Phase) debuff");
  for (const [id, def] of reg) {
    if (id === "overburn") continue;
    assert.ok(def.phase == null, `${id} must NOT have a phase attribute (unestablished — do not invent)`);
  }
});

// 1. Burn weakness alone does NOT trigger Phase Strike --------------------------------------------

test("Phase Strike does NOT apply from Burn WEAKNESS alone (no Burn debuff) — control stays 1529", () => {
  // Attacker does NOT apply Overburn: the target has Burn WEAKNESS (×1.10) but NO Burn debuff.
  const char = burnAttacker({ appliesOverburn: false });
  const withSet = run(char, PS);
  assert.equal(withSet.round2.bonusBracket, 1.2, "Burn weakness + No-Cover only → 1.20 (Phase Strike NOT applied)");
  assert.equal(withSet.round2.finalDamage, 1529, "control = the no-Phase-Strike result");
});

// 2. An active Burn debuff DOES trigger Phase Strike (+15%) ---------------------------------------

test("Phase Strike applies +15% when the target carries `overburn` (Burn debuff) — round 2 = 1720", () => {
  const char = burnAttacker();
  const none = run(char, undefined);
  const withSet = run(char, PS);
  // Round 1 (Overburn applied this same hit — not yet present at gate time) → no bonus either way.
  assert.equal(withSet.round1.bonusBracket, none.round1.bonusBracket, "round 1: no debuff yet → no Phase Strike");
  // Round 2: Overburn is present → Phase Strike +15% (1.20 No-Cover → 1.35).
  assert.equal(none.round2.bonusBracket, 1.2, "no set: 1.20");
  assert.equal(withSet.round2.bonusBracket, 1.35, "with set: 1.20 + 0.15 = 1.35");
  assert.equal(withSet.round2.finalDamage, 1720, "matches ceil(2388×1.5×(2388/7388)×1.35×1.10)");
});

// 3. Phase Strike +15% is ADDITIVE with No-Cover / Damage Up II → exact in-game 2369 --------------

test("Phase Strike +15% is additive with No-Cover and Damage Up II → exact in-game 2369 (crit)", () => {
  const char = burnAttacker({ crit: true, damageUpII: true });
  const none = run(char, undefined, true);
  const withSet = run(char, PS, true);
  // No set: 0.20 No-Cover + 0.20 DU2 = 1.40 → 2140 (crit).
  assert.equal(none.round2.bonusBracket, 1.4, "no set: 1.40");
  assert.equal(none.round2.finalDamage, 2140, "without Phase Strike");
  // With set: 0.20 + 0.20 + 0.15 = 1.55 → 2369 (crit) — the exact in-game observation.
  assert.equal(withSet.round2.bonusBracket, 1.55, "with set: 1.20 + 0.20 + 0.15 = 1.55 (additive)");
  assert.equal(withSet.round2.finalDamage, 2369, "matches the in-game CRIT observation exactly");
});
