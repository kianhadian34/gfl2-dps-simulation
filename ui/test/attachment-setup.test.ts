import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScenario,
  DEFAULT_SETUP,
  equipmentOf,
  setActiveAttachmentSet,
  toggleAttachmentStat,
  type SetupState,
} from "../src/shared/setup.js";
import { buildAttachmentCatalog } from "../src/shared/lists.js";
import type { ScenarioView } from "../src/shared/engine-types.js";

/**
 * WEAPON ATTACHMENTS UI — DATA-LAYER TESTS (2026).
 *
 * The React control layer is a thin shell over the pure helpers in setup.ts. These tests pin the
 * UI behaviours: per-slot stat toggling with the per-slot maximum (no duplicates), a single
 * loadout-level `activeAttachmentSet`, verbatim carry-through into the engine scenario, and a
 * selectable set list derived from `implemented === true` engine data (never hard-coded ids).
 *
 * The engine attachment tests (src/test/attachment-*.test.ts) remain authoritative for engine
 * math — this file asserts UI plumbing only, no engine math is duplicated here.
 */

function setupWith(charOverrides: Record<string, unknown> = {}): SetupState {
  return {
    ...DEFAULT_SETUP,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, ...charOverrides }],
    rotations: { qiongjiu: ["basic"] },
  };
}

function scenarioMember(s: SetupState): Record<string, unknown> {
  return buildScenario(s).team[0] as unknown as Record<string, unknown>;
}

// Engine data loaded from the built dist (the UI must derive everything from engine data).
async function engineAttachmentData(): Promise<{
  ATTACHMENT_SETS: Array<{ id: string; name: string; implemented: boolean }>;
  ATTACHMENT_SLOTS: string[];
  ATTACHMENT_SLOT_MAX_STATS: Record<string, number>;
  ATTACHMENT_STAT_DEFS: Record<string, { kind: string; value: number; bucket: string }>;
  attachmentStatsForSlot: (slot: string) => string[];
}> {
  const mod = await import(new URL("../../../dist/data/attachments.js", import.meta.url).href);
  const sets = await import(new URL("../../../dist/data/attachment-sets.js", import.meta.url).href);
  return {
    ATTACHMENT_SETS: (sets as { ATTACHMENT_SETS: never }).ATTACHMENT_SETS,
    ATTACHMENT_SLOTS: (mod as { ATTACHMENT_SLOTS: never }).ATTACHMENT_SLOTS,
    ATTACHMENT_SLOT_MAX_STATS: (mod as { ATTACHMENT_SLOT_MAX_STATS: never }).ATTACHMENT_SLOT_MAX_STATS,
    ATTACHMENT_STAT_DEFS: (mod as { ATTACHMENT_STAT_DEFS: never }).ATTACHMENT_STAT_DEFS,
    attachmentStatsForSlot: (mod as { attachmentStatsForSlot: never }).attachmentStatsForSlot,
  };
}

// ---------------------------------------------------------------------------
// MODEL — fields exist and carry through
// ---------------------------------------------------------------------------

test("attachments: a member with NO attachment equipment emits no attachment fields (legacy shape intact)", () => {
  const m = scenarioMember(setupWith());
  assert.equal("attachments" in m, false, "no `attachments` key when nothing is configured");
  assert.equal("activeAttachmentSet" in m, false, "no `activeAttachmentSet` key when nothing is selected");
});

test("attachments: stat selections serialize through buildScenario VERBATIM", () => {
  const s = setupWith({
    equipment: { attachments: { muzzle: ["attack", "critDamage"], sight: ["critRate"], underbarrel: ["defense"] } },
  });
  assert.deepEqual(scenarioMember(s).attachments, {
    muzzle: ["attack", "critDamage"],
    sight: ["critRate"],
    underbarrel: ["defense"],
  });
});

test("attachments: activeAttachmentSet serializes through buildScenario VERBATIM", () => {
  const s = setupWith({ equipment: { activeAttachmentSet: "attachment_set_burn_boost" } });
  assert.equal(scenarioMember(s).activeAttachmentSet, "attachment_set_burn_boost");
});

