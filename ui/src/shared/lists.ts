/**
 * PURE VIEW BUILDERS for the IPC data lists (2026).
 *
 * These functions shape ENGINE data (passed in by the Electron main process) into the
 * `WeaponView` / `CommonKeyView` / `CharacterMetaView` IPC payloads. They are:
 *   - ENGINE-FREE: they never import from ../../../src and accept only structural inputs,
 *     so this module is safe for the renderer bundle and the UI test build alike.
 *   - NON-AUTHORITATIVE: no validation happens here — unknown/invalid ids are carried
 *     VERBATIM so the ENGINE (simulateScenario/createState) rejects them; the UI never
 *     silently accepts or silently drops ids.
 * Weapon/key definitions are NOT duplicated here — ids/names/stats come from the engine data
 * the caller provides (src/data/weapons.ts / common-keys.ts / the character registry).
 */
import type {
  WeaponView,
  CommonKeyListResult,
  CommonKeyView,
  CharacterMetaView,
  WeaponCalibrationEffectView,
  AffinityKeyView,
  ExpansionKeyView,
  AttachmentCatalogView,
  AttachmentSlotView,
  AttachmentStatDefView,
  AttachmentStatView,
  AttachmentConfigView,
  AttachmentSlotRulesView,
  AttachmentSetView,
} from "./engine-types.js";

/** Structural engine weapon shape (satisfied by engine `WeaponDef`). */
export interface WeaponSource {
  id: string;
  name: string;
  rarity: string;
  atkLvl60: number;
  subStats?: Array<{ stat: "pctAtk" | "pctHp" | "pctDef"; value: number }>;
  ownerCharacterId?: string;
  calibrations?: Record<number, { damageDealt?: number; charging?: { perStackValue: number; maxStacks: number; stacksPerGain?: number } }>;
}

/** Structural engine Common-Key shape (satisfied by engine `CommonKeyDef`). */
export interface CommonKeySource {
  id: string;
  name: string;
  characterScope?: string;
  /**
   * Ordered stat slots (engine `CommonKeyDef.stats`, 2026 corrected model). Slot #0 (and any slot
   * before `fixedStatCount`) is the key's FIXED stat (`kind` present); later slots are
   * player-selectable (`kind` absent — the player picks the kind, the key fixes the value).
   */
  stats?: Array<{ kind?: string; value: number }>;
  /** How many leading stat slots are fixed (engine default 1). */
  fixedStatCount?: number;
  /** Engine secondary-effect shape; its recorded description and any executed `stat` payload surface to the UI. */
  secondaryEffect?: { description?: string; stats?: { atkPct?: number; critRate?: number; critDmg?: number; outOfTurnDmg?: number } };
}

/** Structural engine character shape (satisfied by engine `CharacterDef`). */
export interface CharacterMetaSource {
  id: string;
  name: string;
  mobility?: number;
  base?: { atk: number; hp: number; def: number; stability: number; critRate: number; critDmg: number };
  fixedKeys?: Array<{ id: string; name: string; description?: string }>;
  expansionKey?: { id: string; name: string; description?: string };
  affinityKey?: {
    id: string;
    name: string;
    levels?: Record<number, { critDmg?: number; atk?: number; hp?: number }>;
    genericBonus?: { atk?: number; hp?: number };
  };
  affinityLevelStats?: Record<number, { atkPct?: number; hpPct?: number; defPct?: number }>;
  /** STANDALONE character Affinity-LEVEL FLAT stats (engine `CharacterDef.affinityFlatStats`) — each
   *  level's PER-LEVEL increase; the contribution at level N is the cumulative sum of entries 1..N. */
  affinityFlatStats?: Record<number, { atk?: number; hp?: number; def?: number }>;
  skills?: {
    basic?: { id: string; name: string; description?: string; descriptions?: Record<number, string>; type?: string; element?: string | null; ammoType?: string };
    active1?: { id: string; name: string; description?: string; descriptions?: Record<number, string>; type?: string; element?: string | null; ammoType?: string };
    active2?: { id: string; name: string; description?: string; descriptions?: Record<number, string>; type?: string; element?: string | null; ammoType?: string };
    ultimate?: { id: string; name: string; description?: string; descriptions?: Record<number, string>; type?: string; element?: string | null; ammoType?: string };
  };
  fortificationMap?: Array<{ v: number; ability: string; toLevel: number }>;
  passive?: { playerDescription?: string; levelDescriptions?: Record<number, string> };
}

