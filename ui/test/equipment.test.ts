import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScenario,
  DEFAULT_SETUP,
  equipmentErrors,
  equipmentEngaged,
  equipmentOf,
  MAX_FIXED_KEYS,
  MAX_COMMON_KEYS_UI,
  MAX_EXPANSION_KEYS,
  setAffinityKey,
  setAffinityLevel,
  setCalibration,
  setExpansionKey,
  setWeapon,
  setCommonKeyAt,
  toggleCommonKey,
  toggleFixedKey,
  type SetupState,
} from "../src/shared/setup.js";
import { buildWeaponViews, buildCharacterMetaView, fixedKeyLabel, fixedKeyNumber } from "../src/shared/lists.js";
import type { ScenarioView } from "../src/shared/engine-types.js";

/**
 * DOLL EQUIPMENT SETUP UI — DATA-LAYER TESTS (2026).
 * The React control layer is a thin shell over the pure helpers in setup.ts; these tests
 * pin the behaviours the UI must deliver: 0–3 caps, exactly-1 weapon/affinity once engaged,
 * engine-sourced calibration options (Golden Melody C1–C6), single `expansionKeyId`, and
 * verbatim carry-through into the engine scenario. The engine remains the final validator.
 */

function setupWith(charOverrides: Record<string, unknown> = {}): SetupState {
  return {
    ...DEFAULT_SETUP,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, ...charOverrides }],
    rotations: { qiongjiu: ["basic"] },
  };
}

/** The built engine member for a setup (carry-through assertions). */
function scenarioMember(s: SetupState): Record<string, unknown> {
  return buildScenario(s).team[0] as unknown as Record<string, unknown>;
}

const FK_CONCENTRATION = "qiongjiu_fk1_concentration";
const FK_STEADINESS = "qiongjiu_fk6_steadiness";
const KEY_SN = "qiongjiu_common_strategic_negotiation";
const EXP_RUINED_GEM = "qiongjiu_exp_ruined_gem";
const AFF_WARM_AS_JADE = "qiongjiu_affinity_warm_as_jade";

// ---------------------------------------------------------------------------
// FIXED KEYS (0–3)
// ---------------------------------------------------------------------------

test("equipment: 0 Fixed Keys is valid (toggle on then off)", () => {
  let s = setupWith();
  assert.equal(equipmentErrors(s).length, 0, "nothing engaged → no errors");
  s = toggleFixedKey(s, "qiongjiu", FK_CONCENTRATION);
  assert.deepEqual(equipmentOf(s.characters[0]).equippedFixedKeys, [FK_CONCENTRATION]);
  // Engaging the doll now requires weapon + affinity locally (see "engaged" tests below);
  // fixed-key count itself stays within 0–3.
  assert.ok((equipmentOf(s.characters[0]).equippedFixedKeys?.length ?? 0) <= MAX_FIXED_KEYS);
  s = toggleFixedKey(s, "qiongjiu", FK_CONCENTRATION);
  assert.deepEqual(equipmentOf(s.characters[0]).equippedFixedKeys, [], "0 selected again");
});

test("equipment: up to 3 Fixed Keys can be selected", () => {
  let s = setupWith();
  for (const id of [FK_CONCENTRATION, "qiongjiu_fk2_efficient_planning", "qiongjiu_fk3_targeted_training", FK_STEADINESS]) {
    s = toggleFixedKey(s, "qiongjiu", id);
  }
  // The 4th toggle was a NO-OP at the cap: exactly the first 3 remain.
  assert.deepEqual(equipmentOf(s.characters[0]).equippedFixedKeys, [
    FK_CONCENTRATION,
    "qiongjiu_fk2_efficient_planning",
    "qiongjiu_fk3_targeted_training",
  ]);
});

