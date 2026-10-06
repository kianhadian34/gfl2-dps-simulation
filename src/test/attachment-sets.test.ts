import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTACHMENT_SETS } from "../data/attachment-sets.js";
import type { AttachmentSetEffect } from "../model/types.js";

/**
 * WEAPON ATTACHMENT SETS (2026) — DATA STAGE.
 *
 * The currently CONFIRMED Attachment Sets. Attachment Sets apply to the 3 non-Muzzle slots
 * (Sight / Foregrip / Underbarrel); equipping 3 pieces of the same set activates that set's
 * 3-piece bonus, expressed in the EXISTING additive DMG% vocabulary (`additive_dealt`) — there is
 * NO separate damage-increase bucket. A set may carry multiple additive effects (Close Assault).
 *
 * These tests pin the DATA only. The engine does NOT consume attachment sets yet (no inventory,
 * stat rolls, rarity, generation, or Muzzle set participation — all UNCONFIRMED; see
 * docs/research.md §3.19 / U22). Nothing here touches damage math or any other system.
 */

/** Every effect of a set, flattened. */
const effects = (name: string): AttachmentSetEffect[] => {
  const s = ATTACHMENT_SETS.find((x) => x.name === name);
  assert.ok(s, `set "${name}" exists`);
  return s.bonuses;
};

/** Narrow a set's effects to those carrying a numeric `value` (additive_dealt / damage_reduction /
 *  healing_received / ultimate_effect_boost). */
const valued = (name: string): Array<Extract<AttachmentSetEffect, { value: number }>> =>
  effects(name).filter((b): b is Extract<AttachmentSetEffect, { value: number }> => "value" in b);

test("attachment sets: exactly the 15 confirmed sets, each a 3-piece bonus on the 3 non-Muzzle slots", () => {
  assert.deepEqual(
    ATTACHMENT_SETS.map((s) => s.name),
    [
      "Phase Strike",
      "Freeze Boost",
      "Burn Boost",
      "Hydro Boost",
      "Corrosion Boost",
      "Summon Boost",
      "Physical Boost",
      "Tactical Calculus",
      "Close Assault",
      "Ultimate Pursuit",
      "Double Strategy",
      "Phase Resonance",
      "Emergency Repair",
      "Ally Support",
      "Shielded Recovery",
    ],
    "the 15 confirmed sets, in source order (no extra sets invented)",
  );
  for (const s of ATTACHMENT_SETS) {
    assert.equal(s.pieces, 3, `${s.name}: 3-piece activation`);
    assert.deepEqual(s.slots, ["sight", "foregrip", "underbarrel"], `${s.name}: applies to the non-Muzzle slots only`);
    assert.ok(s.bonuses.length >= 1, `${s.name}: has at least one bonus effect`);
  }
});

test("attachment sets: the 4 element boosts are +20% additive DMG%, gated to their own element", () => {
  const expected: Record<string, "freeze" | "burn" | "hydro" | "corrosion"> = {
    "Freeze Boost": "freeze",
    "Burn Boost": "burn",
    "Hydro Boost": "hydro",
    "Corrosion Boost": "corrosion",
  };
  for (const [name, element] of Object.entries(expected)) {
    const [b] = valued(name);
    assert.equal(b.value, 0.2, `${name}: +20%`);
    assert.deepEqual(b.gates?.element, [element], `${name}: gated to ${element} damage`);
  }
});

test("attachment sets: Phase Strike is +15% additive DMG% on targets with a Phase debuff (gate recorded, engine consumption deferred)", () => {
  const [phase] = valued("Phase Strike");
  assert.equal(phase.value, 0.15, "+15%");
  assert.equal(phase.gates?.targetPhaseDebuff, true, "target-phase-debuff condition recorded");
  assert.equal(phase.gates?.element, undefined, "not an element-of-the-attack gate");
});

// --- Newly added sets (2026) -----------------------------------------------------------------

