import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScenario,
  DEFAULT_SETUP,
  DEBUG_STAT_KEYS,
  debugBaseStatOverrides,
  equipmentErrors,
  equipmentOf,
  seedDebugBaseStats,
  setDebugBaseStat,
  setDebugEnabled,
  toggleFixedKey,
  toggleCommonKey,
  type DebugBaseStats,
  type SetupState,
} from "../src/shared/setup.js";
import { buildCharacterMetaView } from "../src/shared/lists.js";
import type { ScenarioView } from "../src/shared/engine-types.js";

/**
 * DEBUG MODE (2026) — a configuration/testing layer OVER the existing engine, never a second
 * calculation path. Base stats come from the character's real CharacterDef.base; ONLY edited
 * fields leave as `baseStatOverrides`; no keys/weapon are auto-added; the engine stays the
 * single authority (validation, no double stat system).
 */

const QJ_BASE: DebugBaseStats = { atk: 1224, hp: 1965, def: 624, stability: 6, critRate: 0.05, critDmg: 0.5 };

function setupWith(overrides: Record<string, unknown> = {}): SetupState {
  return {
    ...DEFAULT_SETUP,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, ...overrides }],
    rotations: { qiongjiu: ["basic"] },
  };
}

function seedFor(setup: SetupState): SetupState {
  return seedDebugBaseStats(setup, { qiongjiu: QJ_BASE });
}

test("debug: can be enabled", () => {
  const s = setDebugEnabled(setupWith(), true);
  assert.equal(s.debug.enabled, true);
  assert.equal(equipmentErrors(s).length, 0, "debug mode relaxes the normal equipment requirements");
});

test("debug: displays the selected character's actual CharacterDef.base initially (seeded, untouched)", () => {
  const s = seedFor(setupWith());
  const cfg = s.debug.baseStats["qiongjiu"];
  assert.deepEqual(cfg.values, QJ_BASE, "initial values are the engine base stats");
  assert.deepEqual(cfg.touched, {}, "nothing is touched → no overrides emitted by default");
  assert.deepEqual(debugBaseStatOverrides(s, "qiongjiu"), {});
  assert.deepEqual(Object.keys(buildScenario(s).team[0]), ["characterId", "rotation", "equippedFixedKeys"], "no baseStatOverrides in normal mode");
});

test("debug: editing a base stat marks it touched and flows into baseStatOverrides", () => {
  let s = seedFor(setupWith());
  s = setDebugEnabled(s, true);
  for (const [key, value] of [["atk", 1500], ["hp", 1234], ["def", 700], ["stability", 9], ["critRate", 0.25], ["critDmg", 0.8]] as const) {
    s = setDebugBaseStat(s, "qiongjiu", key, value);
  }
  assert.deepEqual(debugBaseStatOverrides(s, "qiongjiu"), { atk: 1500, hp: 1234, def: 700, stability: 9, critRate: 0.25, critDmg: 0.8 });
  const sc = buildScenario(s);
  assert.deepEqual(sc.team[0].baseStatOverrides, { atk: 1500, hp: 1234, def: 700, stability: 9, critRate: 0.25, critDmg: 0.8 });
});

test("debug: only EDITED fields become overrides — untouched base fields are never sent", () => {
  let s = seedFor(setupWith());
  s = setDebugEnabled(s, true);
  s = setDebugBaseStat(s, "qiongjiu", "atk", 1500);
  const sc = buildScenario(s);
  assert.deepEqual(sc.team[0].baseStatOverrides, { atk: 1500 }, "hp/def/stability/critRate/critDmg stay on the character's own base");
});