test("equipment: a 4th Fixed Key cannot be selected (cap is a UI no-op, never a silent eviction)", () => {
  let s = setupWith();
  for (const id of ["a", "b", "c", "d"]) s = toggleFixedKey(s, "qiongjiu", id);
  assert.equal(equipmentOf(s.characters[0]).equippedFixedKeys!.length, 3);
  assert.ok(!(equipmentOf(s.characters[0]).equippedFixedKeys!.includes("d")));
});

// ---------------------------------------------------------------------------
// WEAPON + CALIBRATION
// ---------------------------------------------------------------------------

test("equipment: weapon selection populates weaponId (and clears with 'no weapon')", () => {
  let s = setupWith();
  s = setWeapon(s, "qiongjiu", "jinshizou", [1, 2, 3, 4, 5, 6]);
  assert.equal(equipmentOf(s.characters[0]).weaponId, "jinshizou");
  const sc: ScenarioView = buildScenario(s);
  assert.equal(sc.team[0].weaponId, "jinshizou", "weaponId reaches the engine contract");
  s = setWeapon(s, "qiongjiu", undefined, []);
  assert.equal(equipmentOf(s.characters[0]).weaponId, undefined);
});

test("equipment: Golden Melody exposes calibration levels C1–C6 (engine-sourced)", async () => {
  const w = await import(new URL("../../../dist/data/weapons.js", import.meta.url).href);
  const views = buildWeaponViews((w as { WEAPONS: unknown[] }).WEAPONS as Parameters<typeof buildWeaponViews>[0]);
  const gm = views.find((v) => v.id === "jinshizou")!;
  assert.deepEqual(gm.calibrations, [1, 2, 3, 4, 5, 6], "the calibration <select> options come from the engine-sourced weapon view");
  // A weapon without calibrations exposes an empty list (the UI shows no calibration control — no crash).
  const noCal = buildWeaponViews([{ id: "plain", name: "Plain", rarity: "rare", atkLvl60: 100 }])[0];
  assert.deepEqual(noCal.calibrations, []);
});

test("equipment: calibration selection populates calibrationLevel; cleared when the weapon changes", () => {
  let s = setupWith();
  s = setWeapon(s, "qiongjiu", "jinshizou", [1, 2, 3, 4, 5, 6]);
  s = setCalibration(s, "qiongjiu", 3);
  const sc: ScenarioView = buildScenario(s);
  assert.equal(sc.team[0].calibrationLevel, 3, "calibrationLevel reaches the engine contract");
  // Switching to a weapon without that calibration clears it (never keeps an invalid value silently).
  s = setWeapon(s, "qiongjiu", "other_weapon", [4, 5, 6]);
  assert.equal(equipmentOf(s.characters[0]).calibrationLevel, undefined);
});

// ---------------------------------------------------------------------------
// COMMON KEYS (0–3, engine 3-slot maximum)
// ---------------------------------------------------------------------------

test("equipment: affinity level is stored and carried verbatim into the scenario; clearing the key clears it", () => {
  let s = setupWith();
  s = setAffinityKey(s, "qiongjiu", "qiongjiu_affinity_warm_as_jade");
  s = setAffinityLevel(s, "qiongjiu", 9);
  assert.equal(equipmentOf(s.characters[0]).affinityLevel, 9);
  let sc: ScenarioView = buildScenario(s);
  assert.equal(sc.team[0].affinityLevel, 9, "engine contract carries affinityLevel verbatim");
  s = setAffinityLevel(s, "qiongjiu", undefined);
  assert.equal(equipmentOf(s.characters[0]).affinityLevel, undefined, "level can be cleared");
  s = setAffinityLevel(s, "qiongjiu", 5);
  s = setAffinityKey(s, "qiongjiu", undefined);
  assert.equal(equipmentOf(s.characters[0]).affinityKeyId, undefined);
  assert.equal(equipmentOf(s.characters[0]).affinityLevel, undefined, "clearing the key clears the level");
});

test("equipment: 0 Common Keys is valid", () => {
  const sc: ScenarioView = buildScenario(setupWith());
  assert.equal(sc.team[0].commonKeyIds, undefined, "no commonKeyIds emitted for an unconfigured doll");
});

