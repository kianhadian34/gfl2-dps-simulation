import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry } from "./helpers.js";
import { REGISTRY } from "../data/registry.js";
import type { CharacterDef } from "../model/types.js";

/**
 * AFFINITY KEY — Warm as Jade (VALIDATED in-game 2026):
 * OWN key: Lv5 → +3.3% ATK/HP/CritDMG; Lv9 → +4.5%; NO interpolation (Lv1–4, 6–8 = nothing).
 * FOREIGN key: only the generic +3% stat bonus applies (+3% ATK & HP) — **VALIDATED 2026**; the
 * holder's affinity LEVEL never upgrades it (a Lv9 QJ with someone else's key still gets only +3%).
 * Ownership test uses id "qjaw" for a Qiongjiu clone and "gj" for another doll owning its own
 * (foreign) affinity key — the helper registry pins id "qiongjiu" to the real doll.
 *
 * Deterministic ATK math (mirror: base ATK 2000, no weapon substats, no key-bracket passives):
 *   panel = ceil(2000 × (1 + pct)):
 *     no key 2000 · own Lv5 ceil(2000 × 1.033) = 2066 · own Lv9 ceil(2000 × 1.045) = 2090
 *     foreign  ceil(2000 × 1.03)  = 2060 · Lv1/Lv7 (no interpolation) = 2000
 * Damage (Basic Fuse, mult 0.8, DEF 5000, no weaknesses): final = ceil(atk × 0.8 × atk/(atk+5000))
 *   non-crit: 2000→458 · 2066→484 · 2090→493 · 2060→481
 * Crit (critRate 1): mult = 1 + critDmg  2000+0→458 · 2066+0.033→500 · 2090+0.045→516 · 2060+0→481.
 */

const WARM = "qiongjiu_affinity_warm_as_jade";
const FOREIGN = "gj_affinity_key";

function qj(overrides: { atk?: number; critRate?: number; critDmg?: number } = {}): CharacterDef {
  const qj = structuredClone(QIONGJIU);
  qj.id = "qjaw";
  qj.base = { ...qj.base, atk: overrides.atk ?? 2000, critRate: overrides.critRate ?? 0, critDmg: overrides.critDmg ?? 0 };
  qj.weapon = { ...qj.weapon, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  qj.passive = { ...qj.passive, effects: [], levels: undefined }; // no bracket modifiers
  return qj;
}

function foreignDoll(): CharacterDef {
  const gj = structuredClone(qj({ atk: 0 }));
  gj.id = "gj";
  gj.affinityKey = { id: FOREIGN, name: "Foreign Key", totalLevels: 2, levels: {}, genericBonus: { atk: 0.03, hp: 0.03 }, verified: true };
  return gj;
}

function run(opts: { keyId?: string; level?: number; critRate?: number; critDmg?: number } = {}) {
  const q = qj({ critRate: opts.critRate, critDmg: opts.critDmg });
  return simulateScenario(
    {
      version: 1, seed: 7, turns: 1,
      team: [
        { characterId: "qjaw", rotation: ["basic"], equippedFixedKeys: [], affinityKeyId: opts.keyId, affinityLevel: opts.level },
      ] as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjaw: q, gj: foreignDoll() }),
  );
}

