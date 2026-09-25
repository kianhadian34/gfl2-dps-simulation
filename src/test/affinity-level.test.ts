import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef } from "../model/types.js";
import type { Scenario } from "../model/types.js";

/**
 * STANDALONE CHARACTER AFFINITY-LEVEL STAT BONUSES (2026, confirmed) — NOT the Affinity Key.
 * Character Affinity Lv5 = no standalone bonus; Lv9 = ATK/HP/DEF +5% (the simulator models the
 * in-game Lv6 unlock state as Lv9; Lv6–8 have no separate states). Completely independent of the
 * equipped Affinity Key: applies with no key, the character's own key, or a foreign key; stacks
 * additively with key bonuses inside the same Final Stat percentage buckets.
 *
 * Deterministic math (base ATK 2000 · HP 1000 · DEF 500 — set on the Qionjiu clone):
 *   char Lv9 only      : atk ceil(2000×1.05)=2100 · hp ceil(1000×1.05)=1050 · def ceil(500×1.05)=525
 *   char Lv9 + own key : atk ceil(2000×1.095)=2190 · hp ceil(1000×1.095)=1095 · def 525
 *                        (key Lv9 ATK/HP +4.5% + char +5% = 1.095; key has no DEF)
 *   char Lv9 + foreign : atk ceil(2000×1.08)=2160 · hp ceil(1000×1.0815)=1082 · def 525
 *                        (foreign 002B3% ATK/HP + char +5% = 1.08)
 *   char Lv5           : no standalone bonus → panel stays exact (2000 / 1000 / 500).
 */

const WARM = "qiongjiu_affinity_warm_as_jade";
const FOREIGN = "gj_affinity_key";

function qj(overrides: { atk?: number; hp?: number; def?: number } = {}): CharacterDef {
  const q = structuredClone(QIONGJIU);
  q.id = "qjaw";
  q.base = { ...q.base, atk: overrides.atk ?? 2000, hp: overrides.hp ?? 1000, def: overrides.def ?? 500, critRate: 0, critDmg: 0 };
  q.passive = { ...q.passive, effects: [], levels: undefined };
  return q;
}

function foreignDoll(): CharacterDef {
  const gj = structuredClone(qj({ atk: 0 }));
  gj.id = "gj";
  gj.affinityKey = { id: FOREIGN, name: "Foreign Key", totalLevels: 2, levels: {}, genericBonus: { atk: 0.03, hp: 0.03 }, verified: true };
  return gj;
}

function state(opts: { keyId?: string; level?: number } = {}) {
  const q = qj();
  const scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: "qjaw", rotation: ["basic"], equippedFixedKeys: [], affinityKeyId: opts.keyId, affinityLevel: opts.level }],
    dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
  } as Scenario;
  const sim = createState(scenario, customRegistry({ qjaw: q, gj: foreignDoll() }), new Set());
  return sim.units[0];
}

test("character Affinity Lv5: NO standalone ATK/HP/DEF bonus (panel stays 2000 / 1000 / 500)", () => {
  const u = state({ level: 5 });
  assert.equal(u.panelAtk, 2000);
  assert.equal(u.hp, 1000);
  assert.equal(u.maxHp, 1000);
  assert.equal(u.defStat, 500);
});

test("character Affinity Lv9 with NO Affinity Key: +5% ATK/HP/DEF (2100 / 1050 / 525)", () => {
  const u = state({ level: 9 });
  assert.equal(u.panelAtk, 2100, "ceil(2000 × 1.05)");
  assert.equal(u.hp, 1050, "ceil(1000 × 1.05)");
  assert.equal(u.maxHp, 1050);
  assert.equal(u.defStat, 525, "ceil(500 × 1.05) — DEF percentage fold");
});

test("character Affinity Lv9 with OWN key: independent and additive (atk 2190 · hp 1095 · def 525)", () => {
  const u = state({ keyId: WARM, level: 9 });
  assert.equal(u.panelAtk, 2190, "ceil(2000 × 1.095) — key +4.5% + char +5%");
  assert.equal(u.hp, 1095, "ceil(1000 × 1.095)");
  assert.equal(u.maxHp, 1095, "hp/maxHp share the hp% fold (key + char)");
  assert.equal(u.defStat, 525, "DEF unaffected by the key — char Lv9 +5% still applies");
  assert.equal(u.critDmg, 0.045, "own-key CritDMG +4.5% unchanged (char level adds no CritDMG)");
});

test("character Affinity Lv9 with FOREIGN key: char +5% still applies; foreign +3% unchanged (atk 2160 · hp 1082 · def 525)", () => {
  const u = state({ keyId: FOREIGN, level: 9 });
  assert.equal(u.panelAtk, 2160, "ceil(2000 × 1.08) — foreign key +3% + char +5%");
  assert.equal(u.hp, 1080, "ceil(1000 × 1.08) — additive: foreign hp +3% + char hp +5% (same bucket)");
  assert.equal(u.defStat, 525, "foreign key has no DEF; char Lv9 +5% DEF applies");
  assert.equal(u.critDmg, 0, "foreign key adds no CritDMG (unchanged)");
});

test("character Affinity Lv5 with OWN key: only the key bonus applies (2066 / 1033 / 500), no standalone bonus", () => {
  const u = state({ keyId: WARM, level: 5 });
  assert.equal(u.panelAtk, 2066, "own Lv5 key +3.3% only — no char-level bonus at Lv5");
  assert.equal(u.hp, 1033, "ceil(1000 × 1.033)");
  assert.equal(u.defStat, 500, "no DEF bonus without char Lv9");
});

test("Lv6–8 grant NOTHING (no interpolation) — char level map is exact", () => {
  for (const level of [6, 7, 8]) {
    const u = state({ level });
    assert.equal(u.panelAtk, 2000, `Lv${level}: no defined character-level bonus`);
    assert.equal(u.hp, 1000);
    assert.equal(u.defStat, 500);
  }
});