test("equipment: up to 3 Common Keys can be selected; a 4th is a no-op", () => {
  let s = setupWith();
  for (const id of ["ck1", "ck2", "ck3"]) s = toggleCommonKey(s, "qiongjiu", id, 3);
  assert.deepEqual(equipmentOf(s.characters[0]).commonKeyIds, ["ck1", "ck2", "ck3"]);
  s = toggleCommonKey(s, "qiongjiu", "ck4", 3);
  assert.deepEqual(equipmentOf(s.characters[0]).commonKeyIds, ["ck1", "ck2", "ck3"], "4th Common Key rejected");
  assert.ok(equipmentOf(s.characters[0]).commonKeyIds!.length <= MAX_COMMON_KEYS_UI);
});

test("equipment: setCommonKeyAt fills the chosen empty slot and keeps the counter at its index", () => {
  let s = setupWith();
  s = setCommonKeyAt(s, "qiongjiu", 0, "ck1", 3);
  s = setCommonKeyAt(s, "qiongjiu", 1, "ck2", 3);
  assert.deepEqual(equipmentOf(s.characters[0]).commonKeyIds, ["ck1", "ck2"], "2/3 after filling slots 0 and 1");
  s = setCommonKeyAt(s, "qiongjiu", 2, "ck3", 3);
  assert.deepEqual(equipmentOf(s.characters[0]).commonKeyIds, ["ck1", "ck2", "ck3"], "3/3 after filling slot 2");
  const sc: ScenarioView = buildScenario(s);
  assert.deepEqual(sc.team[0].commonKeyIds, ["ck1", "ck2", "ck3"], "carried verbatim into the engine scenario");
});

test("equipment: setCommonKeyAt replaces in place (change) and keeps the 3-key cap", () => {
  let s = setupWith();
  s = setCommonKeyAt(s, "qiongjiu", 0, "ck1", 3);
  s = setCommonKeyAt(s, "qiongjiu", 1, "ck2", 3);
  // change slot 1 with ck3 (new key)
  s = setCommonKeyAt(s, "qiongjiu", 1, "ck3", 3);
  assert.deepEqual(equipmentOf(s.characters[0]).commonKeyIds, ["ck1", "ck3"], "slot 1 replaced with ck3");
  // changing the full slot 2 to a new key keeps exactly 3 keys (never 4)
  s = setCommonKeyAt(s, "qiongjiu", 2, "ck4", 3);
  assert.deepEqual(equipmentOf(s.characters[0]).commonKeyIds, ["ck1", "ck3", "ck4"], "slot-2 change stays within the 3-key cap");
  assert.ok(equipmentOf(s.characters[0]).commonKeyIds!.length <= MAX_COMMON_KEYS_UI);
});

test("equipment: setCommonKeyAt(undefined) removes the slot's key and shifts later keys left", () => {
  let s = setupWith();
  s = setCommonKeyAt(s, "qiongjiu", 0, "ck1", 3);
  s = setCommonKeyAt(s, "qiongjiu", 1, "ck2", 3);
  s = setCommonKeyAt(s, "qiongjiu", 0, undefined, 3);
  assert.deepEqual(equipmentOf(s.characters[0]).commonKeyIds, ["ck2"], "removed slot 0, ck2 shifted to slot 0 (1/3)");
  s = setCommonKeyAt(s, "qiongjiu", 0, undefined, 3);
  assert.equal(equipmentOf(s.characters[0]).commonKeyIds!.length, 0, "0/3 after removing the last key");
  // out-of-range slot is a no-op
  const before = equipmentOf(s.characters[0]).commonKeyIds;
  s = setCommonKeyAt(s, "qiongjiu", 5, "ck1", 3);
  assert.equal(equipmentOf(s.characters[0]).commonKeyIds, before, "out-of-range slot rejected");
});

// ---------------------------------------------------------------------------
// AFFINITY KEY (exactly 1) + EXPANSION KEY (engine single slot)
// ---------------------------------------------------------------------------