test("Summon Boost: +20% additive DMG% gated on the physical Summon being on the battlefield (condition recorded, no Summon engine behavior invented)", () => {
  const [b] = valued("Summon Boost");
  assert.equal(b.value, 0.2, "+20%");
  assert.equal(b.gates?.physicalSummonOnBattlefield, true, "physical-Summon-on-battlefield condition recorded");
  // No other gate is implied — the condition is the ONLY gate.
  assert.deepEqual(Object.keys(b.gates ?? {}), ["physicalSummonOnBattlefield"], "only the summon gate is present");
});

test("Physical Boost: +20% additive DMG% gated to Physical damage (phase-less = element null, the existing taxonomy)", () => {
  const [b] = valued("Physical Boost");
  assert.equal(b.value, 0.2, "+20%");
  assert.deepEqual(b.gates?.element, [null], "Physical = phase-less (element null)");
});

test("Tactical Calculus: +25% additive DMG% gated to out-of-turn damage (existing out-of-turn gate semantics)", () => {
  const [b] = valued("Tactical Calculus");
  assert.equal(b.value, 0.25, "+25%");
  assert.equal(b.gates?.outOfTurn, true, "out-of-turn condition recorded");
});

test("Close Assault: unconditional +12% AND an additional +24% melee additive term (both in the ONE DMG% bucket)", () => {
  const bs = valued("Close Assault");
  assert.equal(bs.length, 2, "exactly two additive effects (no separate bucket)");

  const unconditional = bs.filter((b) => b.gates === undefined);
  const melee = bs.filter((b) => b.gates?.ammoType !== undefined);
  assert.equal(unconditional.length, 1, "one unconditional term");
  assert.equal(unconditional[0].value, 0.12, "unconditional +12%");
  assert.equal(melee.length, 1, "one melee-conditional term");
  assert.equal(melee[0].value, 0.24, "melee +24%");
  assert.deepEqual(melee[0].gates?.ammoType, ["melee"], "gated to melee damage (AmmoType dimension)");

  // Melee receives BOTH terms additively → 12% + 24% = 36% in the same bucket.
  const meleeTotal = bs.reduce((a, b) => a + b.value, 0);
  assert.equal(meleeTotal, 0.36, "melee total = 12% + 24% = 36% (additive, one bucket)");
});

// --- Newly added sets (2026, batch 2) ---------------------------------------------------------

test("Ultimate Pursuit: +5% Ultimate damage/healing/shield, +1 stack per Ultimate use, max 4 (stack calculation NOT modeled)", () => {
  const [b] = effects("Ultimate Pursuit");
  assert.equal(b.kind, "ultimate_effect_boost");
  if (b.kind !== "ultimate_effect_boost") throw new Error("unreachable");
  assert.equal(b.value, 0.05, "+5%");
  assert.deepEqual(b.appliesTo, ["damage", "healing", "shield"], "applies to Ultimate damage, healing, and shield effects");
  assert.deepEqual(b.stack, { perUse: 1, max: 4 }, "+1 stack per Ultimate use, maximum 4");
});

test("Double Strategy: two branches — +10% targeted when the target is NOT near Cover, +10% AoE when it IS (Cover detection deferred)", () => {
  const bs = valued("Double Strategy");
  assert.equal(bs.length, 2, "exactly two conditional branches");

  const targeted = bs.find((b) => b.gates?.category === "targeted")!;
  assert.equal(targeted.value, 0.1, "targeted +10%");
  assert.equal(targeted.gates?.targetNearCover, false, "targeted branch requires the target NOT near Cover");

  const aoe = bs.find((b) => b.gates?.category === "aoe")!;
  assert.equal(aoe.value, 0.1, "AoE +10%");
  assert.equal(aoe.gates?.targetNearCover, true, "AoE branch requires the target near Cover");
});

