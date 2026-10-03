import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { DummyConfig, Scenario } from "../model/types.js";
import { makeAlly } from "./helpers.js";
import { REGISTRY } from "../data/registry.js";

/**
 * NEURAL HELIX (2026) — focused test.
 *
 * Neural Helix is an independent character stat source (flat ATK/HP/DEF + ATK%/HP%/DEF%), applied
 * via the same permanent-source path as Dispatch/Remolder flats. This guards the specific fix that
 * the character-specific Neural Helix FLAT ATK also feeds the raw-ATK basis used by Pattern
 * Remolder's Blossom top-2 highest-ATK allied selection (not only the final panel).
 */
const dummy: DummyConfig = { id: "d", name: "d", hp: 999999999, defense: 0, stability: 65, weaknesses: [], phase: null, cover: "none" };

/** Qiongjiu owns the buffs that activate Blossom (bulwark 5 / vanguard 9 / sentinel 15). */
const owner: Scenario["team"][number] = {
  characterId: "qiongjiu",
  rotation: ["basic"],
  equippedFixedKeys: [],
  remolderBuffs: {
    remolder_sentinel_attack_boost: 6,
    remolder_sentinel_critical_boost: 3,
    remolder_sentinel_pinpoint_specialization: 6,
    remolder_vanguard_smite_boost: 7,
    remolder_vanguard_onslaught_mastery: 2,
    remolder_bulwark_hp_boost: 5,
  },
};

/** Build the scenario with a controllable Neural Helix flat ATK on allyA. Allies are real-path
 *  members (no fixture flag), so they receive Neural Helix + Dispatch + the universal +12%. */
function run(allyANeuralHelixAtk: number): ReturnType<typeof createState>["units"] {
  const registry = {
    ...REGISTRY,
    getCharacter: (id: string) =>
      id === "allyA"
        ? { ...makeAlly("allyA", 1000), neuralHelixStats: { atk: allyANeuralHelixAtk } }
        : id === "allyB"
          ? makeAlly("allyB", 1200)
          : id === "allyC"
            ? makeAlly("allyC", 1150)
            : REGISTRY.getCharacter(id),
  };
  const team: Scenario["team"] = [
    owner,
    { characterId: "allyA", rotation: ["basic"], equippedFixedKeys: [] },
    { characterId: "allyB", rotation: ["basic"], equippedFixedKeys: [] },
    { characterId: "allyC", rotation: ["basic"], equippedFixedKeys: [] },
  ];
  return createState({ version: 1, seed: 7, turns: 1, team, dummy }, registry, new Set()).units;
}

test("Blossom top-2 allied selection counts Neural Helix flat ATK", () => {
  const withNh = run(400); // allyA raw ATK: 1000 base + 183 support-dispatch + 400 NH = 1583
  const withoutNh = run(0); // allyA raw ATK: 1000 base + 183 support-dispatch = 1183

  assert.ok(withNh[0].remolder!.activeSetBonusIds.includes("qiongjiu_set_blossom"), "Blossom active");

  // WITH allyA's +400 Neural Helix flat ATK counted, allyA enters the top-2 → +15% (global 12% +
  // Blossom 3%); allyC (no NH, lower base) is NOT selected → +12% only.
  assert.equal(withNh[1].panelAtk, 1821, "allyA selected: ceil((1000+183+400) × 1.15)");
  assert.equal(withNh[3].panelAtk, 1493, "allyC NOT selected: ceil((1150+183) × 1.12)");

  // WITHOUT the Neural Helix contribution (control), allyA drops out of the top-2 and allyC enters
  // instead → +15%. The only difference between the runs is allyA's Neural Helix flat ATK.
  assert.equal(withoutNh[1].panelAtk, 1325, "allyA NOT selected: ceil((1000+183) × 1.12)");
  assert.equal(withoutNh[3].panelAtk, 1533, "allyC selected: ceil((1150+183) × 1.15)");
});

test("Debug-authoritative ATK override is not multiplied by Neural Helix % (stays exactly 1500)", () => {
  // Debug mode is the controlled testing harness: an explicitly supplied ATK override is
  // AUTHORITATIVE — Dispatch/Remolder/Neural Helix flat AND Neural Helix % (character +10% AND the
  // universal +12%) must not alter it. Qiongjiu carries neuralHelixStats { atkPct: 0.10 }.
  const st = createState(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], baseStatOverrides: { atk: 1500 }, overridesAuthoritative: true }],
      dummy,
    },
    REGISTRY,
    new Set(),
  );
  assert.equal(st.units[0].panelAtk, 1500, "1500, NOT 1500 × 1.22 = 1830");
});

test("Debug-authoritative override suppresses Neural Helix only for the overridden stat", () => {
  // ATK overridden → authoritative; HP/DEF NOT overridden → Neural Helix still applies to them.
  const st = createState(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], baseStatOverrides: { hp: 3000 }, overridesAuthoritative: true }],
      dummy,
    },
    REGISTRY,
    new Set(),
  );
  assert.equal(st.units[0].hp, 3000, "overridden HP stays exactly 3000 (NH HP% suppressed)");
  assert.equal(st.units[0].panelAtk, 1939, "non-overridden ATK keeps Neural Helix + default affinity Lv5 (panel 1939)");
});