test("equipment: affinity selection populates affinityKeyId (engine field)", () => {
  const s = setAffinityKey(setupWith(), "qiongjiu", AFF_WARM_AS_JADE);
  assert.equal(scenarioMember(s).affinityKeyId, AFF_WARM_AS_JADE);
  assert.equal(equipmentOf(s.characters[0]).affinityKeyId, AFF_WARM_AS_JADE);
  // affinityLevel is NOT used as a replacement — it stays untouched by the selector.
  assert.equal(equipmentOf(s.characters[0]).affinityLevel, undefined);
});

test("equipment: expansion key matches the ENGINE contract — a SINGLE `expansionKeyId` (0–1)", () => {
  assert.equal(MAX_EXPANSION_KEYS, 1, "the engine represents exactly one expansion-key slot per member");
  const s = setExpansionKey(setupWith(), "qiongjiu", EXP_RUINED_GEM);
  assert.equal(scenarioMember(s).expansionKeyId, EXP_RUINED_GEM, "single-field representation preserved");
  // Setting a different expansion REPLACES the single slot (there is no second slot to add).
  const s2 = setExpansionKey(s, "qiongjiu", "another_expansion_key");
  assert.deepEqual(Object.keys(scenarioMember(s2)), ["characterId", "rotation", "equippedFixedKeys", "expansionKeyId"], "exactly the single expansion field exists");
  assert.equal(scenarioMember(s2).expansionKeyId, "another_expansion_key");
});

// ---------------------------------------------------------------------------
// LOCAL VALIDATION (UI-only; engine remains authoritative)
// ---------------------------------------------------------------------------

test("equipment: legacy (no equipment) stays valid — weapon/affinity are NOT force-required", () => {
  assert.equal(equipmentEngaged(setupWith().characters[0]), false);
  assert.deepEqual(equipmentErrors(setupWith()), [], "unconfigured doll runs exactly as before");
});

test("equipment: engaged-but-incomplete configurations are flagged locally (no weapon / no affinity / bad calibration)", () => {
  const noWeapon = { ...setupWith(), characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, equipment: { commonKeyIds: ["ck1"] } }] };
  assert.ok(equipmentErrors(noWeapon).some((e) => /select a Weapon/.test(e)), "engaged without weapon → local error");
  const noAffinity = { ...setupWith(), characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, equipment: { weaponId: "jinshizou" } }] };
  assert.ok(equipmentErrors(noAffinity).some((e) => /Affinity Key/.test(e)), "engaged without affinity → local error");
  const badCal = { ...setupWith(), characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, equipment: { weaponId: "jinshizou", affinityKeyId: AFF_WARM_AS_JADE, calibrationLevel: 7 } }] };
  assert.ok(equipmentErrors(badCal).some((e) => /C1–C6/.test(e)), "out-of-range calibration → local error");
});

// ---------------------------------------------------------------------------
// SCENARIO CARRY-THROUGH + REAL-ENGINE ACCEPTANCE
// ---------------------------------------------------------------------------

test("equipment: the final scenario passed to run() contains EXACTLY the selected equipment fields", () => {
  const s: SetupState = {
    ...setupWith(),
    characters: [
      {
        id: "qiongjiu",
        name: "Qiongjiu",
        selected: true,
        equipment: {
          weaponId: "jinshizou",
          calibrationLevel: 6,
          commonKeyIds: [KEY_SN],
          equippedFixedKeys: [FK_CONCENTRATION, FK_STEADINESS],
          expansionKeyId: EXP_RUINED_GEM,
          affinityKeyId: AFF_WARM_AS_JADE,
          affinityLevel: 5,
        },
      },
    ],
  };
  assert.deepEqual(scenarioMember(s), {
    characterId: "qiongjiu",
    rotation: ["basic"],
    equippedFixedKeys: [FK_CONCENTRATION, FK_STEADINESS],
    affinityKeyId: AFF_WARM_AS_JADE,
    affinityLevel: 5,
    commonKeyIds: [KEY_SN],
    weaponId: "jinshizou",
    calibrationLevel: 6,
    expansionKeyId: EXP_RUINED_GEM,
  });
});

