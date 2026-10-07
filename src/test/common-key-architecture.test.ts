import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef, CommonKeyDef, CommonKeyStat } from "../model/types.js";

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

const STRATEGIC_NEGOTIATION = "qiongjiu_common_strategic_negotiation";

// ---- Fixture Common Keys (test-only). These fixtures declare ALL their stat slots FIXED
//      (`fixedStatCount: 3` / `2`) so they keep testing the fold/SUM behavior unchanged; the
//      REAL game rule (only the FIRST stat hardcoded; the rest player-chosen) is on Strategic Negotiation and is
//      covered by the fixed-vs-selectable tests below. ----
const F_GOLD: CommonKeyDef = {
  id: "fix_gold",
  name: "Gold Fixture",
  edition: "gold",
  characterScope: "dummy5star",
  stats: [
    { kind: "atkPct", value: 0.05 },
    { kind: "critRate", value: 0.05 },
    { kind: "critDmg", value: 0.05 },
  ],
  fixedStatCount: 3,
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
  stats: [
    { kind: "atkPct", value: 0.04 },
    { kind: "critRate", value: 0.04 },
    { kind: "critDmg", value: 0.04 },
  ],
  fixedStatCount: 3,
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
  stats: [
    { kind: "atkPct", value: 0.03 },
    { kind: "critRate", value: 0.03 },
    { kind: "critDmg", value: 0.03 },
  ],
  fixedStatCount: 3,
  verified: true,
};
const F_RARE: CommonKeyDef = {
  id: "fix_rare",
  name: "Rare Fixture",
  edition: "rare",
  stats: [
    { kind: "atkPct", value: 0.02 },
    { kind: "critRate", value: 0.02 },
  ],
  fixedStatCount: 2,
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
      team: [{ characterId: "qjck", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: teamMember.commonKeyIds }],
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
  assert.equal(F_GOLD.stats.length, 3, "Gold Key — 3 stat slots");
  assert.equal(F_EPIC4.stats.length, 3, "Epic 4★ — 3 stat slots");
  assert.equal(F_GENERIC.stats.length, 3, "Epic Generic — 3 stat slots");
});

test("2-stat representation (Rare)", () => {
  assert.equal(F_RARE.stats.length, 2, "Rare Key — 2 stat slots");
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
      team: [{ characterId: "qjck", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: ["fix_gold"] }],
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
      team: [{ characterId: "ck_ally", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: ["fix_epic_generic"] }],
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
  const sn = REGISTRY.getCommonKey(STRATEGIC_NEGOTIATION)!;
  assert.equal(sn.id, STRATEGIC_NEGOTIATION);
  assert.equal(sn.name, "Strategic Negotiation");
  assert.equal(sn.type, "Universal Key: Skill");
  assert.equal(sn.edition, undefined, "Strategic Negotiation edition unknown — not invented");
  // CORRECTED model (2026): 3 ORDERED stat slots — slot #0 is the FIXED stat (Crit Rate, first in
  // the in-game description); slots #1/#2 are player-selectable (no `kind`) with the key's value.
  assert.deepEqual(sn.stats, [{ kind: "critRate", value: 0.05 }, { value: 0.05 }, { value: 0.05 }], "3 slots: 1 fixed + 2 selectable");
  assert.equal(sn.stats[0].kind, "critRate", "the fixed first stat is Crit Rate (in-game description order)");
  assert.equal(sn.stats[1].kind, undefined, "slot #1 is player-selectable");
  assert.equal(sn.stats[2].kind, undefined, "slot #2 is player-selectable");
  // The "+7% out-of-turn" is Strategic Negotiation's SECONDARY EFFECT (semicolon-separated in the description) — an
  // EXECUTED panel-stat addition, NOT one of the 3 stat slots.
  assert.equal(sn.secondaryEffect?.type, "stat");
  assert.deepEqual(sn.secondaryEffect?.stats, { outOfTurnDmg: 0.07 });
});