export function buildWeaponViews(weapons: WeaponSource[]): WeaponView[] {
  return weapons.map((w) => {
    const calibrationEffects: Record<number, WeaponCalibrationEffectView> = {};
    if (w.calibrations) {
      for (const [lv, eff] of Object.entries(w.calibrations)) {
        calibrationEffects[Number(lv)] = {
          ...(eff.damageDealt !== undefined ? { damageDealt: eff.damageDealt } : {}),
          ...(eff.charging ? { charging: { ...eff.charging } } : {}),
        };
      }
    }
    return {
      id: w.id,
      name: w.name,
      rarity: w.rarity,
      atkLvl60: w.atkLvl60,
      subStats: (w.subStats ?? []).map((s) => ({ ...s })),
      ...(w.ownerCharacterId !== undefined ? { ownerCharacterId: w.ownerCharacterId } : {}),
      calibrations: w.calibrations ? Object.keys(w.calibrations).map(Number).sort((a, b) => a - b) : [],
      calibrationEffects,
    };
  });
}

/** A text run of the Effect copy; `cal: true` marks a calibration-dependent value (rendered highlighted). */
export interface EffectSegment {
  text: string;
  cal?: boolean;
}

/** Renders the Effect template substituting the calibration-dependent numeric lists ({dmgs}/{stacks}/{gains}/{maxes})
 *  with a single value when `level` is selected, or the full C1–C6 list otherwise. All values come from the
 *  authoritative `WeaponDef.calibrations` data (never invented/duplicated). Calibration-dependent runs are
 *  returned as distinct segments (`cal: true`) so the UI can highlight them. */
export function effectCopyWithCalibration(w: WeaponView | undefined, template: string, level: number | undefined): EffectSegment[] {
  if (!w) return [{ text: template }];
  const at = (lv: number, f: (e: WeaponCalibrationEffectView) => number | undefined, fallback: number) => {
    const e = w.calibrationEffects[lv];
    return e ? f(e) ?? fallback : fallback;
  };
  const useSingle = level !== undefined && w.calibrations.includes(level);
  /** Single formatted value when a calibration is selected, otherwise the joined per-level list. */
  const values = (
    f: (e: WeaponCalibrationEffectView) => number | undefined,
    fallback: number,
    fmt: (n: number) => string,
  ) =>
    useSingle
      ? fmt(at(level, f, fallback))
      : w.calibrations.map((lv) => fmt(at(lv, f, fallback))).join("/");
  const pctFmt = (n: number) => `${Math.round(n * 100)}%`;
  const dmgs = values((e) => e.damageDealt, 0, pctFmt);
  const stacks = values((e) => e.charging?.perStackValue, 0, pctFmt);
  const gains = values((e) => e.charging?.stacksPerGain, 1, (n) => String(n));
  const maxes = values((e) => e.charging?.maxStacks, 0, (n) => String(n));
  const substituted: Record<string, string> = { dmgs, stacks, gains, maxes };
  const segments: EffectSegment[] = [];
  const re = /\{(dmgs|stacks|gains|maxes)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) segments.push({ text: template.slice(last, m.index) });
    segments.push({ text: substituted[m[1]], cal: true });
    last = m.index + m[0].length;
  }
  if (last < template.length) segments.push({ text: template.slice(last) });
  return segments;
}