test("debug: NO weapon is valid; keys are all optional (0 Fixed / 0 Common / no Affinity / no Expansion)", () => {
  let s = seedFor(setupWith());
  s = setDebugEnabled(s, true);
  const sc: ScenarioView = buildScenario(s);
  const member = sc.team[0];
  assert.equal(member.weaponId, undefined, "no weapon");
  assert.deepEqual(member.equippedFixedKeys, [], "0 Fixed Keys");
  assert.equal(member.commonKeyIds, undefined, "0 Common Keys");
  assert.equal(member.affinityKeyId, undefined, "no Affinity Key");
  assert.equal(member.expansionKeyId, undefined, "no Expansion Key");
  assert.equal(member.baseStatOverrides, undefined, "nothing edited → no overrides, no silently added keys/weapons/buffs");
});

test("debug: editing a key is also optional, and toggling still caps at 3", () => {
  let s = seedFor(setupWith());
  s = setDebugEnabled(s, true);
  s = toggleFixedKey(s, "qiongjiu", "qiongjiu_fk1_concentration");
  s = toggleCommonKey(s, "qiongjiu", "qiongjiu_common_strategic_negotiation");
  for (const id of ["a", "b"]) s = toggleFixedKey(s, "qiongjiu", id);
  assert.equal(equipmentOf(s.characters[0]).equippedFixedKeys!.length, 3, "cap unchanged in debug mode");
  const sc = buildScenario(s);
  assert.deepEqual(sc.team[0].equippedFixedKeys, ["qiongjiu_fk1_concentration", "a", "b"]);
  assert.deepEqual(sc.team[0].commonKeyIds, ["qiongjiu_common_strategic_negotiation"]);
});

test("normal mode remains unchanged: engaged equipment still requires weapon + affinity (not relaxed outside debug)", () => {
  const engaged = { ...setupWith(), characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, equipment: { commonKeyIds: ["ck1"] } }] };
  assert.ok(equipmentErrors(engaged).some((e) => /select a Weapon/.test(e)), "normal mode still flags engaged-without-weapon");
  // The same configuration is VALID once Debug Mode is enabled.
  const debug = setDebugEnabled(engaged, true);
  assert.deepEqual(equipmentErrors(debug), []);
});

test("final scenario contains exactly the selected debug values + equipment fields", () => {
  let s = seedFor(setupWith());
  s = setDebugEnabled(s, true);
  s = setDebugBaseStat(s, "qiongjiu", "atk", 2000);
  const sc = buildScenario(s);
  assert.deepEqual(sc.team[0], {
    characterId: "qiongjiu",
    rotation: ["basic"],
    equippedFixedKeys: [],
    baseStatOverrides: { atk: 2000 },
  });
});

test("debug e2e: the overrides reach the REAL engine and drive the actual panel (no renderer-side stat math)", async () => {
  const sim = await import(new URL("../../../dist/simulate.js", import.meta.url).href);
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const engine = (sim as { simulateScenario: (s: unknown, r: unknown) => { log: Array<{ attackerAtk?: number }> } }).simulateScenario;
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY;
  let s = seedFor(setupWith());
  s = setDebugEnabled(s, true);
  s = setDebugBaseStat(s, "qiongjiu", "atk", 1500);
  const sc = buildScenario(s);
  const r = engine(sc as never, REGISTRY);
  const basic = r.log.find((e) => e.attackerAtk !== undefined)!;
  assert.equal(basic.attackerAtk, 1500, "the engine panel uses the override (no weapon)");
});

test("debug e2e: the character's real base stats are available from the engine-sourced meta (initial values source)", async () => {
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY as {
    getCharacter: (id: string) => { base: { atk: number; hp: number; def: number; stability: number; critRate: number; critDmg: number } } | undefined;
  };
  const view = buildCharacterMetaView({ id: "qiongjiu", name: "Qiongjiu", base: REGISTRY.getCharacter("qiongjiu")!.base });
  assert.deepEqual(view.base, REGISTRY.getCharacter("qiongjiu")!.base, "CharacterMetaView.base mirrors CharacterDef.base (engine-sourced, not derived panel)");
  assert.deepEqual(Object.keys(view.base ?? {}).sort(), [...DEBUG_STAT_KEYS].sort(), "exactly the DEBUG base-stat fields");
});