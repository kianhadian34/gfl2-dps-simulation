import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef, CommonKeyDef } from "../model/types.js";

/**
 * GENERIC COMMON KEY ARCHITECTURE (2026):
 * - Common Keys are REUSABLE registry definitions — never embedded solely inside `CharacterDef`.
 * - Every character has 3 Common Key Slots (max 3 selected; fewer is always valid).
 * - Categories (game structure — SOURCE FACTS): Gold Key (3 stats + secondary effect; 5★
 *   Character Edition) · Epic Key — 4★ Character Edition (3 stats + secondary effect) ·
 *   Epic Key — Generic Edition (3 stats, no secondary) · Rare Key (2 stats, no secondary).
 * - Stats fold via the EXISTING generic stat path; secondary effects are recorded data only
 *   (no invented trigger timing or behavior).
 * The fixtures below are test-only generic examples — NOT real in-game keys (none invented).
 */

const SN = "qiongjiu_common_strategic_negotiation";

// ---- Fixture Common Keys (test-only) ----
const F_GOLD: CommonKeyDef = {
  id: "fix_gold",
  name: "Gold Fixture",
  edition: "gold",
  characterScope: "dummy5star",
  stats: { atkPct: 0.05, critRate: 0.05, critDmg: 0.05 },
  secondaryEffect: {
    type: "status",
    statuses: [{ statusId: "damage_up_ii" }],
    description: "Fixture secondary (recorded, not executed)",
  },
  verified: true,
};
const F_EPIC4: CommonKeyDef = {
  id: "fix_epic4",
  name: "Epic 4★ Fixture",
  edition: "epic4",
  characterScope: "dummy4star",
  stats: { atkPct: 0.04, critRate: 0.04, critDmg: 0.04 },
  secondaryEffect: {
    type: "passive",
    passive: { kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: 0.05, when: "always" },
    description: "Fixture secondary via passive primitive (recorded, not executed)",
  },
  verified: true,
};
const F_GENERIC: CommonKeyDef = {
  id: "fix_epic_generic",
  name: "Epic Generic Fixture",
  edition: "epicGeneric",
  stats: { atkPct: 0.03, critRate: 0.03, critDmg: 0.03 },
  verified: true,
};
const F_RARE: CommonKeyDef = {
  id: "fix_rare",
  name: "Rare Fixture",
  edition: "rare",
  stats: { atkPct: 0.02, critRate: 0.02 },
  verified: true,
};
const CKS: Record<string, CommonKeyDef> = {
  fix_gold: F_GOLD,
  fix_epic4: F_EPIC4,
  fix_epic_generic: F_GENERIC,
  fix_rare: F_RARE,
};

/** Qiongjiu mirror for slot/stat tests: base ATK 2000, plain weapon, non-crit, no keys. */
function qj(): CharacterDef {
  const q = structuredClone(QIONGJIU);
  q.id = "qjck";
  q.base = { ...q.base, atk: 2000, critRate: 0, critDmg: 0 };
  return q;
}

function doll(teamMember: { commonKeyIds?: string[] }) {
  const st = createState(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "qjck", rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: teamMember.commonKeyIds }],
      dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjck: qj() }, CKS),
    new Set(),
  );
  return st.units.find((x) => x.id === "qjck")!;
}

test("0 Common Keys selected → none granted (no stat fold, no out-of-turn)", () => {
  const u = doll({});
  assert.equal(u.panelAtk, 2000);
  assert.equal(u.critRate, 0);
  assert.equal(u.critDmg, 0);
  assert.equal(u.outOfTurnDmg, 0);
});

test("1 Common Key selected (Rare, 2 stats) → both stats fold", () => {
  const u = doll({ commonKeyIds: ["fix_rare"] });
  assert.equal(u.panelAtk, 2040, "ceil(2000 × 1.02) — Rare +2% ATK");
  assert.equal(u.critRate, 0.02, "+2% Crit Rate");
  assert.equal(u.critDmg, 0);
  assert.equal(u.outOfTurnDmg, 0);
});

test("2 Common Keys selected → stats SUM and all contributions granted", () => {
  const u = doll({ commonKeyIds: ["fix_rare", "fix_epic_generic"] });
  assert.equal(u.panelAtk, 2100, "ceil(2000 × 1.05) — 2% + 3% ATK");
  assert.equal(u.critRate, 0.05, "2% + 3% Crit Rate");
  assert.equal(u.critDmg, 0.03, "Generic Epic +3% Crit DMG");
});