test("Warm as Jade OWN key Lv5: ATK +3.3% (panel 2066), CritDMG +3.3% (crit ×1.033)", () => {
  const nonCrit = run({ keyId: WARM, level: 5 }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(nonCrit.attackerAtk, 2066, "ceil(2000 × 1.033) = 2066 — +3.3% ATK");
  assert.equal(nonCrit.finalDamage, 484, "ceil(2066 × 0.8 × 2066/7066)");
  const crit = run({ keyId: WARM, level: 5, critRate: 1 }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(crit.finalDamage, 500, "483.24 × (1 + 0.033) — +3.3% Crit DMG");
});

test("Warm as Jade OWN key Lv9: ATK +4.5% (panel 2090), CritDMG +4.5% (crit ×1.045)", () => {
  const nonCrit = run({ keyId: WARM, level: 9 }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(nonCrit.attackerAtk, 2090, "ceil(2000 × 1.045) = 2090 — +4.5% ATK");
  assert.equal(nonCrit.finalDamage, 493, "ceil(2090 × 0.8 × 2090/7090)");
  const crit = run({ keyId: WARM, level: 9, critRate: 1 }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(crit.finalDamage, 516, "492.87 × (1 + 0.045) — +4.5% Crit DMG");
});

test("FOREIGN affinity key: generic +3% (2060) applies; Qiongjiu's Lv9 does NOT upgrade it", () => {
  const lv9 = run({ keyId: FOREIGN, level: 9 }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(lv9.attackerAtk, 2060, "foreign key: ceil(2000 × 1.03) = 2060 — generic +3% ONLY");
  assert.equal(lv9.finalDamage, 481, "ceil(2060 × 0.8 × 2060/7060)");
  const lv9crit = run({ keyId: FOREIGN, level: 9, critRate: 1 }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(lv9crit.finalDamage, 481, "foreign key adds NO Crit DMG — the holder's level (9) does not pull her own 4.5% values");
  const lv5 = run({ keyId: FOREIGN, level: 5 }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(lv5.attackerAtk, 2060, "a foreign key at ANY level stays at the generic +3% (never 3.3%)");
});

test("NO interpolation: Lv1–4 and Lv6–8 grant nothing (panel stays 2000)", () => {
  for (const level of [1, 4, 6, 7, 8]) {
    const ev = run({ keyId: WARM, level }).log.find((e) => e.action === "qiongjiu_basic")!;
    assert.equal(ev.attackerAtk, 2000, `Lv${level}: no defined bonus (no interpolation)`);
  }
});

test("Not equipped / key removed: stats unchanged (2000 → 458), matching no-key baseline", () => {
  const ev = run({}).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.equal(ev.attackerAtk, 2000);
  assert.equal(ev.finalDamage, 458, "ceil(2000 × 0.8 × 2000/7000) — no affinity bonus");
});

test("Warm as Jade data: own levels, generic +3%, no deferral; HP folds in via the proven Final Stat formula", () => {
  const aff = QIONGJIU.affinityKey!;
  assert.equal(aff.id, WARM);
  assert.deepEqual(aff.levels[5], { critDmg: 0.033, atk: 0.033, hp: 0.033 });
  assert.deepEqual(aff.levels[9], { critDmg: 0.045, atk: 0.045, hp: 0.045 });
  assert.equal(aff.deferredNote, undefined, "Warm as Jade no longer deferred");
  assert.deepEqual(aff.genericBonus, { atk: 0.03, hp: 0.03 }, "foreign-key generic +3% stat bonus (+3% ATK/HP) — VALIDATED 2026");
  assert.equal(Object.keys(aff.levels).length, 2, "only Lv5 and Lv9 are defined — nothing in between");
  // HP panel folding uses the same Final Stat formula as ATK (HP has no combat consumer in the MVP,
  // so it is asserted at the state level): ceil(1000 × 1.033) = 1033 for the own-key Lv5 holder.
  const hpQj = structuredClone(QIONGJIU);
  hpQj.id = "qjhp";
  hpQj.base = { ...hpQj.base, atk: 1000, hp: 1000, critRate: 0, critDmg: 0 };
  hpQj.weapon = { ...hpQj.weapon, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  const st = createState(
    {
      version: 1, seed: 7, turns: 1,
      team: [{ characterId: "qjhp", rotation: ["basic"], affinityKeyId: WARM, affinityLevel: 5 }],
      dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjhp: hpQj }),
    new Set(),
  );
  const holder = st.units.find((u) => u.id === "qjhp")!;
  assert.equal(holder.panelAtk, 1033, "ceil(1000 × 1.033) — ATK also +3.3% on this variant");
  assert.equal(holder.hp, 1033, "ceil(1000 × 1.033) = 1033 — +3.3% HP folded through the proven panel formula");
  assert.equal(holder.maxHp, 1033);
  assert.equal(holder.critDmg, 0.033, "+3.3% Crit DMG additive on the panel value");
});