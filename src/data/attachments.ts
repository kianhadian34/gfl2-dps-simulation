import type { AttachmentConfig, AttachmentSlot, AttachmentStat } from "../model/types.js";

/**
 * WEAPON ATTACHMENT STATS (2026) — DATA STAGE ONLY (NOT consumed by the engine yet).
 *
 * The user selects which stat KINDS each attachment slot has; the VALUES are FIXED max-stat
 * competitive-simulator values (no random rolls / ranges / sub-maximal values). These constants are
 * the single source of truth for the stat kind → value + bucket mapping (docs/research.md §3.19).
 *
 * NOT modeled here (UNCONFIRMED — do NOT invent): attachment rolls/generation, rarity/tier,
 * per-attachment catalogs, or set effects. See docs/research.md §3.19 / U22.
 */

/** The 4 slots in display order. */
export const ATTACHMENT_SLOTS: AttachmentSlot[] = ["muzzle", "sight", "foregrip", "underbarrel"];

/**
 * Maximum number of UNIQUE selected stats per slot (CONFIRMED 2026): Muzzle 4; Sight / Foregrip /
 * Underbarrel 3.
 */
export const ATTACHMENT_SLOT_MAX_STATS: Record<AttachmentSlot, number> = {
  muzzle: 4,
  sight: 3,
  foregrip: 3,
  underbarrel: 3,
};

/**
 * The stat kinds available per slot (CONFIRMED 2026): the Muzzle may use the full pool INCLUDING
 * Crit Damage; Sight / Foregrip / Underbarrel use the shared NON-Crit-Damage pool. Crit Damage is
 * therefore the ONLY stat exclusive to the Muzzle.
 */
export const ATTACHMENT_SHARED_STATS: AttachmentStat[] = [
  "attack",
  "attackBoost",
  "health",
  "healthBoost",
  "defense",
  "defenseBoost",
  "critRate",
];
export const ATTACHMENT_MUZZLE_ONLY_STATS: AttachmentStat[] = ["critDamage"];

/** Stat kinds allowed in a given slot (Muzzle = shared + Muzzle-only; others = shared only). */
export function attachmentStatsForSlot(slot: AttachmentSlot): AttachmentStat[] {
  return slot === "muzzle"
    ? [...ATTACHMENT_SHARED_STATS, ...ATTACHMENT_MUZZLE_ONLY_STATS]
    : [...ATTACHMENT_SHARED_STATS];
}

/**
 * FIXED max-stat value + destination bucket per stat kind (CONFIRMED 2026). `bucket` names the
 * EXISTING engine bucket the value would fold into once consumption exists — no new bucket:
 *   flat ATK/HP/DEF → the panel FLAT bucket; `*Pct` → the panel PERCENTAGE buckets;
 *   critRate / critDmg → the existing panel crit stats.
 */
export interface AttachmentStatDef {
  kind: AttachmentStat;
  /** The fixed max value (fraction for percentages: 0.114 = 11.4%). */
  value: number;
  bucket: "atkFlat" | "hpFlat" | "defFlat" | "atkPct" | "hpPct" | "defPct" | "critRate" | "critDmg";
}

export const ATTACHMENT_STAT_DEFS: Record<AttachmentStat, AttachmentStatDef> = {
  attack: { kind: "attack", value: 72, bucket: "atkFlat" },
  attackBoost: { kind: "attackBoost", value: 0.114, bucket: "atkPct" },
  health: { kind: "health", value: 162, bucket: "hpFlat" },
  healthBoost: { kind: "healthBoost", value: 0.114, bucket: "hpPct" },
  defense: { kind: "defense", value: 48, bucket: "defFlat" },
  defenseBoost: { kind: "defenseBoost", value: 0.114, bucket: "defPct" },
  critRate: { kind: "critRate", value: 0.15, bucket: "critRate" },
  critDamage: { kind: "critDamage", value: 0.15, bucket: "critDmg" },
};

/**
 * Validate a per-slot attachment configuration against the confirmed contract. Returns a list of
 * human-readable problems (empty = valid). Pure + data-only — NOT yet wired into `createState`.
 *
 * Rules enforced (CONFIRMED 2026):
 *  - only known slots / stat kinds;
 *  - per-slot maximum unique stats (Muzzle 4; others 3);
 *  - NO duplicate stat kind within a slot;
 *  - Crit Damage only on the Muzzle.
 * Empty/absent slots are valid (they contribute no stats).
 */
export function validateAttachmentConfig(config: AttachmentConfig | undefined): string[] {
  const errors: string[] = [];
  if (!config) return errors;
  for (const [slot, stats] of Object.entries(config) as [AttachmentSlot, AttachmentStat[] | undefined][]) {
    if (!ATTACHMENT_SLOTS.includes(slot)) {
      errors.push(`unknown attachment slot: ${slot}`);
      continue;
    }
    if (stats === undefined) continue; // empty slot is valid
    const allowed = attachmentStatsForSlot(slot);
    const max = ATTACHMENT_SLOT_MAX_STATS[slot];
    if (stats.length > max) {
      errors.push(`${slot}: too many stats (${stats.length} > max ${max})`);
    }
    if (new Set(stats).size !== stats.length) {
      errors.push(`${slot}: duplicate stat kind`);
    }
    for (const s of stats) {
      if (!allowed.includes(s)) {
        errors.push(`${slot}: stat "${s}" is not allowed in this slot`);
      }
    }
  }
  return errors;
}
