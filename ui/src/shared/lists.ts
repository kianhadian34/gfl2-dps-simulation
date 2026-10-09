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
  CommonKeyStatOptionView,
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
  ApexCatalogView,
  ApexComponentView,
  PermanentCookingStatsView,
  RemolderBuffView,
  RemolderBuffLevelView,
  RemolderCatalogView,
  RemolderSetBonusView,
  RemolderPreviewView,
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
  /** PATTERN REMOLDER (2026): this character's Set Bonus definitions (`CharacterDef.remolderSetBonuses`). */
  remolderSetBonuses?: RemolderSetBonusSource[];
}

/** Structural engine Remolder Set Bonus shape (satisfied by engine `RemolderSetBonusDef`). */
export interface RemolderSetBonusSource {
  id: string;
  name: string;
  remolderLevel: number;
  requires: { bulwark: number; vanguard: number; support: number; sentinel: number };
  effects: RemolderEffectSource[];
}

/** Structural engine Remolder buff definition (satisfied by engine `RemolderBuffDef`). */
export interface RemolderBuffSource {
  id: string;
  name: string;
  category: string;
  source?: string;
  maxLevel: number;
  effects: Record<number, RemolderEffectSource[]>;
}

/** Structural engine Remolder effect (satisfied by engine `RemolderEffect`) — read structurally. */
export interface RemolderEffectSource {
  kind: string;
  value?: number;
  pct?: number;
  amount?: number;
  stat?: string;
  label?: string;
  atk?: number;
  hp?: number;
  durationRounds?: number;
  pctOfMaxHp?: number;
  capAtAtk?: boolean;
  count?: number;
  gates?: RemolderGatesSource;
}