export function buildCommonKeyViews(keys: CommonKeySource[], maxCommonKeys: number): CommonKeyListResult {
  return {
    items: keys.map((k) => ({
      id: k.id,
      name: k.name,
      ...(k.characterScope !== undefined ? { characterScope: k.characterScope } : {}),
      ...(k.stats ? { stats: k.stats.map((s) => ({ ...s })) } : {}),
      ...(k.fixedStatCount !== undefined ? { fixedStatCount: k.fixedStatCount } : {}),
      ...(k.secondaryEffect?.description !== undefined ? { secondaryEffect: k.secondaryEffect.description } : {}),
      ...(k.secondaryEffect?.stats !== undefined
        ? { secondaryStatLines: Object.entries(k.secondaryEffect.stats).map(([kind, v]) => `${COMMON_KEY_STAT_LABELS[kind] ?? kind} +${pct1(v ?? 0)}`) }
        : {}),
    })),
    maxCommonKeys,
  };
}

const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Structural engine attachment shapes (satisfied by `src/data/attachments.ts` / `attachment-sets.ts`). */
export interface AttachmentStatDefSource {
  kind: string;
  value: number;
  bucket: string;
}
export interface AttachmentSetSource {
  id: string;
  name: string;
  implemented: boolean;
}
export interface AttachmentCatalogSource {
  /** Slot ids in display order (engine `ATTACHMENT_SLOTS`). */
  slots: string[];
  /** Per-slot max unique stats (engine `ATTACHMENT_SLOT_MAX_STATS`). */
  slotMaxStats: Record<string, number>;
  /** Allowed stat kinds per slot (engine `attachmentStatsForSlot`). */
  slotAllowedStats: Record<string, string[]>;
  /** The stat definitions (engine `ATTACHMENT_STAT_DEFS`). */
  statDefs: Record<string, AttachmentStatDefSource>;
  /** The sets (engine `ATTACHMENT_SETS`); only `implemented === true` are surfaced. */
  sets: AttachmentSetSource[];
}

/** Human labels for the attachment slots + stat kinds (DISPLAY ONLY — values come from engine data). */
const ATTACHMENT_SLOT_LABELS: Record<string, string> = {
  muzzle: "Muzzle",
  sight: "Sight",
  foregrip: "Foregrip",
  underbarrel: "Underbarrel",
};
const ATTACHMENT_STAT_LABELS: Record<string, string> = {
  attack: "Attack",
  attackBoost: "Attack Boost",
  health: "Health",
  healthBoost: "Health Boost",
  defense: "Defense",
  defenseBoost: "Defense Boost",
  critRate: "Crit Rate",
  critDamage: "Crit Damage",
};

/**
 * Build the UI attachment catalog from engine data (2026). Non-authoritative display shaping: slot
 * labels, per-slot maxima, allowed stat kinds, the stat defs (with `isPct` derived from the engine
 * `bucket`), and ONLY the `implemented === true` sets as selectable. No stat value/rule is invented
 * here — everything comes from the engine source.
 */
export function buildAttachmentCatalog(src: AttachmentCatalogSource): AttachmentCatalogView {
  const statDef = (kind: string): AttachmentStatDefView => {
    const d = src.statDefs[kind];
    // Flat buckets end in "Flat" (atkFlat/hpFlat/defFlat); everything else (atkPct/hpPct/defPct/
    // critRate/critDmg) is a fraction → display as a percentage.
    const isPct = d !== undefined && !/Flat$/.test(d.bucket);
    return {
      kind,
      value: d?.value ?? 0,
      isPct,
      label: ATTACHMENT_STAT_LABELS[kind] ?? kind,
    };
  };
  return {
    slots: src.slots.map((slot) => ({
      slot: slot as AttachmentSlotView,
      label: ATTACHMENT_SLOT_LABELS[slot] ?? slot,
      maxStats: src.slotMaxStats[slot] ?? 0,
      allowedStats: (src.slotAllowedStats[slot] ?? []).map(statDef),
    })),
    sets: src.sets.filter((s) => s.implemented).map((s) => ({ id: s.id, name: s.name })),
  };
}