test("3 Common Keys selected → accepted, all three contributions fold", () => {
  const u = doll({ commonKeyIds: ["fix_gold", "fix_epic_generic", "fix_rare"] });
  assert.equal(u.panelAtk, 2200, "ceil(2000 × 1.10) — 5% + 3% + 2% ATK");
  assert.equal(u.critRate, 0.1, "5% + 3% + 2%");
  assert.equal(u.critDmg, 0.08, "5% + 3%");
});

test("4 Common Keys selected → REJECTED (3 Common Key Slots)", () => {
  assert.throws(
    () => doll({ commonKeyIds: ["fix_gold", "fix_epic4", "fix_epic_generic", "fix_rare"] }),
    /Common Key Slots|Common Keys/i,
  );
});

test("3-stat representation (Gold / Epic)", () => {
  assert.equal(Object.keys(F_GOLD.stats).length, 3, "Gold Key — 3 kinds of stats");
  assert.equal(Object.keys(F_EPIC4.stats).length, 3, "Epic 4★ — 3 kinds of stats");
  assert.equal(Object.keys(F_GENERIC.stats).length, 3, "Epic Generic — 3 kinds of stats");
});

test("2-stat representation (Rare)", () => {
  assert.equal(Object.keys(F_RARE.stats).length, 2, "Rare Key — 2 kinds of stats");
});

test("optional secondary effect: recorded on Gold/Epic, absent on Generic/Rare; the engine IGNORES it", () => {
  assert.equal(F_GOLD.secondaryEffect?.type, "status");
  assert.equal(F_GOLD.secondaryEffect?.statuses?.[0].statusId, "damage_up_ii");
  assert.equal(F_EPIC4.secondaryEffect?.type, "passive");
  assert.equal(F_GENERIC.secondaryEffect, undefined, "Epic Generic — no secondary (source fact)");
  assert.equal(F_RARE.secondaryEffect, undefined, "Rare — no secondary (source fact)");
  // Engine behavior: a key WITH a secondary effect applies NOTHING — the field is recorded-only
  // (no trigger timing invented). QJ basic (1 turn, ATK+5% from the Gold fixture's stats):
  const r = simulateScenario(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "qjck", rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: ["fix_gold"] }],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjck: qj() }, CKS),
  );
  const ev = r.log[0];
  assert.equal(ev.attackerAtk, 2100, "the key's STATS fold (+5% ATK)");
  assert.ok(!(ev.statusesApplied ?? []).includes("damage_up_ii"), `no secondary status applied: ${JSON.stringify(ev.statusesApplied)}`);
  assert.equal(ev.finalDamage, 547, "ceil(2100×0.8×2100/7100×1.10) — no secondary damage modifier leaked");
});

test("generic Common Key (Epic Generic Edition) usable by a NON-owner character (no owner gating)", () => {
  const st = createState(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "ck_ally", rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: ["fix_epic_generic"] }],
      dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ ck_ally: makeAlly("ck_ally", 1000) }, CKS),
    new Set(),
  );
  const u = st.units.find((x) => x.id === "ck_ally")!;
  assert.equal(u.panelAtk, 1030, "ceil(1000 × 1.03) — a Generic Edition key folds on ANY doll");
  assert.equal(u.critRate, 0.03, "base 0 + 3% Crit Rate");
  assert.equal(u.critDmg, 0.23, "base 0.2 + 3% Crit DMG");
});

test("character-specific Common Key carries its association as DATA only (no combat gating)", () => {
  assert.equal(F_GOLD.characterScope, "dummy5star", "Gold = 5★ Character Edition association as data");
  assert.equal(F_EPIC4.characterScope, "dummy4star", "Epic 4★ character edition association as data");
  assert.equal(F_GENERIC.characterScope, undefined, "Generic editions have no character scope");
  // Equipping a character-edition key works regardless of scope — scope is metadata and the
  // engine contains no character-id conditionals.
  const u = doll({ commonKeyIds: ["fix_gold"] });
  assert.equal(u.panelAtk, 2100);
  assert.equal(u.critDmg, 0.05);
});

test("Strategic Negotiation migrated: reusable registry definition with EXACT validated stats", () => {
  assert.equal("commonKey" in QIONGJIU, false, "Common Keys are no longer embedded in CharacterDef");
  const sn = REGISTRY.getCommonKey(SN)!;
  assert.equal(sn.id, SN);
  assert.equal(sn.name, "Strategic Negotiation");
  assert.equal(sn.type, "Universal Key: Skill");
  assert.equal(sn.edition, undefined, "SN edition unknown — not invented");
  assert.equal(sn.secondaryEffect, undefined, "no secondary effect validated for SN — none invented");
  assert.deepEqual(sn.stats, { atkPct: 0.05, critRate: 0.05, critDmg: 0.05, outOfTurnDmg: 0.07 });
});
