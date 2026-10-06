import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { customRegistry, TEST_WEAPONS } from "./helpers.js";
import type { AttachmentConfig, DummyConfig, Scenario } from "../model/types.js";

/**
 * P1 FULL-LOADOUT ATTACHMENT VALIDATION (2026) — IN-GAME VALIDATED.
 *
 * In-game setup: Qiongjiu V6 · Affinity Level 5 · a test weapon worth +22 flat ATK · ALL FOUR
 * attachment slots equipped simultaneously:
 *   - Muzzle       Attack +72 · Crit Rate +15% · Crit Damage +15% · Attack Boost +11.4%
 *   - Sight        Attack +72 · Crit Rate +15% · Attack Boost +11.4%
 *   - Foregrip     Attack +72 · Crit Rate +15% · Attack Boost +11.4%
 *   - Underbarrel  Attack +72 · Crit Rate +15% · Attack Boost +11.4%
 * Observed panel: ATK 3182.72 · DEF 1314.88 · HP 4161.92 · Stability 9.00 · Crit Rate 80.00% ·
 * Crit DMG 135.00%.
 *
 * This validates the FULL MULTI-SLOT AGGREGATION path (flat ATK ×4, ATK% ×4, Crit Rate ×4, Crit
 * DMG ×1 folding onto the live permanent Qiongjiu panel) — STRONGER than the earlier single-stat
 * qualitative checks (the ATK flat-vs-% semantic checks).
 *
 * SCOPE (do NOT overclaim): this test equips NO HP / HP% / DEF / DEF% stats, so it does NOT validate
 * those stats. It is a STAT-PANEL validation only; the in-game "Burn Boost [3 items] 3/3" display
 * confirmed the set was equipped/displayed but NO damage was measured — this is NOT a Burn Boost
 * damage validation (that is the separate Burn Boost 2457 test).
 */
const dummy: DummyConfig = { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" };

/** Live Qiongjiu panel (all permanent systems + Affinity Lv.5) + the test +22 flat-ATK weapon. */
function panel(attachments: AttachmentConfig | undefined) {
  const scenario: Scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [
      {
        characterId: "qiongjiu",
        weaponId: TEST_WEAPONS.weapon_flat22_test.id,
        rotation: ["basic"],
        equippedFixedKeys: [],
        ...(attachments !== undefined ? { attachments } : {}),
      },
    ],
    dummy,
  };
  return createState(scenario, customRegistry({}), new Set()).units[0];
}

/** The exact in-game P1 loadout: Attack + Crit Rate + Attack Boost in every slot; Crit DMG Muzzle-only. */
const P1_LOADOUT: AttachmentConfig = {
  muzzle: ["attack", "critRate", "critDamage", "attackBoost"],
  sight: ["attack", "critRate", "attackBoost"],
  foregrip: ["attack", "critRate", "attackBoost"],
  underbarrel: ["attack", "critRate", "attackBoost"],
};

test("P1 full-loadout (IN-GAME 2026): 4 slots → panel ATK ceil(1899 × 1.676) = 3183 (observed 3182.72)", () => {
  const u = panel(P1_LOADOUT);
  // flat ATK = base 802 + weapon 22 + Dispatch 231 + Remolder 245 + Neural Helix 196 + Affinity Lv5 115 = 1611
  //   + attachment flat 72 × 4 = 288 → 1899
  // ATK% = existing 22% (NH 10% + universal 12%) + attachment 11.4% × 4 = 45.6% → 67.6%
  assert.equal(u.panelAtk, Math.ceil(1899 * 1.676), "ceil(1899 × 1.676)");
  assert.equal(u.panelAtk, 3183, "engine integer panel = 3183; in-game DISPLAY = 3182.72 (engine ceils per the existing panel convention)");
});

test("P1 full-loadout: Crit Rate aggregates 15% × 4 slots and Crit DMG +15% (in-game 80.00% / 135.00%)", () => {
  const u = panel(P1_LOADOUT);
  assert.equal(u.critRate, 0.8, "20% existing + 15% × 4 = 80% (displayed 80.00%)");
  assert.equal(u.critDmg, 0.35, "20% existing bonus + 15% → displayed 135.00% (multiplier 1.35)");
});

test("P1 baseline: the same weapon with NO attachments = panel 1966; the 4-slot loadout adds +1217 ATK", () => {
  const base = panel(undefined);
  assert.equal(base.panelAtk, 1966, "ceil((802 + 22 + 231 + 245 + 196 + 115) × 1.22) = 1966 (recorded Qiongjiu ATK baseline)");
  const u = panel(P1_LOADOUT);
  assert.equal(u.panelAtk - base.panelAtk, 1217, "the full 4-slot attachment loadout adds +1217 panel ATK (3183 − 1966)");
});

test("P1 scope: HP / DEF are unchanged — the P1 test equipped NO HP/DEF attachment stats", () => {
  const base = panel(undefined);
  const u = panel(P1_LOADOUT);
  assert.equal(u.hp, base.hp, "HP unchanged (no HP attachment stat equipped → this is NOT a HP/HP% validation)");
  assert.equal(u.defStat, base.defStat, "DEF unchanged (no DEF attachment stat equipped → this is NOT a DEF/DEF% validation)");
});