test("equipment: a fully-configured doll is ACCEPTED by the real engine (weapon provenance in the log)", async () => {
  const sim = await import(new URL("../../../dist/simulate.js", import.meta.url).href);
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const engine = (sim as { simulateScenario: (s: unknown, r: unknown) => { log: Array<{ actionType?: string; effectSources?: string[] }> } }).simulateScenario;
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY;
  const setup = {
    ...setupWith(),
    characters: [
      {
        id: "qiongjiu",
        name: "Qiongjiu",
        selected: true,
        equipment: { weaponId: "jinshizou", calibrationLevel: 1, commonKeyIds: [KEY_SN], equippedFixedKeys: [FK_CONCENTRATION], affinityKeyId: AFF_WARM_AS_JADE },
      },
    ],
  };
  const sc = buildScenario(setup);
  const r = engine(sc as never, REGISTRY);
  assert.ok(r.log.length >= 1, "engine accepted the fully-configured doll");
  const basic = r.log.find((e) => e.actionType === "basic");
  assert.ok((basic?.effectSources ?? []).some((s) => /Golden Melody|Jinshizou/i.test(s)), "weapon Effect provenance reaches the log");
  // The same setup passes the UI-local validation (complete equipment).
  assert.deepEqual(equipmentErrors(setup as SetupState), []);
});

// ---------------------------------------------------------------------------
// FIXED KEY PRESENTATION (2026) — "Fixed Key <N> - <Name>" + authoritative tooltip.
// Numbers + descriptions come ONLY from the engine data (id `fk<N>` + `KeyDef.description`);
// the renderer never hardcodes numbers or invents descriptions.
// ---------------------------------------------------------------------------

test("presentation: the authoritative key number is derived from the engine id, not hardcoded", () => {
  assert.equal(fixedKeyNumber("qiongjiu_fk1_concentration"), 1);
  assert.equal(fixedKeyNumber("qiongjiu_fk6_steadiness"), 6);
  assert.equal(fixedKeyNumber("a_key_without_number"), undefined, "no number → undefined (label falls back to the plain name)");
});

test("presentation: the option label is 'Fixed Key <N> - <Name>' — English names only", () => {
  assert.equal(fixedKeyLabel({ id: "qiongjiu_fk1_concentration", name: "Concentration", number: 1 }), "Fixed Key 1 - Concentration");
  assert.equal(fixedKeyLabel({ id: "qiongjiu_fk2_efficient_planning", name: "Efficient Planning" }), "Fixed Key 2 - Efficient Planning", "number derived when the view omits it");
  assert.equal(fixedKeyLabel({ id: "other", name: "Something" }), "Something", "no number → plain name, no invented prefix");
});

test("presentation: the view carries the authoritative player-facing description (tooltip source)", () => {
  const view = buildCharacterMetaView({
    id: "q",
    name: "Q",
    fixedKeys: [{ id: "qiongjiu_fk2_efficient_planning", name: "Efficient Planning", description: "Before a Support Action, cleanses 1 buff from the target." }],
  });
  assert.deepEqual(view.fixedKeys, [
    { id: "qiongjiu_fk2_efficient_planning", name: "Efficient Planning", number: 2, description: "Before a Support Action, cleanses 1 buff from the target." },
  ]);
});

