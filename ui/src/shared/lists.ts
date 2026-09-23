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
  fixedKeys?: Array<{ id: string; name: string }>;
  expansionKey?: { id: string; name: string };
  affinityKey?: { id: string; name: string };
}

export function buildWeaponViews(weapons: WeaponSource[]): WeaponView[] {
  return weapons.map((w) => ({
    id: w.id,
    name: w.name,
    rarity: w.rarity,
    atkLvl60: w.atkLvl60,
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

export function buildCharacterMetaView(def: CharacterMetaSource): CharacterMetaView {
  return {
    id: def.id,
    name: def.name,
    ...(def.mobility !== undefined ? { mobility: def.mobility } : {}),
    ...(def.fixedKeys !== undefined ? { fixedKeys: def.fixedKeys.map((k) => ({ id: k.id, name: k.name })) } : {}),
    ...(def.expansionKey !== undefined ? { expansionKey: { id: def.expansionKey.id, name: def.expansionKey.name } } : {}),
    ...(def.affinityKey !== undefined ? { affinityKey: { id: def.affinityKey.id, name: def.affinityKey.name } } : {}),
  };
}

/** Convenience re-export for callers that only need the view types. */
export type { WeaponView, CommonKeyListResult, CommonKeyView, CharacterMetaView };