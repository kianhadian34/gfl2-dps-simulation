import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTACHMENT_SLOTS,
  ATTACHMENT_SLOT_MAX_STATS,
  ATTACHMENT_SHARED_STATS,
  ATTACHMENT_MUZZLE_ONLY_STATS,
  ATTACHMENT_STAT_DEFS,
  attachmentStatsForSlot,
  validateAttachmentConfig,
} from "../data/attachments.js";
import type { AttachmentConfig, AttachmentStat } from "../model/types.js";

/**
 * WEAPON ATTACHMENT CONFIGURATION CONTRACT (2026) — DATA STAGE (no engine consumption yet).
 *
 * Establishes the confirmed configuration contract BEFORE implementation:
 *  - 4 slots (muzzle / sight / foregrip / underbarrel); a slot may be empty;
 *  - per-slot maxima (Muzzle 4; Sight / Foregrip / Underbarrel 3);
 *  - no duplicate stat kind within a slot;
 *  - Crit Damage only on the Muzzle;
 *  - fixed max-stat values mapped to the EXISTING panel buckets (no new bucket);
 *  - the active Attachment Set is a SEPARATE loadout-level selection (not per slot).
 *
 * These tests do NOT touch the damage formula, the panel path, or any existing math oracle — the
 * engine does not consume attachments yet (docs/research.md §3.19 / U22). Aggregation is proven on
 * a CONTROLLED fixture using the existing `computePanel`/`finalStat` path only.
 */

const valid = (config: AttachmentConfig) => {
  assert.deepEqual(validateAttachmentConfig(config), [], "expected a valid configuration");
};
const invalid = (config: AttachmentConfig, msg: RegExp) => {
  const errors = validateAttachmentConfig(config);
  assert.ok(errors.some((e) => msg.test(e)), `expected an error matching ${msg}, got: ${JSON.stringify(errors)}`);
};

// 1. Slot configuration limits --------------------------------------------------------------

test("slot limits: Muzzle accepts up to 4 stats; Sight/Foregrip/Underbarrel up to 3; exceeding is rejected", () => {
  assert.equal(ATTACHMENT_SLOT_MAX_STATS.muzzle, 4);
  assert.equal(ATTACHMENT_SLOT_MAX_STATS.sight, 3);
  assert.equal(ATTACHMENT_SLOT_MAX_STATS.foregrip, 3);
  assert.equal(ATTACHMENT_SLOT_MAX_STATS.underbarrel, 3);

  // At the limit → valid.
  valid({ muzzle: ["attack", "attackBoost", "health", "critDamage"] });
  valid({ sight: ["attack", "attackBoost", "health"] });
  valid({ foregrip: ["defense", "defenseBoost", "critRate"] });
  valid({ underbarrel: ["health", "healthBoost", "defense"] });

  // One past the limit → rejected (Muzzle 5; others 4).
  invalid({ muzzle: ["attack", "attackBoost", "health", "healthBoost", "critDamage"] }, /muzzle: too many stats/);
  invalid({ sight: ["attack", "attackBoost", "health", "healthBoost"] }, /sight: too many stats/);
  invalid({ foregrip: ["attack", "attackBoost", "health", "defense"] }, /foregrip: too many stats/);
  invalid({ underbarrel: ["attack", "attackBoost", "health", "defense"] }, /underbarrel: too many stats/);
});

// 2. Stat uniqueness ------------------------------------------------------------------------

test("stat uniqueness: duplicate stat kinds within a slot are rejected; distinct stats are allowed", () => {
  invalid({ sight: ["attack", "attack"] }, /sight: duplicate stat kind/);
  invalid({ muzzle: ["health", "health", "attack", "critDamage"] }, /muzzle: duplicate stat kind/);
  valid({ sight: ["attack", "health", "defense"] }); // three distinct kinds
});

// 3. Slot-specific stat availability --------------------------------------------------------

