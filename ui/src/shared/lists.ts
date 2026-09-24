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
} from "./engine-types.js";

/** Structural engine weapon shape (satisfied by engine `WeaponDef`). */
export interface WeaponSource {
  id: string;
  name: string;
  rarity: string;
  atkLvl60: number;
  subStats?: Array<{ stat: "pctAtk" | "pctHp" | "pctDef"; value: number }>;
  ownerCharacterId?: string;
  calibrations?: Record<number, unknown>;
}

/** Structural engine Common-Key shape (satisfied by engine `CommonKeyDef`). */
export interface CommonKeySource {
  id: string;
  name: string;
  characterScope?: string;
}

/** Structural engine character shape (satisfied by engine `CharacterDef`). */
export interface CharacterMetaSource {
  id: string;
  name: string;
  mobility?: number;
  base?: { atk: number; hp: number; def: number; stability: number; critRate: number; critDmg: number };
  fixedKeys?: Array<{ id: string; name: string; description?: string }>;
  expansionKey?: { id: string; name: string };
  affinityKey?: { id: string; name: string };
}

export function buildWeaponViews(weapons: WeaponSource[]): WeaponView[] {
  return weapons.map((w) => ({
    id: w.id,
    name: w.name,
    rarity: w.rarity,
    atkLvl60: w.atkLvl60,
    subStats: (w.subStats ?? []).map((s) => ({ ...s })),
    ...(w.ownerCharacterId !== undefined ? { ownerCharacterId: w.ownerCharacterId } : {}),
    calibrations: w.calibrations ? Object.keys(w.calibrations).map(Number).sort((a, b) => a - b) : [],
  }));
}

export function buildCommonKeyViews(keys: CommonKeySource[], maxCommonKeys: number): CommonKeyListResult {
  return {
    items: keys.map((k) => ({
      id: k.id,
      name: k.name,
      ...(k.characterScope !== undefined ? { characterScope: k.characterScope } : {}),
    })),
    maxCommonKeys,
  };
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
    ...(def.expansionKey !== undefined ? { expansionKey: { id: def.expansionKey.id, name: def.expansionKey.name } } : {}),
    ...(def.affinityKey !== undefined ? { affinityKey: { id: def.affinityKey.id, name: def.affinityKey.name } } : {}),
  };
}

/** Convenience re-export for callers that only need the view types. */
export type { WeaponView, CommonKeyListResult, CommonKeyView, CharacterMetaView };