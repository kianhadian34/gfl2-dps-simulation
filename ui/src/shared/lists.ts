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
  stats?: { atkPct?: number; critRate?: number; critDmg?: number; outOfTurnDmg?: number };
  /** Engine secondary-effect shape; only its recorded description is surfaced to the UI. */
  secondaryEffect?: { description?: string };
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
      ...(k.stats ? { stats: { ...k.stats } } : {}),
      ...(k.secondaryEffect?.description !== undefined ? { secondaryEffect: k.secondaryEffect.description } : {}),
    })),
    maxCommonKeys,
  };
}

const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Player-facing stat lines a Common Key grants (data-driven label map over `stats`; never invented). */
export function commonKeyStatLines(k: CommonKeyView): string[] {
  const s = k.stats;
  if (!s) return [];
  const lines: string[] = [];
  if (s.atkPct !== undefined) lines.push(`Attack Boost +${pct1(s.atkPct)}`);
  if (s.critRate !== undefined) lines.push(`Crit Rate +${pct1(s.critRate)}`);
  if (s.critDmg !== undefined) lines.push(`Crit DMG +${pct1(s.critDmg)}`);
  return lines;
}

/** The key's additional effect line: the recorded secondary effect when present, else the out-of-turn
 *  damage stat (Golden Melody/Strategic Negotiation source data grants it as the effect component). */
export function commonKeyEffectLine(k: CommonKeyView): string | undefined {
  if (k.secondaryEffect !== undefined) return k.secondaryEffect;
  if (k.stats?.outOfTurnDmg !== undefined) return `+${pct1(k.stats.outOfTurnDmg)} damage dealt outside the unit's own turn`;
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
  };
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
export type { WeaponView, CommonKeyListResult, CommonKeyView, CharacterMetaView, AffinityKeyView, ExpansionKeyView };