/** Stat-kind → display label (data-driven; never invented). */
const COMMON_KEY_STAT_LABELS: Record<string, string> = {
  atkPct: "Attack Boost",
  critRate: "Crit Rate",
  critDmg: "Crit DMG",
  outOfTurnDmg: "Out-of-Turn Damage",
};

/**
 * Player-facing stat lines a Common Key grants. Under the 2026 corrected model, slots before
 * `fixedStatCount` (default 1) are FIXED (their kind is shown); later slots are PLAYER-SELECTABLE
 * and rendered as an open slot ("‹choose a stat›"). Data-driven label map — never invented.
 */
export function commonKeyStatLines(k: CommonKeyView): string[] {
  const s = k.stats;
  if (!s) return [];
  const fixed = k.fixedStatCount ?? 1;
  return s.map((slot, i) => {
    if (i < fixed) {
      // FIXED slot: its kind is present and shown.
      const label = slot.kind !== undefined ? (COMMON_KEY_STAT_LABELS[slot.kind] ?? slot.kind) : "choose a stat";
      return `${label} +${pct1(slot.value)}`;
    }
    // SELECTABLE slot: the player picks the kind (data `kind` is not consulted) → shown open.
    return `(selectable) choose a stat +${pct1(slot.value)}`;
  });
}

/** The key's additional effect line: the recorded secondary-effect description when present, else
 *  an executed secondary `stat` payload rendered as its described effect (e.g. Strategic Negotiation's +7% out-of-turn). */
export function commonKeyEffectLine(k: CommonKeyView): string | undefined {
  if (k.secondaryEffect !== undefined) return k.secondaryEffect;
  if (k.secondaryStatLines !== undefined && k.secondaryStatLines.length > 0) return k.secondaryStatLines.join("; ");
  return undefined;
}

/**
 * Authoritative Fixed Key number from the ENGINE data id (`qiongjiu_fk1_concentration` → 1).
 * Pure/id-derived — never hardcoded in the renderer; absent when the id carries no `fk<N>`.
 */
export function fixedKeyNumber(id: string): number | undefined {
  const m = /fk(\d+)/.exec(id);
  return m ? Number(m[1]) : undefined;
}

/** Player-facing label: "Fixed Key <number> - <name>" (falls back to the plain name if no number). */
export function fixedKeyLabel(k: { id: string; name: string; number?: number }): string {
  const n = k.number ?? fixedKeyNumber(k.id);
  return n !== undefined ? `Fixed Key ${n} - ${k.name}` : k.name;
}

export function buildCharacterMetaView(def: CharacterMetaSource): CharacterMetaView {
  return {
    id: def.id,
    name: def.name,
    ...(def.mobility !== undefined ? { mobility: def.mobility } : {}),
    ...(def.base !== undefined ? { base: { ...def.base } } : {}),
    ...(def.fixedKeys !== undefined
      ? {
          fixedKeys: def.fixedKeys.map((k) => ({
            id: k.id,
            name: k.name,
            number: fixedKeyNumber(k.id),
            ...(k.description !== undefined ? { description: k.description } : {}),
          })),
        }
      : {}),
    ...(def.expansionKey !== undefined
      ? { expansionKey: { id: def.expansionKey.id, name: def.expansionKey.name, ...(def.expansionKey.description !== undefined ? { description: def.expansionKey.description } : {}) } }
      : {}),
    ...(def.affinityKey !== undefined
      ? {
          affinityKey: {
            id: def.affinityKey.id,
            name: def.affinityKey.name,
            ...(def.affinityKey.levels !== undefined
              ? {
                  levels: Object.fromEntries(
                    Object.entries(def.affinityKey.levels).map(([lv, s]) => [Number(lv), { ...s }]),
                  ),
                }
              : {}),
            ...(def.affinityKey.genericBonus !== undefined ? { genericBonus: { ...def.affinityKey.genericBonus } } : {}),
          },
        }
      : {}),
    ...(def.affinityLevelStats !== undefined
      ? {
          affinityLevelStats: Object.fromEntries(
            Object.entries(def.affinityLevelStats).map(([lv, s]) => [Number(lv), { ...s }]),
          ),
        }
      : {}),
    ...(def.affinityFlatStats !== undefined
      ? {
          affinityFlatStats: Object.fromEntries(
            Object.entries(def.affinityFlatStats).map(([lv, s]) => [Number(lv), { ...s }]),
          ),
        }
      : {}),
    ...(def.skills
      ? {
          skills: {
            ...(def.skills.basic ? { basic: { ...def.skills.basic } } : {}),
            ...(def.skills.active1 ? { active1: { ...def.skills.active1 } } : {}),
            ...(def.skills.active2 ? { active2: { ...def.skills.active2 } } : {}),
            ...(def.skills.ultimate ? { ultimate: { ...def.skills.ultimate } } : {}),
          },
        }
      : {}),
    ...(def.fortificationMap !== undefined ? { fortificationMap: def.fortificationMap.map((f) => ({ ...f })) } : {}),
    ...(def.passive !== undefined
      ? {
          passive: {
            ...(def.passive.playerDescription !== undefined ? { playerDescription: def.passive.playerDescription } : {}),
            ...(def.passive.levelDescriptions !== undefined ? { levelDescriptions: { ...def.passive.levelDescriptions } } : {}),
          },
        }
      : {}),
  };
}