/** Structural engine Remolder effect gates (satisfied by engine `RemolderEffectGates`). */
export interface RemolderGatesSource {
  actions?: string;
  category?: string;
  targetExposed?: boolean;
  skillTypes?: string[];
  bossTarget?: boolean;
  minDistance?: number;
  maxDistance?: number;
  enemiesWithin3?: { atLeast?: number; atMost?: number };
  element?: (string | null)[];
  anyPhase?: boolean;
  outOfTurn?: boolean;
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

/**
 * Stat-kind → display label (data-driven; never invented). Covers the player-selectable pool AND
 * the effect-only kinds (outOfTurnDmg).
 */
const COMMON_KEY_STAT_LABELS: Record<string, string> = {
  critRate: "Crit Rate",
  critDmg: "Crit DMG",
  hpPct: "Health Boost",
  defPct: "Defense Boost",
  atkPct: "Attack Boost",
  outOfTurnDmg: "Out-of-Turn Damage",
};

/** Fixed value every selectable Common Key stat grants (0.05 = 5.0%) — mirrors the key data. */
const COMMON_KEY_SELECTABLE_STAT_VALUE = 0.05;

/**
 * Build the player-selectable stat options for a Common Key's picker from the engine's selectable
 * pool (`COMMON_KEY_SELECTABLE_STAT_KINDS`). Kinds are the ONLY source; labels/values are display.
 */
export function buildCommonKeySelectableStats(kinds: string[], value = COMMON_KEY_SELECTABLE_STAT_VALUE): CommonKeyStatOptionView[] {
  return kinds.map((kind) => ({ kind, label: COMMON_KEY_STAT_LABELS[kind] ?? kind, value }));
}

export function buildCommonKeyViews(keys: CommonKeySource[], maxCommonKeys: number, selectableKinds: string[] = []): CommonKeyListResult {
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
    selectableStats: buildCommonKeySelectableStats(selectableKinds),
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

// ---------------------------------------------------------------------------
// APEX CHASSIS (2026) — Heavy Ordnance Corps, the ONE adapted part.
// Presentation shaping only: every value comes from the engine's `ApexComponentDef`; nothing is
// invented here (unknown kinds fall back to their raw id).
// ---------------------------------------------------------------------------

/** Structural engine Apex component shape (satisfied by engine `ApexComponentDef`). */
export interface ApexComponentSource {
  id: string;
  name: string;
  type: string;
  tier: number;
  maxEnhancement: number;
  stats: { atkPct?: number; hpPct?: number; defPct?: number; allElementBoost?: number };
  statIncrement: { atkPct?: number; hpPct?: number; defPct?: number; allElementBoost?: number };
  secondaryEffect?: {
    name: string;
    weaponTypeTerm?: { weaponType: string; value: number };
    weaknessExploitValue?: number;
  };
}

/** Apex stat-kind → display label (data-driven; never invented). */
const APEX_STAT_LABELS: Record<string, string> = {
  atkPct: "Attack Boost",
  hpPct: "Health Boost",
  defPct: "Defense Boost",
  allElementBoost: "All-Element Boost",
};

/** Weapon-type → display label, matching the game's weapon filter (2026). */
const APEX_WEAPON_TYPE_LABELS: Record<string, string> = {
  ar: "AR",
  smg: "SMG",
  sg: "SG",
  mg: "MG",
  rf: "RF",
  hg: "HG",
  bld: "BLD",
};

/** Order the stat lines consistently: the three % boosts first, then All-Element Boost. */
const APEX_STAT_ORDER = ["atkPct", "hpPct", "defPct", "allElementBoost"] as const;

/**
 * One Apex stat line: percentages render as "+2.5%", All-Element Boost is a FLAT value → "+75".
 * `isPct` decides the formatting; the value itself always comes from the engine data.
 */
function apexStatLine(kind: string, value: number): string {
  const label = APEX_STAT_LABELS[kind] ?? kind;
  return kind === "allElementBoost" ? `${label} +${value}` : `${label} +${(value * 100).toFixed(1)}%`;
}

/** The per-enhancement increment line for one stat (same formatting rules as `apexStatLine`). */
function apexIncrementLine(kind: string, value: number): string {
  return kind === "allElementBoost" ? `+${value} per enhancement` : `+${(value * 100).toFixed(1)}% per enhancement`;
}

/**
 * Build the UI Apex catalog from engine data (2026). Non-authoritative display shaping: the
 * component ids/names/stats/effects all come from the engine definitions the caller provides.
 */
export function buildApexCatalog(src: ApexComponentSource[], maxComponents: number): ApexCatalogView {
  return {
    items: src.map((c) => {
      const statLines = APEX_STAT_ORDER.filter((k) => c.stats[k] !== undefined).map((k) => apexStatLine(k, c.stats[k]!));
      const incrementLines = APEX_STAT_ORDER.filter((k) => c.statIncrement[k] !== undefined).map((k) => apexIncrementLine(k, c.statIncrement[k]!));
      const eff = c.secondaryEffect;
      const secondaryEffectLines: string[] = [];
      if (eff?.weaponTypeTerm) {
        const wt = APEX_WEAPON_TYPE_LABELS[eff.weaponTypeTerm.weaponType] ?? eff.weaponTypeTerm.weaponType;
        secondaryEffectLines.push(`Damage dealt by ${wt} Dolls +${(eff.weaponTypeTerm.value * 100).toFixed(1)}%`);
      }
      if (eff?.weaknessExploitValue !== undefined) {
        secondaryEffectLines.push(`If an attack exploits a weakness +${(eff.weaknessExploitValue * 100).toFixed(1)}%`);
      }
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        tier: c.tier,
        maxEnhancement: c.maxEnhancement,
        statLines,
        incrementLines,
        ...(eff ? { secondaryEffectName: eff.name } : {}),
        ...(secondaryEffectLines.length > 0 ? { secondaryEffectLines } : {}),
      };
    }),
    maxComponents,
  };
}

/**
 * Build the Permanent Cooking Stats view from the engine's values (`PERMANENT_COOKING_STATS`), plus
 * the player-facing stat lines shown in the UI. Engine-sourced — the UI never restates the numbers.
 */
export function buildPermanentCookingStatsView(src: { atk: number; hp: number; def: number }): PermanentCookingStatsView {
  return { atk: src.atk, hp: src.hp, def: src.def };
}

/** Player-facing lines for the Permanent Cooking Stats bonus (e.g. ["ATK +15", "HP +30", "DEF +15"]). */
export function cookingStatsLines(v: PermanentCookingStatsView | null | undefined): string[] {
  if (!v) return [];
  const lines: string[] = [];
  if (v.atk !== 0) lines.push(`ATK +${v.atk}`);
  if (v.hp !== 0) lines.push(`HP +${v.hp}`);
  if (v.def !== 0) lines.push(`DEF +${v.def}`);
  return lines;
}

// ---------------------------------------------------------------------------
// PATTERN REMOLDER (2026) — the "flower system" presented in the Setup UI.
// Presentation shaping ONLY: every buff id/name/category/max-level and every effect VALUE comes
// from the engine (`src/data/remolder.ts`). This module never restates or invents a number — it
// renders the engine's own effect vocabulary as display lines (the same pattern the Apex catalog
// uses). Category display order/labels are presentation; the category SET is engine-defined.
// ---------------------------------------------------------------------------

/** Display order of the four engine Remolder categories. */
const REMOLDER_CATEGORY_ORDER = ["bulwark", "vanguard", "support", "sentinel"] as const;
const REMOLDER_CATEGORY_LABELS: Record<string, string> = {
  bulwark: "Bulwark",
  vanguard: "Vanguard",
  support: "Support",
  sentinel: "Sentinel",
};
const REMOLDER_ELEMENT_LABELS: Record<string, string> = {
  burn: "Burn",
  hydro: "Hydro",
  electric: "Electric",
  freeze: "Freeze",
  corrosion: "Corrosion",
};
const REMOLDER_SKILL_TYPE_LABELS: Record<string, string> = {
  basic: "Basic attacks",
  active: "Active skills",
  ultimate: "Ultimate",
  support: "Support Actions",
};

/** Player-facing label for an engine Remolder category id (unknown ids fall back to the raw id). */
export function remolderCategoryLabel(category: string): string {
  return REMOLDER_CATEGORY_LABELS[category] ?? category;
}

/** Player-facing label for an engine stat key (atk/hp/def). */
function remolderStatLabel(stat: string | undefined): string {
  return stat === "atk" ? "ATK" : stat === "hp" ? "HP" : stat === "def" ? "DEF" : (stat ?? "");
}

/** Signed percentage from an engine fraction (e.g. 0.036 → "+3.6%", −0.05 → "−5.0%"). */
function remolderSignedPct(value: number | undefined): string {
  const v = value ?? 0;
  return `${v < 0 ? "−" : "+"}${pct1(Math.abs(v))}`;
}

/** The gate clause of an effect, from the engine's gate vocabulary (empty when ungated). */
function remolderGateSuffix(gates: RemolderGatesSource | undefined): string {
  if (!gates) return "";
  const parts: string[] = [];
  if (gates.actions === "support") parts.push("Support Actions");
  if (gates.category === "aoe") parts.push("AoE");
  else if (gates.category === "targeted") parts.push("Targeted");
  if (gates.targetExposed === true) parts.push("vs Stability-broken target");
  if (gates.skillTypes !== undefined) parts.push(gates.skillTypes.map((t) => REMOLDER_SKILL_TYPE_LABELS[t] ?? t).join(" / "));
  if (gates.bossTarget === true) parts.push("vs boss");
  if (gates.minDistance !== undefined) parts.push(`distance > ${gates.minDistance}`);
  if (gates.maxDistance !== undefined) parts.push(`distance ≤ ${gates.maxDistance}`);
  if (gates.enemiesWithin3 !== undefined) {
    const { atLeast, atMost } = gates.enemiesWithin3;
    if (atLeast !== undefined && atMost !== undefined && atLeast === atMost) parts.push(`exactly ${atLeast} enemy within 3 tiles`);
    else if (atLeast !== undefined && atMost !== undefined) parts.push(`${atLeast}–${atMost} enemies within 3 tiles`);
    else if (atLeast !== undefined) parts.push(`≥${atLeast} enemies within 3 tiles`);
    else if (atMost !== undefined) parts.push(`≤${atMost} enemies within 3 tiles`);
  }
  if (gates.element !== undefined || gates.anyPhase === true) {
    const names = (gates.element ?? []).map((e) => (e === null ? "Physical" : (REMOLDER_ELEMENT_LABELS[e] ?? String(e))));
    if (gates.anyPhase === true) names.push("Phase");
    parts.push([...new Set(names)].join(" or "));
  }
  if (gates.outOfTurn === true) parts.push("out-of-turn");
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/**
 * One engine Remolder effect rendered as a player-facing line. `pairedValue` supplies the strength
 * for the Unity marker kinds (whose value lives in the same level's stat_pct / additive_dealt).
 * Returns `undefined` for an unrecognised kind (never a fabricated line).
 */
export function remolderEffectLine(effect: RemolderEffectSource, pairedValue?: number): string | undefined {
  const g = remolderGateSuffix(effect.gates);
  switch (effect.kind) {
    case "additive_dealt":
      return `Damage dealt ${remolderSignedPct(effect.value)}${g}`;
    case "additive_taken":
      return `Damage taken ${remolderSignedPct(effect.value)}${g}`;
    case "multiplicative_taken":
      return `Damage taken ${remolderSignedPct(-(effect.value ?? 0))}${g}`;
    case "stat_pct":
      return `${remolderStatLabel(effect.stat)} ${remolderSignedPct(effect.value)}`;
    case "crit_rate":
      return `Crit Rate ${remolderSignedPct(effect.value)}`;
    case "crit_dmg":
      return `Crit DMG ${remolderSignedPct(effect.value)}`;
    case "crit_dmg_gated":
      return `Crit DMG ${remolderSignedPct(effect.value)}${g}`;
    case "heal_on_attack":
      return `On dealing damage: recover ${pct1(effect.pct ?? 0)} of ATK as HP`;
    case "first_target_stability":
      return `First damaged target each turn: Stability −${effect.amount}`;
    case "heal_end_of_action":
      return `End of action: recover ${pct1(effect.pct ?? 0)} of max HP`;
    case "stability_recovery":
      return `End of action: Stability +${effect.amount}`;
    case "flat_hp_from_base_atk":
      return `HP ${remolderSignedPct(effect.pct)} of INITIAL ATK (flat)`;
    case "flat_atk_from_base_hp":
      return `ATK ${remolderSignedPct(effect.pct)} of INITIAL max HP (flat)`;
    case "heal_bonus":
      return `Healing / shield dealt ${remolderSignedPct(effect.value)}`;
    case "ally_cleanse_stat_pct":
      return `On cleansing an ally: ATK ${remolderSignedPct(effect.atk)} / HP ${remolderSignedPct(effect.hp)} for ${effect.durationRounds} rounds`;
    case "reactive_damage":
      return `On taking damage: deal ${pct1(effect.pctOfMaxHp ?? 0)} of own max HP back to the attacker${effect.capAtAtk === true ? " (capped at 100% ATK)" : ""}`;
    case "out_of_turn_dmg":
      return `Out-of-turn damage ${remolderSignedPct(effect.value)}`;
    case "allied_stat_pct_battle_start":
      return `Battle start: the top-${effect.count} highest-ATK allied units gain ${remolderStatLabel(effect.stat)} ${remolderSignedPct(effect.value)}`;
    case "unity":
      return pairedValue !== undefined
        ? `Allied Unity: allies gain ${remolderStatLabel(effect.stat)} ${remolderSignedPct(pairedValue)} (strongest level wins; does not stack)`
        : `Allied Unity (${remolderStatLabel(effect.stat)})`;
    case "unity_dealt":
      return pairedValue !== undefined
        ? `Allied Unity: allies gain damage dealt ${remolderSignedPct(pairedValue)}${g}`
        : `Allied Unity: damage dealt${g}`;
    default:
      return undefined;
  }
}

/**
 * The display lines for ONE level's effect list. Unity marker kinds are paired with their same-level
 * strength value (the engine's own rule: Unity strength = the level's stat_pct / additive_dealt) and
 * that paired self-effect is NOT shown separately — it is not a self buff.
 */
export function remolderLevelLines(effects: RemolderEffectSource[]): string[] {
  const unity = effects.find((e) => e.kind === "unity");
  const unityValue = unity !== undefined ? effects.find((e) => e.kind === "stat_pct" && e.stat === unity.stat)?.value : undefined;
  const unityDealt = effects.find((e) => e.kind === "unity_dealt");
  const unityDealtValue = unityDealt !== undefined ? effects.find((e) => e.kind === "additive_dealt")?.value : undefined;
  const out: string[] = [];
  for (const e of effects) {
    // The paired self-effect of a Unity marker is the marker's STRENGTH — shown inside the Unity line.
    if (unity !== undefined && e.kind === "stat_pct" && e.stat === unity.stat) continue;
    if (unityDealt !== undefined && e.kind === "additive_dealt") continue;
    const line = e.kind === "unity" ? remolderEffectLine(e, unityValue) : e.kind === "unity_dealt" ? remolderEffectLine(e, unityDealtValue) : remolderEffectLine(e);
    if (line !== undefined) out.push(line);
  }
  return out;
}

/**
 * Build the UI Remolder catalog from the ENGINE's buff definitions. Levels are the exact keys the
 * engine defines (no interpolation); buffs are grouped into the engine's categories in the UI's
 * display order. Nothing is dropped: an unknown category is appended rather than silently lost.
 */
export function buildRemolderCatalog(buffs: RemolderBuffSource[]): RemolderCatalogView {
  const defined = [...new Set(buffs.map((b) => b.category))];
  const categories = [
    ...REMOLDER_CATEGORY_ORDER.filter((c) => defined.includes(c)),
    ...defined.filter((c) => !(REMOLDER_CATEGORY_ORDER as readonly string[]).includes(c)).sort(),
  ];
  const view = buffs.map((b): RemolderBuffView => {
    const levels: RemolderBuffLevelView[] = Object.keys(b.effects)
      .map(Number)
      .sort((a, b2) => a - b2)
      .map((level) => ({ level, lines: remolderLevelLines(b.effects[level] ?? []) }));
    return {
      id: b.id,
      name: b.name,
      category: b.category,
      ...(b.source !== undefined ? { source: b.source } : {}),
      maxLevel: b.maxLevel,
      levels,
    };
  });
  return { categories, buffs: categories.flatMap((c) => view.filter((v) => v.category === c)) };
}

/** Shape one engine Remolder Set Bonus definition for the UI (name/tier/requirements/effect lines). */
export function buildRemolderSetBonusView(set: RemolderSetBonusSource): RemolderSetBonusView {
  return {
    id: set.id,
    name: set.name,
    remolderLevel: set.remolderLevel,
    requires: { ...set.requires },
    lines: set.effects.map((e) => remolderEffectLine(e)).filter((l): l is string => l !== undefined),
  };
}

/** The category-total requirement line for a Set Bonus, e.g. "Bulwark 5 · Vanguard 9 · Sentinel 15". */
export function remolderRequirementLine(requires: { bulwark: number; vanguard: number; support: number; sentinel: number }): string {
  return (["bulwark", "vanguard", "support", "sentinel"] as const)
    .filter((c) => requires[c] > 0)
    .map((c) => `${remolderCategoryLabel(c)} ${requires[c]}`)
    .join(" · ");
}

/** The ENGINE-resolved category total for one category id (0 when no preview is available yet). */
export function remolderCategoryTotal(preview: RemolderPreviewView | null | undefined, category: string): number {
  return preview?.categoryTotals[category as keyof RemolderPreviewView["categoryTotals"]] ?? 0;
}

/** Total selected (active) levels across the four categories — a compact summary for a collapsed view. */
export function remolderTotalLevels(buffLevels: Record<string, number> | undefined): number {
  return Object.values(buffLevels ?? {}).reduce((sum, lv) => sum + (lv > 0 ? lv : 0), 0);
}

/**
 * A single player-facing Common Key stat line, tagged with its provenance so the UI can style it
 * differently: `fixed` (hardcoded stat), `chosen` (a player-selected kind), `empty` (a selectable
 * slot the player has not filled yet).
 */
export interface CommonKeyStatLine {
  text: string;
  state: "fixed" | "chosen" | "empty";
}

/**
 * Player-facing stat lines a Common Key grants. Under the 2026 corrected model, slots before
 * `fixedStatCount` (default 1) are FIXED (their kind is shown); later slots are PLAYER-SELECTABLE
 * and reflect the player's chosen kind (`chosenKinds`, in slot order) — an unchosen selectable slot
 * reads "‹choose a stat›". Data-driven label map — never invented.
 */
export function commonKeyStatLines(k: CommonKeyView, chosenKinds: string[] = []): CommonKeyStatLine[] {
  const s = k.stats;
  if (!s) return [];
  const fixed = k.fixedStatCount ?? 1;
  return s.map((slot, i): CommonKeyStatLine => {
    if (i < fixed) {
      // FIXED slot: its kind is present and shown.
      const label = slot.kind !== undefined ? (COMMON_KEY_STAT_LABELS[slot.kind] ?? slot.kind) : "choose a stat";
      return { text: `${label} +${pct1(slot.value)}`, state: "fixed" };
    }
    // SELECTABLE slot: show the player's chosen kind when present (the data `kind` is NOT consulted).
    const chosenKind = chosenKinds[i - fixed];
    if (chosenKind !== undefined) {
      const label = COMMON_KEY_STAT_LABELS[chosenKind] ?? chosenKind;
      return { text: `${label} +${pct1(slot.value)}`, state: "chosen" };
    }
    return { text: `(selectable) choose a stat +${pct1(slot.value)}`, state: "empty" };
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
    ...(def.remolderSetBonuses !== undefined
      ? { remolderSetBonuses: def.remolderSetBonuses.map(buildRemolderSetBonusView) }
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
export type { WeaponView, CommonKeyListResult, CommonKeyView, CommonKeyStatOptionView, CharacterMetaView, AffinityKeyView, ExpansionKeyView, AttachmentCatalogView, AttachmentSlotView, AttachmentStatView, AttachmentConfigView, AttachmentStatDefView, AttachmentSlotRulesView, AttachmentSetView, ApexCatalogView, ApexComponentView, PermanentCookingStatsView, RemolderBuffView, RemolderBuffLevelView, RemolderCatalogView, RemolderSetBonusView };