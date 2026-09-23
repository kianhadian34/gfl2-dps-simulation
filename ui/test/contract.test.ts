import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScenario, DEFAULT_SETUP, type SetupState } from "../src/shared/setup.js";
import type { ScenarioView } from "../src/shared/engine-types.js";

/**
 * UI ↔ ENGINE SCENARIO CONTRACT (2026 — contract plumbing, no UI controls).
 *
 * The renderer's `ScenarioTeamMemberView` must mirror the engine `ScenarioTeamMember`
 * (src/model/types.ts:739-770) exactly, and `buildScenario` must carry the member-level
 * fields to the engine VERBATIM — no UI-side validation/filtering (the engine is the only
 * validator) and no stale fields (e.g. the removed singular `commonKeyId`).
 */

function setupWith(equipment?: unknown): SetupState {
  return {
    ...DEFAULT_SETUP,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, ...(equipment !== undefined ? { equipment } : {}) } as SetupState["characters"][number]],
    rotations: { qiongjiu: ["basic"] },
  };
}

test("legacy shape: a member with NO equipment produces the exact pre-2026 member object (no new fields)", () => {
  const sc: ScenarioView = buildScenario(setupWith());
  assert.deepEqual(sc.team[0], { characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [] }, "byte-for-byte the legacy member shape");
});

test("equipment is carried VERBATIM into the engine member contract (all member-level fields)", () => {
  const sc: ScenarioView = buildScenario(
    setupWith({
      weaponId: "jinshizou",
      calibrationLevel: 3,
      commonKeyIds: ["qiongjiu_common_strategic_negotiation", "sn_generic_alt"],
      equippedFixedKeys: ["qiongjiu_fk1_concentration", "qiongjiu_fk3_targeted_training"],
      expansionKeyId: "qiongjiu_ruined_gem",
      affinityKeyId: "qiongjiu_warm_as_jade",
      affinityLevel: 5,
    }),
  );
  assert.deepEqual(sc.team[0], {
    characterId: "qiongjiu",
    rotation: ["basic"],
    equippedFixedKeys: ["qiongjiu_fk1_concentration", "qiongjiu_fk3_targeted_training"],
    affinityKeyId: "qiongjiu_warm_as_jade",
    affinityLevel: 5,
    commonKeyIds: ["qiongjiu_common_strategic_negotiation", "sn_generic_alt"],
    weaponId: "jinshizou",
    calibrationLevel: 3,
    expansionKeyId: "qiongjiu_ruined_gem",
  });
});

test("member view field set mirrors the engine ScenarioTeamMember contract exactly (no stale commonKeyId / no drops)", () => {
  const sc: ScenarioView = buildScenario(
    setupWith({
      weaponId: "jinshizou",
      calibrationLevel: 6,
      commonKeyIds: ["a"],
      equippedFixedKeys: [],
      affinityKeyId: "k",
      affinityLevel: 5,
      expansionKeyId: "e",
    }),
  );
  const emitted = Object.keys(sc.team[0]).sort();
  // Canonical engine member surface — src/model/types.ts:739-770 (pinned, not inferred).
  const expected = [
    "affinityKeyId",
    "affinityLevel",
    "calibrationLevel",
    "characterId",
    "commonKeyIds",
    "equippedFixedKeys",
    "expansionKeyId",
    "rotation",
    "weaponId",
  ];
  assert.deepEqual(emitted, expected, "the emitted member carries exactly the engine contract fields — commonKeyId must NOT appear");
});

test("invalid ids pass through the UI layer VERBATIM (no UI-side acceptance/rejection); the ENGINE rejects them", async () => {
  const sim = await import(new URL("../../../dist/simulate.js", import.meta.url).href);
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const engine = (sim as { simulateScenario: (s: unknown, r: unknown) => unknown }).simulateScenario;
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY;

  // 1) The UI emits bogus ids without complaining — the UI layer never validates.
  const bogusWeapon = buildScenario(setupWith({ weaponId: "definitely_not_a_weapon" }));
  assert.equal(bogusWeapon.team[0].weaponId, "definitely_not_a_weapon", "bogus weapon id passed through");
  const fiveKeys = buildScenario(setupWith({ commonKeyIds: ["a", "b", "c", "d", "e"] }));
  assert.deepEqual(fiveKeys.team[0].commonKeyIds, ["a", "b", "c", "d", "e"], "5 common keys passed through");
  const badCal = buildScenario(setupWith({ weaponId: "jinshizou", calibrationLevel: 7 }));
  assert.equal(badCal.team[0].calibrationLevel, 7, "out-of-range calibration passed through");

  // 2) The real engine rejects each one (src/engine/state.ts createState validation).
  assert.throws(() => engine(bogusWeapon as never, REGISTRY), /Unknown weapon: definitely_not_a_weapon/);
  assert.throws(() => engine(fiveKeys as never, REGISTRY), /at most 3 Common Keys/, "5 Common Keys > the 3-slot maximum");
  assert.throws(() => engine(buildScenario(setupWith({ commonKeyIds: ["a"] })) as never, REGISTRY), /Unknown common key: a/, "unknown key id rejected");
  assert.throws(() => engine(badCal as never, REGISTRY), /calibrationLevel/, "calibration 7 rejected by the engine");

  // 3) Valid ids are ACCEPTED by the engine (Golden Melody + C1 + one real common key).
  assert.doesNotThrow(() =>
    engine(
      buildScenario(setupWith({ weaponId: "jinshizou", calibrationLevel: 1, commonKeyIds: ["qiongjiu_common_strategic_negotiation"] })) as never,
      REGISTRY,
    ),
  );
});