/** Effective ability level for a slot at a given fortificationLevel — SAME semantics as the engine's
 *  `effectiveAbilityLevel` (basic always Lv1; highest `toLevel` with `v <= fortificationLevel`; else Lv1).
 *  Pure data over the character's engine-sourced `fortificationMap` — never hard-coded to a character. */
export function effectiveAbilityLevel(
  map: Array<{ v: number; ability: string; toLevel: number }> | undefined,
  slot: string,
  fortificationLevel: number,
): number {
  if (slot === "basic") return 1;
  let level = 1;
  for (const f of map ?? []) {
    if (f.ability === slot && f.v <= fortificationLevel && f.toLevel > level) level = f.toLevel;
  }
  return level;
}

/** Level-aware player-facing ability description for a rotation slot: the per-level in-game text when
 *  available, else the ability's top-level player description, else its name. Exact engine data only. */
export function rotationAbilityDescription(v: CharacterMetaView | undefined, slot: string, fortificationLevel: number): string {
  if (!v) return slot;
  const sk = v.skills?.[slot as "basic"];
  if (!sk) return slot;
  const lv = effectiveAbilityLevel(v.fortificationMap, slot, fortificationLevel);
  return sk.descriptions?.[lv] ?? sk.description ?? sk.name;
}

/** Level-aware player-facing PASSIVE description (per-level exact text, else the top-level Lv1/fallback). */
export function passiveDescription(v: CharacterMetaView, fortificationLevel: number): string | undefined {
  const lv = effectiveAbilityLevel(v.fortificationMap, "passive", fortificationLevel);
  return v.passive?.levelDescriptions?.[lv] ?? v.passive?.playerDescription;
}

/** STANDALONE character Affinity-LEVEL stat lines (engine `CharacterDef.affinityLevelStats` — confirmed
 *  mechanic: Lv5 none, Lv9 ATK/HP/DEF +5%). Data-driven only — no Qiongjiu values hardcoded here; missing
 *  stats for the level → no lines. Independent of the Affinity Key. */
export function affinityLevelStatLines(v: CharacterMetaView, level: number | undefined): string[] {
  const stats = level !== undefined ? v.affinityLevelStats?.[level] : undefined;
  if (!stats) return [];
  const lines: string[] = [];
  if (stats.atkPct !== undefined) lines.push(`ATK +${pct1(stats.atkPct)}`);
  if (stats.hpPct !== undefined) lines.push(`HP +${pct1(stats.hpPct)}`);
  if (stats.defPct !== undefined) lines.push(`DEF +${pct1(stats.defPct)}`);
  return lines;
}