test("Crit Damage is valid on Muzzle only; rejected on Sight / Foregrip / Underbarrel", () => {
  valid({ muzzle: ["critDamage"] });
  invalid({ sight: ["critDamage"] }, /sight: stat "critDamage" is not allowed/);
  invalid({ foregrip: ["critDamage"] }, /foregrip: stat "critDamage" is not allowed/);
  invalid({ underbarrel: ["critDamage"] }, /underbarrel: stat "critDamage" is not allowed/);

  // The pool contract: Crit Damage is the ONLY Muzzle-exclusive stat.
  assert.deepEqual(ATTACHMENT_MUZZLE_ONLY_STATS, ["critDamage"]);
  for (const slot of ["sight", "foregrip", "underbarrel"] as const) {
    assert.deepEqual(attachmentStatsForSlot(slot), ATTACHMENT_SHARED_STATS, `${slot} uses the shared pool`);
    assert.ok(!attachmentStatsForSlot(slot).includes("critDamage"), `${slot} must NOT allow critDamage`);
  }
  assert.ok(attachmentStatsForSlot("muzzle").includes("critDamage"), "muzzle allows critDamage");
  for (const s of ATTACHMENT_SHARED_STATS) {
    assert.ok(attachmentStatsForSlot("muzzle").includes(s), `muzzle also allows the shared stat ${s}`);
  }
});

// 4. Empty slots ----------------------------------------------------------------------------

test("empty slots: absent / empty config is valid and contributes no stats", () => {
  valid({}); // no slots
  valid({ muzzle: [] }); // explicitly empty slot
  assert.deepEqual(validateAttachmentConfig(undefined), [], "no config at all is valid");
  assert.deepEqual(validateAttachmentConfig({}), [], "empty config is valid");
});

// 5. Valid combinations ---------------------------------------------------------------------

test("valid combinations: full 4-slot loadout and partial loadouts are accepted", () => {
  valid({
    muzzle: ["attack", "attackBoost", "critRate", "critDamage"], // 4
    sight: ["attack", "health", "critRate"], // 3
    foregrip: ["defense", "defenseBoost", "healthBoost"], // 3
    underbarrel: ["health", "healthBoost", "defense"], // 3
  });
  // Partial: only some slots populated.
  valid({ muzzle: ["attack"] });
  valid({ sight: ["critRate"], underbarrel: ["defense"] });
});

// 6. Fixed max-stat mapping -----------------------------------------------------------------

test("fixed max-stat mapping: every kind maps to the confirmed value and the existing bucket", () => {
  const expected: Record<AttachmentStat, { value: number; bucket: string }> = {
    attack: { value: 72, bucket: "atkFlat" },
    attackBoost: { value: 0.114, bucket: "atkPct" },
    health: { value: 162, bucket: "hpFlat" },
    healthBoost: { value: 0.114, bucket: "hpPct" },
    defense: { value: 48, bucket: "defFlat" },
    defenseBoost: { value: 0.114, bucket: "defPct" },
    critRate: { value: 0.15, bucket: "critRate" },
    critDamage: { value: 0.15, bucket: "critDmg" },
  };
  for (const [kind, exp] of Object.entries(expected) as [AttachmentStat, { value: number; bucket: string }][]) {
    assert.equal(ATTACHMENT_STAT_DEFS[kind].value, exp.value, `${kind}: value`);
    assert.equal(ATTACHMENT_STAT_DEFS[kind].bucket, exp.bucket, `${kind}: bucket`);
  }
});

// 7. Aggregation (controlled fixture — existing panel path only) ----------------------------

