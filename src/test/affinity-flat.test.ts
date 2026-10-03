import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry } from "./helpers.js";
import type { CharacterDef, Scenario } from "../model/types.js";

/**
 * STANDALONE CHARACTER AFFINITY-LEVEL FLAT STATS (2026, confirmed) — a SEPARATE affinity source,
 * distinct from the Affinity percentage map (`affinityLevelStats`) and from the equipped Affinity
 * Key. Each `affinityFlatStats[level]` entry is that level's PER-LEVEL flat ATK/HP/DEF INCREASE;
 * a character's contribution at level N is the cumulative sum of entries 1..N. The totals enter the
 * EXISTING panel flat bucket (same bucket as Dispatch / Remolder flats / Neural Helix) and are
 * therefore folded BEFORE the percentage multiply: panel = ceil((base + flat) × (1 + pct)).
 *
 * Like the other flat-bucket permanent sources, the affinity flat is gated behind the
 * `applyDispatchStats` switch (a controlled `applyDispatchStats: false` fixture excludes it), so
 * these tests exercise the LIVE path — exactly like `neural-helix.test.ts`. Global +12% (universal
 * Neural Helix) therefore applies; the numbers below account for it explicitly.
 *
 * Deterministic basis: a Qiongjiu clone with base ATK 2000 / HP 1000 / DEF 500, passive effects and
 * Neural-Helix / Remolder flats stripped, Sentinel class → Dispatch +231 / +519 / +222.
 */

const WARM = "qiongjiu_affinity_warm_as_jade";
const FOREIGN = "gj_affinity_key";

/** Qiongjiu clone with a controlled base and all OTHER permanent flat sources stripped, so only
 *  the affinity flat + Dispatch + the universal +12% remain in play. */
function qj(): CharacterDef {
  const q = structuredClone(QIONGJIU);
  q.id = "qjaf";
  q.base = { ...q.base, atk: 2000, hp: 1000, def: 500, critRate: 0, critDmg: 0 };
  q.passive = { ...q.passive, effects: [], levels: undefined };
  q.neuralHelixStats = undefined;
  q.remolderFlat = undefined;
  q.remolderSetBonuses = undefined;
  return q;
}

function foreignDoll(): CharacterDef {
  const gj = structuredClone(qj());
  gj.id = "gj";
  gj.affinityKey = { id: FOREIGN, name: "Foreign Key", totalLevels: 2, levels: {}, genericBonus: { atk: 0.03, hp: 0.03 }, verified: true };
  return gj;
}

function state(level: number | undefined, keyId?: string) {
  const scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: "qjaf", rotation: ["basic"], equippedFixedKeys: [], affinityKeyId: keyId, affinityLevel: level }],
    dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
  } as Scenario;
  return createState(scenario, customRegistry({ qjaf: qj(), gj: foreignDoll() }), new Set()).units[0];
}

/** Pure cumulative sum of the per-level increments through `level` — no engine involved. */
function cumulative(level: number): { atk: number; hp: number; def: number } {
  const totals = { atk: 0, hp: 0, def: 0 };
  for (let lv = 1; lv <= level; lv++) {
    const entry = QIONGJIU.affinityFlatStats?.[lv];
    if (!entry) continue;
    totals.atk += entry.atk ?? 0;
    totals.hp += entry.hp ?? 0;
    totals.def += entry.def ?? 0;
  }
  return totals;
}

// DATA ---------------------------------------------------------------------------------

test("Qiongjiu Affinity flat data: per-level increments, no zero-valued fields, nothing at Lv1/Lv6–9", () => {
  // NOTE: node's `assert.deepEqual` has an `asserts actual is T` signature, so it narrows the object
  // to the literal expected key set. The indexed lookups below therefore run FIRST (declared type).
  const stats: Record<number, { atk?: number; hp?: number; def?: number }> = QIONGJIU.affinityFlatStats ?? {};
  assert.equal(stats[1], undefined, "Lv1 adds no flat stats");
  for (const lv of [6, 7, 8, 9]) {
    assert.equal(stats[lv], undefined, `Lv${lv} adds no flat-stat entry`);
  }
  // No zero-valued fields anywhere (e.g. Lv3 carries no ATK key — absent, not 0).
  for (const [lv, entry] of Object.entries(stats)) {
    for (const [stat, v] of Object.entries(entry)) {
      assert.ok(typeof v === "number" && v !== 0, `Lv${lv}.${stat} must be present and non-zero`);
    }
  }
  assert.deepEqual(
    stats,
    {
      2: { atk: 23, hp: 82 },
      3: { hp: 93, def: 32 },
      4: { atk: 40, def: 76 },
      5: { atk: 52, hp: 117 },
    },
    "each entry holds ONLY that level's present stats (no invented zero fields)",
  );
});

test("Cumulative totals: Lv2/Lv3/Lv4/Lv5 aggregate the per-level increases (Lv5 = +115 ATK / +292 HP / +108 DEF)", () => {
  assert.deepEqual(cumulative(2), { atk: 23, hp: 82, def: 0 });
  assert.deepEqual(cumulative(3), { atk: 23, hp: 175, def: 32 });
  assert.deepEqual(cumulative(4), { atk: 63, hp: 175, def: 108 });
  assert.deepEqual(cumulative(5), { atk: 115, hp: 292, def: 108 }, "the supplied Lv.5 cumulative totals");
  assert.deepEqual(cumulative(9), { atk: 115, hp: 292, def: 108 }, "Lv6–9 add nothing → same as Lv5");
});