test("Common Key selectable slots: the player-chosen kind folds; an unchosen slot contributes nothing", () => {
  const choices = { [STRATEGIC_NEGOTIATION]: ["critDmg", "atkPct"] as const };
  const withChoices = createState(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "qjck", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: [STRATEGIC_NEGOTIATION], commonKeyStatChoices: { [STRATEGIC_NEGOTIATION]: [...choices[STRATEGIC_NEGOTIATION]] } }],
      dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjck: qj() }),
    new Set(),
  ).units.find((x) => x.id === "qjck")!;
  // fixed Crit Rate 5% + chosen Crit DMG 5% + chosen ATK Boost 5% (+ secondary +7% out-of-turn)
  assert.equal(withChoices.critRate, 0.05, "fixed slot #0 (Crit Rate) always applies");
  assert.equal(withChoices.critDmg, 0.05, "chosen slot #1 = Crit DMG");
  assert.equal(withChoices.panelAtk, 2100, "chosen slot #2 = ATK Boost +5% → ceil(2000 × 1.05)");
  assert.equal(withChoices.outOfTurnDmg, 0.07, "secondary effect executed");
  // No choices → only the fixed slot + the secondary effect apply.
  const noChoices = createState(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [{ characterId: "qjck", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: [STRATEGIC_NEGOTIATION] }],
      dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjck: qj() }),
    new Set(),
  ).units.find((x) => x.id === "qjck")!;
  assert.equal(noChoices.critRate, 0.05, "fixed stat applies without any choice");
  assert.equal(noChoices.critDmg, 0, "unchosen slot contributes nothing");
  assert.equal(noChoices.panelAtk, 2000, "unchosen slot contributes nothing");
  assert.equal(noChoices.outOfTurnDmg, 0.07, "secondary effect still executed");
});

test("Common Key stat choices are validated: unknown kind / extra slots / unequipped key are rejected", () => {
  const base = { version: 1, seed: 1, turns: 1 as const, dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" as const } };
  const run = (choices: Record<string, string[]>) =>
    createState(
      { ...base, team: [{ characterId: "qjck", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: [STRATEGIC_NEGOTIATION], commonKeyStatChoices: choices as never }] },
      customRegistry({ qjck: qj() }),
      new Set(),
    );
  assert.throws(() => run({ [STRATEGIC_NEGOTIATION]: ["critDmg", "atkPct", "hpPct"] }), /selectable stat slot/, "too many choices for a 3-slot key (1 fixed)");
  assert.throws(() => run({ [STRATEGIC_NEGOTIATION]: ["notAStat"] }), /not a selectable Common Key stat kind/, "unknown kind rejected");
  assert.throws(() => run({ [STRATEGIC_NEGOTIATION]: ["outOfTurnDmg", "atkPct"] }), /not a selectable Common Key stat kind/, "outOfTurnDmg is the key's EFFECT, never selectable");
  assert.throws(() => run({ fix_not_equipped: ["critDmg"] }), /not equipped/, "choices for an unequipped key rejected");
});

test("Common Key stat choices: NO duplicates — chosen kinds must differ from each other AND from the fixed stat", () => {
  const base = { version: 1, seed: 1, turns: 1 as const, dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" as const } };
  const run = (choices: CommonKeyStat[]) =>
    createState(
      { ...base, team: [{ characterId: "qjck", applyDispatchStats: false, rotation: ["basic"], equippedFixedKeys: [], commonKeyIds: [STRATEGIC_NEGOTIATION], commonKeyStatChoices: { [STRATEGIC_NEGOTIATION]: choices } }] },
      customRegistry({ qjck: qj() }),
      new Set(),
    );
  // Strategic Negotiation's fixed stat is Crit Rate → a chosen Crit Rate duplicates it.
  assert.throws(() => run(["critRate", "atkPct"]), /must differ from each other and from the fixed stat/, "duplicate of the fixed stat rejected");
  // Two identical choices duplicate each other.
  assert.throws(() => run(["atkPct", "atkPct"]), /must differ from each other and from the fixed stat/, "duplicate choices rejected");
  // All-distinct (and none equal to the fixed Crit Rate) is accepted.
  assert.doesNotThrow(() => run(["critDmg", "atkPct"]), "distinct choices accepted");
});

test("Common Key selectable kinds include Health Boost / Defense Boost (hpPct / defPct fold)", () => {
  const base = { version: 1, seed: 1, turns: 1 as const, dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" as const } };
  const run = (choices?: CommonKeyStat[]) =>
    createState(
      {
        ...base,
        team: [
          {
            characterId: "qjck",
            applyDispatchStats: false,
            rotation: ["basic"],
            equippedFixedKeys: [],
            commonKeyIds: [STRATEGIC_NEGOTIATION],
            ...(choices ? { commonKeyStatChoices: { [STRATEGIC_NEGOTIATION]: choices } } : {}),
          },
        ],
      },
      customRegistry({ qjck: qj() }),
      new Set(),
    ).units.find((x) => x.id === "qjck")!;
  const baseline = run();
  const withChoices = run(["hpPct", "defPct"]);
  assert.equal(withChoices.maxHp, Math.ceil(baseline.maxHp * 1.05), "chosen Health Boost +5% folds into HP");
  assert.equal(withChoices.defStat, Math.ceil(baseline.defStat * 1.05), "chosen Defense Boost +5% folds into DEF");
  assert.equal(withChoices.critRate, 0.05, "the fixed Crit Rate slot still applies");
});
