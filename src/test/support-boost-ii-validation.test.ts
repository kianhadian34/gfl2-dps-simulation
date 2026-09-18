import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { abilities, customRegistry, makeAlly } from "./helpers.js";
import type { ActionSlot, CharacterDef, Scenario } from "../model/types.js";

/**
 * SUPPORT BOOST II — VALIDATED in-game 2026 by a DIRECT controlled combat number (1029).
 *
 * Observed (Qiongjiu): ATK 2000 · Support Action 90% ATK · physical / phase-less Support Action ·
 * No Cover · target DEF 5000 · target Exposed · the target has a Burn weakness, but Burn does NOT
 * apply (a physical/phase-less Support Action exploits no phase weakness). Active modifiers:
 * Damage Up II +20% · No-Cover damage +20% · Support Boost II +30% (Support Action damage) ·
 * Support Boost II +10% (vs Exposed) · Out-of-Turn Damage +10%; target debuff: Vulnerable I
 * +10% Damage Taken. Observed damage = 1029.
 *
 * Math (finalDamage = base × ATK/(ATK+DEF) × (1 + Σ additive) with the usual ceil):
 *   base       = 2000 × 0.90 = 1800
 *   coefficient= 2000 / (2000 + 5000) = 0.285714
 *   post-DEF   = 1800 × 0.285714 = 514.2857
 *   bucket     = 1 + (0.20 + 0.20 + 0.30 + 0.10 + 0.10 + 0.10) = 2.00
 *   damage     = 514.2857 × 2.00 = 1028.5714 → ceil = 1029  (exact match)
 *
 * The engine requires NO change: the existing generic additive DMG% bucket reproduces the
 * observation exactly — there is NO separate SB II multiplier. Exposed contributes ONLY through
 * SB II's own Exposed-gated component (U3: no universal Exposed damage multiplier exists).
 *
 * Harness notes:
 *  - The target's **Vulnerable I is supplied by an independent controller-spawned target debuff**
 *    (a dedicated debuffer ally who applies it on a basic hit) — the observed scenario only
 *    states the debuff exists on the target. It is NOT QJ's ult V4 hook: that hook is scoped to
 *    the Ultimate Lv2 variant, and at V6 the ult resolves Lv3 (V5), so no V4 Vulnerable fires —
 *    consistent with the validated 865 reproduction (the same V6 support bucket WITHOUT a
 *    Vulnerable term: 1.57) and with the current qiongjiu.ts data. No engine change.
 *  - The trigger ally's basic carries stab 3 so it BREAKS the stability-3 dummy, making the
 *    target Exposed for the SECOND support in r1 (the same exposed-target mechanism as the
 *    883/538 SB I evidence). The first support (after the debuffer's hit, target not yet broken)
 *    is the no-Exposed contrast (978), discriminating the +10% component.
 *  - All inputs are test-only mirrors — no engine/data change.
 */

const ALLY = makeAlly("sbii_ally", 1000);

/** The triggering ally whose basic stab 3 breaks the stability-3 dummy (exposed target). */
const BREAKER: CharacterDef = {
  ...ALLY,
  skills: abilities({
    basic: { ...ALLY.skills.basic.levels[1], stabDamage: 3 },
    active1: ALLY.skills.active1.levels[1],
    active2: ALLY.skills.active2.levels[1],
    ultimate: ALLY.skills.ultimate.levels[1],
  }),
};

/** Independent source of the target debuff from the observed scenario (Vulnerable I on the target). */
const DEBUFFER: CharacterDef = {
  ...ALLY,
  id: "sbii_debuff",
  skills: abilities({
    basic: { ...ALLY.skills.basic.levels[1], id: "sbii_debuff_basic", appliesStatuses: [{ statusId: "vulnerable_i", durationRounds: 1, target: "target" }] },
    active1: ALLY.skills.active1.levels[1],
    active2: ALLY.skills.active2.levels[1],
    ultimate: ALLY.skills.ultimate.levels[1],
  }),
};

/** Qiongjiu mirror: panel ATK 2000 (plain weapon, no substats, no keys), non-crit, passive intact. */
function qj(): CharacterDef {
  const q = structuredClone(QIONGJIU);
  q.id = "qjsb2";
  q.base = { ...q.base, atk: 2000, critRate: 0, critDmg: 0 };
  q.weapon = { ...q.weapon, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  return q;
}

/** r1: QJ Ultimate (SB II ×3, persistent) → debuffer applies Vulnerable I → breaker breaks (or not). */
function sb2Scenario(dummyStability: number): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      { characterId: "qjsb2", rotation: ["ultimate"] as ActionSlot[], equippedFixedKeys: [] },
      { characterId: "sbii_debuff", rotation: ["basic"] as ActionSlot[], equippedFixedKeys: [] },
      { characterId: "sbii_ally", rotation: ["basic"] as ActionSlot[], equippedFixedKeys: [] },
    ],
    dummy: {
      id: "training_dummy",
      name: "Training Dummy",
      hp: 999999999,
      defense: 5000,
      stability: dummyStability,
      weaknesses: ["burn"], // the observed target weakness — NOT exploited by the physical support
      phase: null,
      cover: "none",
    },
    configOverrides: { fortificationLevel: 6 }, // V6: No-Cover +20% total, V3 support +10%, ult Lv3 (V5 DU2)
  };
}