test("attachments: both fields appear together on the emitted member", () => {
  const s = setupWith({
    equipment: { attachments: { foregrip: ["attackBoost"] }, activeAttachmentSet: "attachment_set_close_assault" },
  });
  const m = scenarioMember(s);
  assert.deepEqual(m.attachments, { foregrip: ["attackBoost"] });
  assert.equal(m.activeAttachmentSet, "attachment_set_close_assault");
});

// ---------------------------------------------------------------------------
// HELPERS — toggle add/remove, per-slot cap, no duplicates
// ---------------------------------------------------------------------------

test("attachments: toggle adds a stat to an empty slot, then removes it (round-trip)", () => {
  let s = setupWith();
  s = toggleAttachmentStat(s, "qiongjiu", "muzzle", "attack", 4);
  assert.deepEqual(equipmentOf(s.characters[0]).attachments, { muzzle: ["attack"] }, "added");
  s = toggleAttachmentStat(s, "qiongjiu", "muzzle", "attack", 4);
  assert.equal(equipmentOf(s.characters[0]).attachments, undefined, "removing the last stat drops the slot (and the config)");
});

test("attachments: a stat can be added to multiple different slots independently", () => {
  let s = setupWith();
  s = toggleAttachmentStat(s, "qiongjiu", "muzzle", "attack", 4);
  s = toggleAttachmentStat(s, "qiongjiu", "sight", "attack", 3);
  s = toggleAttachmentStat(s, "qiongjiu", "sight", "critRate", 3);
  assert.deepEqual(equipmentOf(s.characters[0]).attachments, { muzzle: ["attack"], sight: ["attack", "critRate"] });
});

test("attachments: toggling an already-selected stat is a remove (no duplicates possible)", () => {
  let s = setupWith();
  s = toggleAttachmentStat(s, "qiongjiu", "muzzle", "attack", 4);
  s = toggleAttachmentStat(s, "qiongjiu", "muzzle", "attack", 4);
  s = toggleAttachmentStat(s, "qiongjiu", "muzzle", "attack", 4);
  assert.deepEqual(equipmentOf(s.characters[0]).attachments, { muzzle: ["attack"] }, "exactly one entry after three toggles");
});

test("attachments: the per-slot maximum is respected (a full slot rejects a new stat, never drops an existing one)", () => {
  let s = setupWith();
  // Muzzle max = 4.
  for (const k of ["attack", "attackBoost", "health", "healthBoost"]) s = toggleAttachmentStat(s, "qiongjiu", "muzzle", k, 4);
  const before = equipmentOf(s.characters[0]).attachments?.muzzle;
  assert.equal(before?.length, 4, "4 stats selected");
  s = toggleAttachmentStat(s, "qiongjiu", "muzzle", "critRate", 4); // 5th → no-op
  assert.deepEqual(equipmentOf(s.characters[0]).attachments?.muzzle, before, "the 5th stat is a no-op; the existing 4 are untouched");
});

test("attachments: non-Muzzle slots cap at 3 (a 4th stat is rejected)", () => {
  let s = setupWith();
  for (const k of ["attack", "attackBoost", "health"]) s = toggleAttachmentStat(s, "qiongjiu", "sight", k, 3);
  s = toggleAttachmentStat(s, "qiongjiu", "sight", "critRate", 3);
  assert.deepEqual(equipmentOf(s.characters[0]).attachments?.sight, ["attack", "attackBoost", "health"], "sight caps at 3");
});

test("attachments: setActiveAttachmentSet selects one set and clears back to none", () => {
  let s = setupWith();
  s = setActiveAttachmentSet(s, "qiongjiu", "attachment_set_phase_strike");
  assert.equal(equipmentOf(s.characters[0]).activeAttachmentSet, "attachment_set_phase_strike");
  s = setActiveAttachmentSet(s, "qiongjiu", "attachment_set_burn_boost");
  assert.equal(equipmentOf(s.characters[0]).activeAttachmentSet, "attachment_set_burn_boost", "only ONE active set — selecting replaces");
  s = setActiveAttachmentSet(s, "qiongjiu", undefined);
  assert.equal(equipmentOf(s.characters[0]).activeAttachmentSet, undefined, "cleared");
});