test("aggregation: selected attachment stats sum into the existing panel buckets (controlled fixture)", async () => {
  const { computePanel } = await import("../engine/state.js");
  // Controlled base: a bare CharacterDef-like shape with a pinned base and NO other sources.
  const def = { base: { atk: 1000, hp: 2000, def: 500, stability: 9, critRate: 0.2, critDmg: 0.2 } } as never;

  // Flat bucket (attack + health + defense) summed BEFORE the percentage multiply.
  const flat = { atk: ATTACHMENT_STAT_DEFS.attack.value, hp: ATTACHMENT_STAT_DEFS.health.value, def: ATTACHMENT_STAT_DEFS.defense.value };
  const p1 = computePanel(def, null, undefined, undefined, undefined, flat);
  assert.equal(p1.atk, Math.ceil(1000 + 72), "flat ATK +72 into the flat bucket");
  assert.equal(p1.hp, Math.ceil(2000 + 162), "flat HP +162 into the flat bucket");
  assert.equal(p1.def, Math.ceil(500 + 48), "flat DEF +48 into the flat bucket");

  // Percentage bucket (attackBoost) applied AFTER the flat sum, via the existing formula.
  const p2 = computePanel(def, { id: "w", name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [{ stat: "pctAtk", value: 0.114 }] } as never);
  assert.equal(p2.atk, Math.ceil(1000 * (1 + 0.114)), "ATK Boost +11.4% via the existing pctAtk path");

  // Crit Rate / Crit DMG are panel stats (not part of computePanel) — pinned via the def values.
  assert.equal(0.2 + ATTACHMENT_STAT_DEFS.critRate.value, 0.35, "Crit Rate +15% is additive on the panel crit rate");
  assert.equal(0.2 + ATTACHMENT_STAT_DEFS.critDamage.value, 0.35, "Crit DMG +15% is additive on the panel crit dmg");
});

// 8. Damage formula untouched ---------------------------------------------------------------

test("damage formula: attachment stat defs declare buckets only — no new damage formula/bucket", () => {
  // Every bucket name is an EXISTING engine bucket (flat / percentage / crit) — none is a new one.
  const existing = new Set(["atkFlat", "hpFlat", "defFlat", "atkPct", "hpPct", "defPct", "critRate", "critDmg"]);
  for (const def of Object.values(ATTACHMENT_STAT_DEFS)) {
    assert.ok(existing.has(def.bucket), `bucket ${def.bucket} must be an existing engine bucket`);
  }
  // The allowed bucket set is EXACTLY the panel-stat buckets — it contains NO damage-dealt (DMG%)
  // bucket. Set effects (which use the DMG% bucket) are a SEPARATE concern, not attachment stats.
  assert.deepEqual([...existing].filter((b) => /dealt/i.test(b)), [], "no damage-dealt (DMG%) bucket exists among attachment stat buckets");
  const used = new Set(Object.values(ATTACHMENT_STAT_DEFS).map((d) => d.bucket));
  for (const b of used) assert.ok(existing.has(b), `used bucket ${b} is a panel-stat bucket`);
});

// 9. Active Attachment Set (config-level only) ----------------------------------------------

test("active Attachment Set: a separate loadout-level selection, not per slot, independent of stats", async () => {
  const { ATTACHMENT_SETS } = await import("../data/attachment-sets.js");
  const { validateAttachmentConfig: validate } = await import("../data/attachments.js");

  // A loadout carries the set SEPARATELY from the per-slot stats.
  const loadout = { attachments: { muzzle: ["attack"] } as AttachmentConfig, activeAttachmentSet: ATTACHMENT_SETS[0].id };

  // The set id is NOT a slot, and NOT a per-slot field: the config validator never sees it.
  assert.ok(!ATTACHMENT_SLOTS.includes(loadout.activeAttachmentSet as never), "the set id is not a slot");
  assert.deepEqual(validate(loadout.attachments), [], "the active set does not affect stat-config validity");

  // Stat selection is identical with and without an active set (independence).
  const withSet = { attachments: { sight: ["critRate"] } as AttachmentConfig, activeAttachmentSet: ATTACHMENT_SETS[1].id };
  const withoutSet = { attachments: { sight: ["critRate"] } as AttachmentConfig };
  assert.deepEqual(validate(withSet.attachments), validate(withoutSet.attachments), "the set does not change stat validity");
});