test("presentation e2e: ALL currently available Fixed Keys are represented with number + name + description from the engine registry", async () => {
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY as {
    getCharacter: (id: string) => { fixedKeys: Array<{ id: string; name: string; description?: string }> } | undefined;
  };
  const def = REGISTRY.getCharacter("qiongjiu")!;
  const view = buildCharacterMetaView({ id: "qiongjiu", name: "Qiongjiu", fixedKeys: def.fixedKeys });
  assert.equal(view.fixedKeys!.length, def.fixedKeys.length, "every engine Fixed Key is represented");
  const ids = view.fixedKeys!.map((k) => k.id);
  assert.deepEqual(ids, [
    "qiongjiu_fk1_concentration",
    "qiongjiu_fk2_efficient_planning",
    "qiongjiu_fk3_targeted_training",
    "qiongjiu_fk4_point_of_vulnerability",
    "qiongjiu_fk5_necessary_adjustments",
    "qiongjiu_fk6_steadiness",
  ]);
  for (const k of view.fixedKeys!) {
    assert.equal(k.number, Number(/fk(\d+)/.exec(k.id)![1]), `number for ${k.id} matches the engine id`);
    assert.ok(k.name.length > 0);
    assert.ok(k.description !== undefined && k.description.length > 0, `player-facing description present for ${k.id}`);
  }
});

test("presentation: selection still produces the EXACT same equippedFixedKeys IDs; 0–3 cap unchanged", () => {
  let s = setupWith();
  const labels = ["qiongjiu_fk1_concentration", "qiongjiu_fk2_efficient_planning", "qiongjiu_fk6_steadiness"];
  for (const id of labels) s = toggleFixedKey(s, "qiongjiu", id);
  const sc = buildScenario(s);
  assert.deepEqual(sc.team[0].equippedFixedKeys, labels, "ids carried verbatim (label change never touches ids)");
  s = toggleFixedKey(s, "qiongjiu", "qiongjiu_fk4_point_of_vulnerability");
  assert.equal(equipmentOf(s.characters[0]).equippedFixedKeys!.length, 3, "4th key still a no-op — cap unchanged");
});

// ---------------------------------------------------------------------------
// ENGLISH-ONLY PLAYER-FACING NAMES (2026) — no Chinese characters anywhere in the
// player-facing equipment presentation; authoritative English names only.
// ---------------------------------------------------------------------------

const CJK = /[\u4e00-\u9fff]/;

test("english-only e2e: all six Fixed Keys display English names only (no CJK in name or tooltip text)", async () => {
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY as {
    getCharacter: (id: string) => { fixedKeys: Array<{ id: string; name: string; description?: string }> } | undefined;
  };
  const def = REGISTRY.getCharacter("qiongjiu")!;
  const view = buildCharacterMetaView({ id: "qiongjiu", name: "Qiongjiu", fixedKeys: def.fixedKeys });
  const EXPECTED_ENGLISH = ["Concentration", "Efficient Planning", "Targeted Training", "Point of Vulnerability", "Necessary Adjustments", "Steadiness"];
  for (let i = 0; i < view.fixedKeys!.length; i++) {
    const k = view.fixedKeys![i];
    assert.equal(k.name, EXPECTED_ENGLISH[i], `Fixed Key ${i + 1} shows the authoritative English name only`);
    assert.equal(CJK.test(k.name), false, `name ${k.name} has no Chinese characters`);
    assert.equal(CJK.test(k.description ?? ""), false, `tooltip text for ${k.id} has no Chinese characters`);
    assert.equal(CJK.test(fixedKeyLabel(k)), false, `label for ${k.id} has no Chinese characters`);
  }
});

test("english-only e2e: the weapon displays the authoritative English name only; the internal id is unchanged", async () => {
  const w = await import(new URL("../../../dist/data/weapons.js", import.meta.url).href);
  const views = buildWeaponViews((w as { WEAPONS: unknown[] }).WEAPONS as Parameters<typeof buildWeaponViews>[0]);
  const gm = views.find((v) => v.id === "jinshizou")!;
  assert.equal(gm.name, "Golden Melody", "authoritative player-facing weapon name (id 'jinshizou' stays internal)");
  assert.equal(CJK.test(gm.name), false, "weapon name has no Chinese characters");
  assert.equal(gm.id, "jinshizou", "internal weapon id unchanged");
});