test("attachments: set selection is independent of the per-slot stats", () => {
  let s = setupWith();
  s = toggleAttachmentStat(s, "qiongjiu", "muzzle", "critDamage", 4);
  s = setActiveAttachmentSet(s, "qiongjiu", "attachment_set_tactical_calculus");
  const eq = equipmentOf(s.characters[0]);
  assert.deepEqual(eq.attachments, { muzzle: ["critDamage"] }, "slot stats unchanged by set selection");
  assert.equal(eq.activeAttachmentSet, "attachment_set_tactical_calculus");
  // Clearing the set leaves the slot stats intact.
  s = setActiveAttachmentSet(s, "qiongjiu", undefined);
  assert.deepEqual(equipmentOf(s.characters[0]).attachments, { muzzle: ["critDamage"] }, "slot stats survive set clearing");
});

// ---------------------------------------------------------------------------
// CATALOG — derived from engine data; only implemented sets are selectable
// ---------------------------------------------------------------------------

test("catalog: only `implemented === true` sets are presented as selectable (no hard-coded ids)", async () => {
  const d = await engineAttachmentData();
  const cat = buildAttachmentCatalog({
    slots: d.ATTACHMENT_SLOTS,
    slotMaxStats: d.ATTACHMENT_SLOT_MAX_STATS,
    slotAllowedStats: Object.fromEntries(d.ATTACHMENT_SLOTS.map((s) => [s, d.attachmentStatsForSlot(s)])),
    statDefs: d.ATTACHMENT_STAT_DEFS,
    sets: d.ATTACHMENT_SETS,
  });
  const implemented = d.ATTACHMENT_SETS.filter((s) => s.implemented).map((s) => s.id).sort();
  assert.equal(cat.sets.length, implemented.length, "exactly the implemented sets");
  assert.deepEqual(cat.sets.map((s) => s.id).sort(), implemented, "the selectable set ids ARE the implemented engine sets");
  const inert = d.ATTACHMENT_SETS.filter((s) => !s.implemented).map((s) => s.id);
  for (const id of inert) assert.equal(cat.sets.some((s) => s.id === id), false, `${id} (inert) must NOT be selectable`);
  assert.equal(cat.sets.length, 8, "the 8 consumed + validated sets");
});

test("catalog: four slots in order, with per-slot maxima + Muzzle-only Crit Damage", async () => {
  const d = await engineAttachmentData();
  const cat = buildAttachmentCatalog({
    slots: d.ATTACHMENT_SLOTS,
    slotMaxStats: d.ATTACHMENT_SLOT_MAX_STATS,
    slotAllowedStats: Object.fromEntries(d.ATTACHMENT_SLOTS.map((s) => [s, d.attachmentStatsForSlot(s)])),
    statDefs: d.ATTACHMENT_STAT_DEFS,
    sets: d.ATTACHMENT_SETS,
  });
  assert.deepEqual(cat.slots.map((s) => s.slot), ["muzzle", "sight", "foregrip", "underbarrel"], "the 4 confirmed slots in order");
  const muzzle = cat.slots.find((s) => s.slot === "muzzle");
  const sight = cat.slots.find((s) => s.slot === "sight");
  assert.equal(muzzle?.maxStats, 4, "Muzzle max = 4");
  assert.equal(sight?.maxStats, 3, "non-Muzzle max = 3");
  assert.ok(muzzle?.allowedStats.some((s) => s.kind === "critDamage"), "Muzzle allows Crit Damage");
  assert.ok(!sight?.allowedStats.some((s) => s.kind === "critDamage"), "non-Muzzle slots do NOT allow Crit Damage");
});