const REG = customRegistry({ sbii_ally: BREAKER, sbii_debuff: DEBUFFER, qjsb2: qj() });
const supports = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.supportAttack === true);

test("SB II (validated 1029): +30% Support Action damage + +10% vs Exposed reproduce exactly via the generic additive bucket", () => {
  const r = simulateScenario(sb2Scenario(3), REG); // stability 3 → the breaker's hit breaks it → 2nd support hits an Exposed target
  const sup = supports(r);
  assert.equal(sup.length, 2, "two supports in r1 (debuffer's hit + breaker's hit)");
  const hit = sup[1];
  assert.equal(hit.attackerAtk, 2000, "panel ATK 2000 (plain mirror, no keys, no stat modifiers)");
  assert.ok(
    Math.abs(hit.bonusBracket - 2.0) < 1e-9,
    `bucket 1 + 0.20 No-Cover + 0.20 DU2 + 0.30 SB II + 0.10 SB II-vs-Exposed + 0.10 Out-of-Turn + 0.10 Vulnerable = 2.00 (got ${hit.bonusBracket})`,
  );
  assert.equal(hit.finalDamage, 1029, "ceil(1800 × 2000/7000 × 2.00) = ceil(514.2857 × 2.00) = 1029 — the observed in-game number");
  assert.equal(hit.critical, false, "controlled non-crit run");
  assert.equal(
    (hit.weaknessExploited ?? []).length,
    0,
    "physical/phase-less Support Action exploits NOTHING — the target's Burn weakness does not apply",
  );
});

test("SB II +10% vs Exposed is discriminated: the same run's earlier support (target not yet broken) is 978 (bucket 1.90)", () => {
  const r = simulateScenario(sb2Scenario(3), REG);
  const sup = supports(r)[0]; // fires after the debuffer's hit — Vulnerable ✓ but target not Exposed yet
  assert.ok(
    Math.abs(sup.bonusBracket - 1.9) < 1e-9,
    `1 + 0.20 No-Cover + 0.20 DU2 + 0.30 SB II + 0.10 Out-of-Turn + 0.10 Vulnerable = 1.90 (got ${sup.bonusBracket})`,
  );
  assert.equal(sup.finalDamage, 978, "ceil(514.2857 × 1.90) = 978 ≠ 1029 — the +10% Exposed component is required for the observed 1029");
});

test("SB II: with no Exposed target the observed configuration gives 978 — the +10% vs Exposed is the discriminating term", () => {
  const r = simulateScenario(sb2Scenario(65), REG); // stability 65 → neither ally hit breaks it → never Exposed
  const sup = supports(r);
  assert.equal(sup.length, 2);
  for (const s of sup) {
    assert.ok(Math.abs(s.bonusBracket - 1.9) < 1e-9, `bracket ${s.bonusBracket}`);
    assert.equal(s.finalDamage, 978, "ceil(514.2857 × 1.90)");
  }
});

test("Premise: the dummy's Burn weakness IS exploitable by a Burn (phase) attack — only the physical Support Action fails to exploit it", () => {
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: "qjsb2", rotation: ["active2"] as ActionSlot[], equippedFixedKeys: [] }],
      dummy: {
        id: "training_dummy",
        name: "Training Dummy",
        hp: 999999999,
        defense: 5000,
        stability: 65,
        weaknesses: ["burn"],
        phase: null,
        cover: "none",
      },
      configOverrides: { fortificationLevel: 6 },
    },
    customRegistry({ qjsb2: qj() }),
  );
  const guide = r.log.find((e) => e.action === "qiongjiu_guide_to_victory")!;
  assert.ok(
    (guide.weaknessExploited ?? []).includes("burn"),
    `Guide (Burn, phase) DOES exploit the same dummy's Burn weakness: ${JSON.stringify(guide.weaknessExploited)}`,
  );
});

test("SB II data pin: +30%/+10% one buff instance, persistent, one stack consumed per Support Action, never stack-scaled", () => {
  const def = REGISTRY.getStatus("support_boost_ii")!;
  assert.deepEqual(
    def.effects,
    [
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.3, actions: "support" },
      { kind: "damage_modifier", scope: "dealt", mode: "additive", value: 0.1, actions: "support", whenTarget: "exposed" },
    ],
    "ONE status id with TWO effects (+30% Support Action damage, +10% vs Exposed) — not two multipliers",
  );
  assert.equal(def.durationRounds, null, "persistent — no duration");
  assert.equal(def.consumeOneOnUse, true, "one Support Action consumes exactly ONE stack");
  assert.equal(def.scaleWithStacks, false, "stack count never multiplies the magnitude");
  assert.equal(def.verified, true);
});