// PANEL AGGREGATION --------------------------------------------------------------------

test("Affinity flat enters the FLAT bucket (added before ×pct), cumulative through the level", () => {
  // Sentinel dispatch +231/+519/+222, universal +12% → panel = ceil((base + dispatch + flat) × 1.12).
  const lv1 = state(1);
  assert.equal(lv1.panelAtk, 2499, "Lv1: ceil((2000 + 231) × 1.12) — no affinity flat");
  assert.equal(lv1.hp, 1702, "ceil((1000 + 519) × 1.12)");
  assert.equal(lv1.defStat, 809, "ceil((500 + 222) × 1.12)");

  const lv2 = state(2);
  assert.equal(lv2.panelAtk, 2525, "Lv2: ceil((2000 + 231 + 23) × 1.12) — +23 flat ATK");
  assert.equal(lv2.hp, 1794, "ceil((1000 + 519 + 82) × 1.12) — +82 flat HP");
  assert.equal(lv2.defStat, 809, "no DEF yet");

  const lv3 = state(3);
  assert.equal(lv3.panelAtk, 2525, "Lv3: ATK flat unchanged (+23)");
  assert.equal(lv3.hp, 1898, "ceil((1000 + 519 + 82 + 93) × 1.12) — cumulative HP +175");
  assert.equal(lv3.defStat, 845, "ceil((500 + 222 + 32) × 1.12) — +32 flat DEF");

  const lv4 = state(4);
  assert.equal(lv4.panelAtk, 2570, "Lv4: ceil((2000 + 231 + 23 + 40) × 1.12) — cumulative ATK +63");
  assert.equal(lv4.hp, 1898, "HP flat unchanged (+175)");
  assert.equal(lv4.defStat, 930, "ceil((500 + 222 + 32 + 76) × 1.12) — cumulative DEF +108");
});

test("Lv5 flat is flat-bucket (multiplied by pct), NOT a percentage: panel 2628 / 2029 / 930", () => {
  const lv5 = state(5);
  // If +115 ATK were a % (5.75%), the panel would be ceil(2231 × 1.1175) = 2494 — NOT 2628.
  assert.equal(lv5.panelAtk, 2628, "ceil((2000 + 231 + 115) × 1.12) — flat added BEFORE the % multiply");
  assert.equal(lv5.hp, 2029, "ceil((1000 + 519 + 292) × 1.12)");
  assert.equal(lv5.defStat, 930, "ceil((500 + 222 + 108) × 1.12)");
});

test("Lv6–9 add no flat stats: Lv6–8 match Lv5's flat; Lv9 differs only by the +5% percentage map", () => {
  for (const lv of [6, 7, 8]) {
    const u = state(lv);
    assert.equal(u.panelAtk, 2628, `Lv${lv}: no flat entry → same flat as Lv5`);
    assert.equal(u.hp, 2029, `Lv${lv}: same HP flat as Lv5`);
    assert.equal(u.defStat, 930, `Lv${lv}: same DEF flat as Lv5`);
  }
  // Lv9 keeps the Lv5 flat total (no new flat entries) and adds the EXISTING Lv9 +5% percentage map.
  const lv9 = state(9);
  assert.equal(lv9.panelAtk, 2745, "ceil((2000 + 231 + 115) × (1 + 0.12 + 0.05)) — flat unchanged, +5% pct");
  assert.equal(lv9.defStat, 972, "ceil((500 + 222 + 108) × 1.17)");
});

// INDEPENDENCE -------------------------------------------------------------------------

test("Affinity flat is independent of the equipped Affinity Key (KEY adds only its own pct)", () => {
  const noKey = state(5);
  const ownKey = state(5, WARM); // Warm as Jade Lv5 → +3.3% ATK/HP (owner's key at that level)
  const foreign = state(5, FOREIGN); // foreign key → generic +3% ATK/HP only

  // Flat contribution is IDENTICAL across all three (base + dispatch + affinity flat = 2346/1811/830);
  // only the percentage bucket changes with the key.
  assert.equal(noKey.panelAtk, 2628, "no key: ceil(2346 × 1.12)");
  assert.equal(ownKey.panelAtk, 2705, "ceil(2346 × (1 + 0.12 + 0.033)) — key +3.3% on top");
  assert.equal(ownKey.hp, 2089, "ceil(1811 × 1.153)");
  assert.equal(ownKey.critDmg, 0.033, "own-key CritDMG +3.3% (unaffected by the flat system)");
  assert.equal(ownKey.defStat, 930, "key has no DEF — affinity flat DEF (+108) still applies");
  assert.equal(foreign.panelAtk, 2698, "ceil(2346 × (1 + 0.12 + 0.03)) — foreign generic +3%");
  assert.equal(foreign.hp, 2083, "ceil(1811 × 1.15)");
  assert.equal(foreign.defStat, 930, "foreign key has no DEF — affinity flat DEF still applies");
});

test("Controlled fixture (applyDispatchStats:false) excludes the affinity flat, like the other flat sources", () => {
  const scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: "qjaf", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [], affinityLevel: 5 }],
    dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
  } as Scenario;
  const u = createState(scenario, customRegistry({ qjaf: qj() }), new Set()).units[0];
  assert.equal(u.panelAtk, 2000, "fixture excludes Dispatch + affinity flat → panel = base");
  assert.equal(u.hp, 1000);
  assert.equal(u.defStat, 500);
});