/** The CHARACTER's recorded Affinity Levels (engine `CharacterDef.affinityLevelStats` keys — e.g.
 *  Qiongjiu {5, 9}), ascending. Data-driven: no levels are invented or interpolated, and the set is
 *  the character's OWN (independent of the equipped Affinity Key). Empty when the character records
 *  none. */
export function affinityLevels(v: CharacterMetaView | undefined): number[] {
  const stats = v?.affinityLevelStats;
  return stats ? Object.keys(stats).map(Number).sort((a, b) => a - b) : [];
}

/** STANDALONE character Affinity-LEVEL FLAT lines at `level` — the CUMULATIVE flat ATK/HP/DEF granted
 *  through that level (engine `CharacterDef.affinityFlatStats`: each entry is a PER-LEVEL increase, so
 *  the totals sum entries 1..N — e.g. Qiongjiu Lv.5 → ATK +115 / HP +292 / DEF +108). Data-driven:
 *  absent levels contribute nothing (no interpolation) and absent stats emit no line. Independent of
 *  the equipped Affinity Key. */
export function affinityLevelFlatLines(v: CharacterMetaView, level: number | undefined): string[] {
  if (level === undefined) return [];
  const totals = { atk: 0, hp: 0, def: 0 };
  for (let lv = 1; lv <= level; lv++) {
    const entry = v.affinityFlatStats?.[lv];
    if (!entry) continue;
    totals.atk += entry.atk ?? 0;
    totals.hp += entry.hp ?? 0;
    totals.def += entry.def ?? 0;
  }
  const lines: string[] = [];
  if (totals.atk !== 0) lines.push(`ATK +${totals.atk}`);
  if (totals.hp !== 0) lines.push(`HP +${totals.hp}`);
  if (totals.def !== 0) lines.push(`DEF +${totals.def}`);
  return lines;
}

/** Affinity Key stat lines. With `level` chosen, returns ONLY that level's stats (the stats the user is
 *  actually getting — engine `levels[level]`, exact levels only); without a level, all recorded levels +
 *  the foreign generic bonus (picker preview). */
export function affinityKeyStatLines(a: AffinityKeyView, level?: number): string[] {
  const lines: string[] = [];
  if (a.levels) {
    const statsOf = (s: { atk?: number; hp?: number; critDmg?: number }) => {
      const parts: string[] = [];
      if (s.atk !== undefined) parts.push(`ATK +${pct1(s.atk)}`);
      if (s.hp !== undefined) parts.push(`HP +${pct1(s.hp)}`);
      if (s.critDmg !== undefined) parts.push(`Crit DMG +${pct1(s.critDmg)}`);
      return parts;
    };
    if (level !== undefined) {
      const s = a.levels[level];
      if (!s) return []; // unrecorded level: nothing (no interpolation, engine-exact)
      return statsOf(s); // each stat on its own line — only what the user is getting
    }
    for (const [lv, s] of Object.entries(a.levels).sort(([x], [y]) => Number(x) - Number(y))) {
      for (const stat of statsOf(s)) lines.push(`Lv${lv} · ${stat}`);
    }
  }
  if (a.genericBonus && level === undefined) {
    if (a.genericBonus.atk !== undefined) lines.push(`Foreign · ATK +${pct1(a.genericBonus.atk)}`);
    if (a.genericBonus.hp !== undefined) lines.push(`Foreign · HP +${pct1(a.genericBonus.hp)}`);
  }
  return lines;
}

/** Expansion Key effect line — its authoritative in-game description (engine `KeyDef.description`). */
export function expansionKeyEffectLine(e: ExpansionKeyView | undefined): string | undefined {
  return e?.description;
}

/** Convenience re-export for callers that only need the view types. */
export type { WeaponView, CommonKeyListResult, CommonKeyView, CharacterMetaView, AffinityKeyView, ExpansionKeyView, AttachmentCatalogView, AttachmentSlotView, AttachmentStatView, AttachmentConfigView, AttachmentStatDefView, AttachmentSlotRulesView, AttachmentSetView };