test("catalog: stat defs expose the engine max values (never invented in the UI)", async () => {
  const d = await engineAttachmentData();
  const cat = buildAttachmentCatalog({
    slots: d.ATTACHMENT_SLOTS,
    slotMaxStats: d.ATTACHMENT_SLOT_MAX_STATS,
    slotAllowedStats: Object.fromEntries(d.ATTACHMENT_SLOTS.map((s) => [s, d.attachmentStatsForSlot(s)])),
    statDefs: d.ATTACHMENT_STAT_DEFS,
    sets: d.ATTACHMENT_SETS,
  });
  const muzzle = cat.slots.find((s) => s.slot === "muzzle")!;
  for (const stat of muzzle.allowedStats) {
    assert.equal(stat.value, d.ATTACHMENT_STAT_DEFS[stat.kind].value, `${stat.kind}: value comes from ATTACHMENT_STAT_DEFS`);
  }
  const atk = muzzle.allowedStats.find((s) => s.kind === "attack")!;
  const atkPct = muzzle.allowedStats.find((s) => s.kind === "attackBoost")!;
  const crit = muzzle.allowedStats.find((s) => s.kind === "critDamage")!;
  assert.equal(atk.isPct, false, "flat Attack is not a percentage");
  assert.equal(atkPct.isPct, true, "Attack Boost is a percentage");
  assert.equal(crit.isPct, true, "Crit Damage is a percentage (fraction value)");
  assert.equal(crit.value, 0.15, "Crit Damage max value from engine data");
});

test("catalog: attachment stat labels use the repo-dominant 'Crit DMG' spelling (not 'Crit Damage')", async () => {
  const d = await engineAttachmentData();
  const cat = buildAttachmentCatalog({
    slots: d.ATTACHMENT_SLOTS,
    slotMaxStats: d.ATTACHMENT_SLOT_MAX_STATS,
    slotAllowedStats: Object.fromEntries(d.ATTACHMENT_SLOTS.map((s) => [s, d.attachmentStatsForSlot(s)])),
    statDefs: d.ATTACHMENT_STAT_DEFS,
    sets: d.ATTACHMENT_SETS,
  });
  const crit = cat.slots.find((s) => s.slot === "muzzle")!.allowedStats.find((s) => s.kind === "critDamage")!;
  assert.equal(crit.label, "Crit DMG", "the player-facing label matches the panel term used everywhere else");
  // The label is what the player reads; the engine stat KIND deliberately stays `critDamage`.
  assert.equal(crit.kind, "critDamage", "the engine identifier is unchanged by the display-label normalization");
});

// ---------------------------------------------------------------------------
// RENDERER — the Setup screen exposes the controls (presentation contract)
// ---------------------------------------------------------------------------

test("setup screen: the Attachments controls live INSIDE the Weapon section, under the selected weapon", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const s = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("Attachments <span"), "Attachments heading present");
  assert.ok(s.includes("attachment-section"), "attachments render as a subsection block");
  assert.ok(s.includes("attachments.slots.map"), "the four slot rows are derived from the engine catalog (not hard-coded)");
  assert.ok(s.includes("toggleAttachmentStat("), "slot pills toggle through the shared helper");
  assert.ok(s.includes("Active Attachment Set"), "the set selector is labelled separately from the slots");
  assert.ok(s.includes("attachment-set-select") && s.includes("attachments.sets.map"), "the set <select> is populated from the implemented sets");
  assert.ok(s.includes("setActiveAttachmentSet("), "set selection flows through the shared helper");

  // Location: the attachment block sits AFTER the Weapon legend and BEFORE the Common Keys legend —
  // i.e. inside the Weapon fieldset, directly under the selected weapon.
  const weaponLegend = s.indexOf("Weapon <span");
  const attachmentBlock = s.indexOf("attachment-section");
  const commonKeysLegend = s.indexOf("Common Keys ({equ.commonKeyIds");
  assert.ok(weaponLegend >= 0 && attachmentBlock > weaponLegend, "attachments come after the Weapon section heading");
  assert.ok(commonKeysLegend > attachmentBlock, "attachments come before the Common Keys section (still inside the Weapon section)");
  // The old standalone Attachments fieldset legend is gone — the heading is now an h4 subsection.
  assert.ok(s.includes("<h4 className=\"attachment-section-title\">"), "attachments use an h4 subsection heading");
  assert.ok(!/<legend>\s*Attachments/.test(s), "no Attachments <legend> (the standalone fieldset was removed)");
  assert.ok(!s.includes("attachment-set-multi") && !s.includes("attachment-sets.map"), "no multi-set controls (a single set <select>, not a multi-select)");
});