test("Phase Resonance: grants the referenced Phase Boost (1 turn, before the attack) on a phase-weakness exploit, and +10% DMG on two phase weaknesses (count gate deferred)", () => {
  const bs = effects("Phase Resonance");
  assert.equal(bs.length, 2, "two effects");

  const boost = bs.find((b) => b.kind === "grant_status")!;
  if (boost.kind !== "grant_status") throw new Error("unreachable");
  assert.equal(boost.statusName, "Phase Boost", "references the existing Phase Boost mechanic (not defined here)");
  assert.equal(boost.durationRounds, 1, "1 turn");
  assert.equal(boost.target, "self");
  assert.equal(boost.timing, "before_attack", "gained BEFORE the attack");
  assert.equal(boost.gates?.phaseWeaknessCount, 1, "condition: exploits a phase weakness");
  assert.deepEqual(boost.gates?.skillTypes, ["active"], "condition: active skill");

  const dmg = bs.find((b) => b.kind === "additive_dealt")!;
  assert.equal(dmg.value, 0.1, "+10% damage dealt");
  assert.equal(dmg.gates?.phaseWeaknessCount, 2, "condition: exploits TWO phase weaknesses");
  assert.deepEqual(dmg.gates?.skillTypes, ["active"], "condition: active skill");
});

test("Emergency Repair: restores 2 Stability to allies when fully healed, at most once per turn (ally-heal condition deferred)", () => {
  const [b] = effects("Emergency Repair");
  assert.equal(b.kind, "restore_stability");
  if (b.kind !== "restore_stability") throw new Error("unreachable");
  assert.equal(b.amount, 2, "restore 2 Stability Index");
  assert.equal(b.target, "allies");
  assert.equal(b.oncePerTurn, true, "triggers up to once per turn");
  assert.equal(b.gates?.allyFullHeal, true, "trigger: allied unit fully healed by an active skill");
});

test("Ally Support: grants the referenced Area Defense II to allies for 2 turns on a defense skill (defense-skill condition deferred)", () => {
  const [b] = effects("Ally Support");
  assert.equal(b.kind, "grant_status");
  if (b.kind !== "grant_status") throw new Error("unreachable");
  assert.equal(b.statusName, "Area Defense II", "references Area Defense II (definition NOT added here)");
  assert.equal(b.durationRounds, 2, "2 turns");
  assert.equal(b.target, "allies", "applies to allied units");
  assert.equal(b.gates?.defenseSkill, true, "trigger: using a defense skill");
});

test("Shielded Recovery: −15% damage taken AND +15% healing received while the unit has a shield (shield condition deferred; no new DMG bucket)", () => {
  const bs = valued("Shielded Recovery");
  assert.equal(bs.length, 2, "two DISTINCT effects (not one DMG% term)");

  const taken = bs.find((b) => b.kind === "damage_reduction")!;
  assert.equal(taken.value, 0.15, "−15% damage taken");
  assert.equal(taken.gates?.hasShield, true, "condition: unit has a shield-type effect");

  const heal = bs.find((b) => b.kind === "healing_received")!;
  assert.equal(heal.value, 0.15, "+15% healing received");
  assert.equal(heal.gates?.hasShield, true, "condition: unit has a shield-type effect");

  // The two effects are NOT damage-dealt increases — nothing was converted into additive_dealt.
  assert.ok(!bs.some((b) => b.kind === "additive_dealt"), "no effect silently converted into DMG%");
});

test("attachment sets: no muzzle participation, no invented fields, unique ids", () => {
  const ids = ATTACHMENT_SETS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const s of ATTACHMENT_SETS) {
    assert.ok(!s.slots.includes("muzzle" as never), `${s.name}: Muzzle is NOT a set slot (unconfirmed)`);
    assert.deepEqual(Object.keys(s).sort(), ["bonuses", "id", "name", "pieces", "slots"], `${s.name}: exactly the confirmed fields`);
    for (const b of s.bonuses) {
      assert.ok(typeof b.kind === "string" && b.kind.length > 0, `${s.name}: effect has a kind`);
      assert.ok("value" in b || b.kind === "grant_status" || b.kind === "restore_stability", `${s.name}: effect carries its payload`);
    }
  }
});
