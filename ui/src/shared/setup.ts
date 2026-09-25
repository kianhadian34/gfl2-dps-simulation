/**
 * Pure scenario-builder for the Simulation Setup screen (v0.1).
 * Produces an engine-contract ScenarioView from the form state. No engine logic here —
 * the engine decides legality/behavior; this module only maps the form into the contract.
 *
 * WEAKNESSES (2026): the authoritative weakness system is
 *   Phase — Burn, Hydro, Freeze, Electric, Corrosion
 *   Ammo  — Heavy / Medium / Light / Shotgun / Melee
 * The engine element vocabulary is exactly the five phases `burn | hydro | freeze |
 * electric | corrosion` (ice→freeze and acid→corrosion were renames; hydro is distinct).
 * `physical` and `decay` are REMOVED from the taxonomy: "Physical" is the Ammo Weakness
 * dimension (AmmoType) — phase-less attacks carry `element: null`; Decay is not part of
 * the project taxonomy. Ammo weaknesses map 1:1 onto the engine `AmmoType` union and flow
 * through `dummy.weaknessTags`. Phase and Ammo are separate dimensions.
 */
import type { ScenarioView } from "./engine-types.js";
import { sampleScenario } from "./sample-scenario.js";

export type RotationSlot = "basic" | "active1" | "active2" | "ultimate";
export const ROTATION_SLOTS: RotationSlot[] = ["basic", "active1", "active2", "ultimate"];

/**
 * Authoritative PHASE weakness options. `elementId` is the engine Element it maps to
 * (absent => the engine has no representation for it; never mapped to a wrong element).
 */
export const PHASE_WEAKNESSES: Array<{ label: string; elementId: string }> = [
  { label: "Burn", elementId: "burn" },
  { label: "Hydro", elementId: "hydro" },
  { label: "Freeze", elementId: "freeze" },
  { label: "Electric", elementId: "electric" },
  { label: "Corrosion", elementId: "corrosion" },
];

/** Authoritative AMMO weakness options — engine `AmmoType` 1:1. */
export const AMMO_WEAKNESSES: Array<{ label: string; tag: string }> = [
  { label: "Heavy Ammo", tag: "heavy_ammo" },
  { label: "Medium Ammo", tag: "medium_ammo" },
  { label: "Light Ammo", tag: "light_ammo" },
  { label: "Shotgun Ammo", tag: "shotgun_ammo" },
  { label: "Melee", tag: "melee" },
];

/** Engine elements that can actually serve as phase weaknesses (Phase Weakness dimension only). */
export const REPRESENTABLE_PHASE_IDS = PHASE_WEAKNESSES.map((p) => p.elementId);

export interface SetupCharacter {
  id: string;
  name: string;
  selected: boolean;
  /** Engine Mobility stat (engine-sourced via listCharacters). Absent = the unit cannot move; scripted grid moves are stripped for it. */
  mobility?: number;
  /**
   * Member-level equipment/loadout carried VERBATIM into the engine contract (plumbing for
   * future controls; 2026). IDs are NOT validated here — the ENGINE (simulateScenario /
   * createState) rejects unknown ids and enforces all limits (e.g. max 3 Common Keys,
   * calibration C1–C6, calibration-without-weapon). Absent = no equipment (unchanged
   * pre-weapon behavior).
   */
  equipment?: SetupEquipment;
}

/** Loadout fields mirrored 1:1 from the engine `ScenarioTeamMember` contract (src/model/types.ts:739). */
export interface SetupEquipment {
  weaponId?: string;
  /** Calibration level of the EQUIPPED weapon (C1–C6 = 1–6). */
  calibrationLevel?: number;
  /** Common Key ids — up to 3 (engine-enforced); fewer valid. */
  commonKeyIds?: string[];
  /** Fixed Keys — ids only; the engine's existing representation and validation. */
  equippedFixedKeys?: string[];
  expansionKeyId?: string;
  affinityKeyId?: string;
  /** Affinity Level with the equipped key (exact levels only; engine-defined). */
  affinityLevel?: number;
}

/** Fresh engine character rows (sim:listCharacters) vs the user's CURRENT setup: KEEP the user's
 *  selection/equipment for characters that still exist (no wipe on remount or on app-start restore);
 *  brand-new engine characters join unselected; mobility stays engine-sourced. */
export function mergeFreshCharacters(
  existing: SetupCharacter[],
  fresh: Array<{ id: string; name: string; mobility?: number }>,
): SetupCharacter[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  return fresh.map((c) => {
    const prev = byId.get(c.id);
    const merged: SetupCharacter = {
      id: c.id,
      name: c.name,
      selected: prev?.selected ?? false,
      ...(c.mobility !== undefined ? { mobility: c.mobility } : {}),
      ...(prev?.equipment !== undefined ? { equipment: prev.equipment } : {}),
    };
    return merged;
  });
}

export interface SetupState {
  turns: number;
  seed: number;
  /** Character Fortification level (V) for the run — GLOBAL scenario config, default V0 (all
   *  abilities at Level 1/baseline). Independent of Affinity/keys; QJ's map covers V1–V6. */
  fortificationLevel: number;
  dummy: { hp: number; defense: number; stability: number; weaknesses: string[]; ammoWeaknesses: string[] };
  characters: SetupCharacter[];
  /** Fixed rotation per selected character id. */
  rotations: Record<string, RotationSlot[]>;
  gridEnabled: boolean;
  /** DEBUG MODE (controlled testing, 2026): an EXPLICIT configuration path that relaxes the
   *  normal equipment requirements and allows manual base-stat overrides. It never adds keys,
   *  weapons, buffs or stat modifiers by itself; the engine remains authoritative. */
  debug: DebugSetup;
}

// ---------------------------------------------------------------------------
// DEBUG MODE (2026) — per-character controlled base stats.
// The INITIAL values come from the selected character's engine `CharacterDef.base`
// (via sim:listCharacters → CharacterMetaView.base). Only fields the user actually
// EDITED (`touched`) are emitted as `baseStatOverrides` — never derived panel stats.
// ---------------------------------------------------------------------------
export type DebugStatKey = "atk" | "hp" | "def" | "stability" | "critRate" | "critDmg";
export type DebugBaseStats = Record<DebugStatKey, number>;

export interface DebugMemberConfig {
  /** Current entered values (seeded from the character's real CharacterDef.base). */
  values: DebugBaseStats;
  /** Fields the user actually edited — ONLY these reach the engine as overrides. */
  touched: Partial<Record<DebugStatKey, true>>;
}

export interface DebugSetup {
  enabled: boolean;
  baseStats: Record<string, DebugMemberConfig>;
}

export const DEBUG_STAT_KEYS: DebugStatKey[] = ["atk", "hp", "def", "stability", "critRate", "critDmg"];

export function seedDebugBaseStats(setup: SetupState, baseById: Record<string, DebugBaseStats>): SetupState {
  let changed = false;
  const baseStats = { ...setup.debug.baseStats };
  for (const [id, base] of Object.entries(baseById)) {
    if (baseStats[id]) continue;
    baseStats[id] = { values: { ...base }, touched: {} }; // seeded, NOT touched — no accidental overrides
    changed = true;
  }
  return changed ? { ...setup, debug: { ...setup.debug, baseStats } } : setup;
}

export function setDebugEnabled(setup: SetupState, enabled: boolean): SetupState {
  return { ...setup, debug: { ...setup.debug, enabled } };
}

/** Record an edited base stat (marks the field `touched` so ONLY it becomes an override). */
export function setDebugBaseStat(setup: SetupState, charId: string, key: DebugStatKey, value: number): SetupState {
  const cur = setup.debug.baseStats[charId];
  if (!cur) return setup; // no seeded values yet (character meta not loaded)
  return {
    ...setup,
    debug: {
      ...setup.debug,
      baseStats: {
        ...setup.debug.baseStats,
        [charId]: { values: { ...cur.values, [key]: value }, touched: { ...cur.touched, [key]: true } },
      },
    },
  };
}

export type DebugBaseStatOverrides = { atk?: number; hp?: number; def?: number; stability?: number; critRate?: number; critDmg?: number };

/** The DEBUG override object for a character (only fields the user EDITED; {} when Debug Mode is off). */
export function debugBaseStatOverrides(setup: SetupState, charId: string): DebugBaseStatOverrides {
  const cfg = setup.debug.baseStats[charId];
  if (!setup.debug.enabled || !cfg) return {};
  const out: DebugBaseStatOverrides = {};
  for (const key of DEBUG_STAT_KEYS) if (cfg.touched[key]) out[key] = cfg.values[key];
  return out;
}

export const DEFAULT_SETUP: SetupState = {
  // Default simulation length: 7 turns (the MVP cap). Users may still choose 1–7.
  turns: 7,
  seed: 7,
  // Fortification default V0 — all abilities at Level 1/baseline (engine behavior).
  fortificationLevel: 0,
  dummy: { hp: 999999999, defense: 5000, stability: 6, weaknesses: [], ammoWeaknesses: [] },
  characters: [],
  rotations: {},
  gridEnabled: false,
  debug: { enabled: false, baseStats: {} },
};

// ---------------------------------------------------------------------------
// DOLL EQUIPMENT SELECTION (2026) — UI-LOCAL state helpers.
// These functions only shape `SetupState`; they NEVER validate ids against the
// engine (the ENGINE remains the single validator). Caps here are UI/local-only:
//   - Fixed Keys: 0–3 (UI requirement; the engine stores ids freely).
//   - Common Keys: 0–3 (engine MAX_COMMON_KEYS = 3; engine also enforces).
//   - Expansion Keys: 0–1 (ENGINE CONTRACT: a single `expansionKeyId`;
//     the requested "0–2" is NOT representable — reported, not invented).
//   - Weapon: exactly 1 (empty = the engine-valid "no weapon" legacy state).
//   - Affinity Key: exactly 1 (engine `affinityKeyId`; `affinityLevel` untouched).
// ---------------------------------------------------------------------------
export const MAX_FIXED_KEYS = 3;
export const MAX_COMMON_KEYS_UI = 3; // mirrors the engine 3 Common Key Slots
/** Engine contract = ONE `expansionKeyId` per member (0–2 requirement NOT representable — see report). */
export const MAX_EXPANSION_KEYS = 1;
/** Engine calibration range C1–C6 for weapons that declare calibrations. */
export const MAX_CALIBRATION_LEVEL = 6;
export const MIN_CALIBRATION_LEVEL = 1;

export function equipmentOf(c: SetupCharacter): SetupEquipment {
  return c.equipment ?? {};
}

/** TRUE when the doll's equipment is engaged at all (any field set) — used to gate the
 *  "weapon + affinity required" local rule WITHOUT breaking the legacy no-equipment mode. */
export function equipmentEngaged(c: SetupCharacter): boolean {
  const e = equipmentOf(c);
  return (
    e.weaponId !== undefined ||
    e.calibrationLevel !== undefined ||
    (e.commonKeyIds?.length ?? 0) > 0 ||
    (e.equippedFixedKeys?.length ?? 0) > 0 ||
    e.expansionKeyId !== undefined ||
    e.affinityKeyId !== undefined
  );
}

type Updater = (e: SetupEquipment) => SetupEquipment;

function updateEquipment(state: SetupState, charId: string, fn: Updater): SetupState {
  let changed = false;
  const characters = state.characters.map((c) => {
    if (c.id !== charId) return c;
    changed = true;
    return { ...c, equipment: fn(equipmentOf(c)) };
  });
  return changed ? { ...state, characters } : state;
}

/** Toggle a Fixed Key (0–3). A 4th distinct key is a no-op (never silently drops an earlier one). */
export function toggleFixedKey(state: SetupState, charId: string, keyId: string): SetupState {
  return updateEquipment(state, charId, (e) => {
    const cur = e.equippedFixedKeys ?? [];
    if (cur.includes(keyId)) return { ...e, equippedFixedKeys: cur.filter((k) => k !== keyId) };
    if (cur.length >= MAX_FIXED_KEYS) return e; // cap: UI-local
    return { ...e, equippedFixedKeys: [...cur, keyId] };
  });
}

/** Toggle a Common Key (0–max). A 4th distinct key is a no-op. */
export function toggleCommonKey(state: SetupState, charId: string, keyId: string, max = MAX_COMMON_KEYS_UI): SetupState {
  return updateEquipment(state, charId, (e) => {
    const cur = e.commonKeyIds ?? [];
    if (cur.includes(keyId)) return { ...e, commonKeyIds: cur.filter((k) => k !== keyId) };
    if (cur.length >= max) return e; // cap: UI-local (engine enforces 3 too)
    return { ...e, commonKeyIds: [...cur, keyId] };
  });
}

/** Set the Common Key for a specific 0-based slot. `undefined` removes that slot's key (slots stay
 *  compact — later keys shift left). Reuses the existing per-member equipment list and cap:
 *  selecting a key already present elsewhere MOVES it to this slot, and a 4th distinct key is a no-op. */
export function setCommonKeyAt(
  state: SetupState,
  charId: string,
  slot: number,
  keyId: string | undefined,
  max = MAX_COMMON_KEYS_UI,
): SetupState {
  if (!Number.isInteger(slot) || slot < 0 || slot > max - 1) return state;
  return updateEquipment(state, charId, (e) => {
    const cur = e.commonKeyIds ?? [];
    if (keyId === undefined) {
      if (slot >= cur.length) return e;
      const next = cur.filter((_, i) => i !== slot);
      return { ...e, commonKeyIds: next };
    }
    const removed = cur.filter((_, i) => i !== slot); // drop the slot's current occupant
    const dedup = removed.includes(keyId) ? removed.filter((k) => k !== keyId) : removed; // move, not duplicate
    if (dedup.length >= max) return e; // cap preserved (4th distinct key is a no-op)
    const next = [...dedup];
    next.splice(Math.min(slot, next.length), 0, keyId);
    return { ...e, commonKeyIds: next };
  });
}

/** Set (or clear with `undefined`) the EXACT ONE weapon. Revalidates the stored calibration
 *  against the engine-sourced calibration list: cleared when the new weapon has none/invalid. */
export function setWeapon(state: SetupState, charId: string, weaponId: string | undefined, calibrations: number[]): SetupState {
  return updateEquipment(state, charId, (e) => {
    const next: SetupEquipment = { ...e, weaponId };
    if (weaponId === undefined) {
      delete next.calibrationLevel;
    } else if (next.calibrationLevel !== undefined && !calibrations.includes(next.calibrationLevel)) {
      delete next.calibrationLevel; // never silently keep an invalid calibration value
    }
    return next;
  });
}

/** Set the calibration level (C1–C6) or clear it. */
export function setCalibration(state: SetupState, charId: string, level: number | undefined): SetupState {
  return updateEquipment(state, charId, (e) => {
    const next: SetupEquipment = { ...e };
    if (level === undefined) delete next.calibrationLevel;
    else next.calibrationLevel = level;
    return next;
  });
}

/** Set (or clear) the EXACT ONE Affinity Key (engine `affinityKeyId`). Clearing also clears the level
 *  (a level without a key is meaningless); changing keys keeps the old level until re-picked. */
export function setAffinityKey(state: SetupState, charId: string, keyId: string | undefined): SetupState {
  return updateEquipment(state, charId, (e) => {
    const next: SetupEquipment = { ...e };
    if (keyId === undefined) {
      delete next.affinityKeyId;
      delete next.affinityLevel;
    } else {
      next.affinityKeyId = keyId;
    }
    return next;
  });
}

/** Set (or clear) the affinity LEVEL with the equipped key — exact levels only (engine `levels` keys,
 *  e.g. 5 / 9; the engine grants nothing on levels without an entry). Stored verbatim into the scenario. */
export function setAffinityLevel(state: SetupState, charId: string, level: number | undefined): SetupState {
  return updateEquipment(state, charId, (e) => {
    const next: SetupEquipment = { ...e, ...(level === undefined ? {} : { affinityLevel: level }) };
    if (level === undefined) delete next.affinityLevel;
    return next;
  });
}

/** Set (or clear) the single Expansion Key (engine contract: one `expansionKeyId`). */
export function setExpansionKey(state: SetupState, charId: string, keyId: string | undefined): SetupState {
  return updateEquipment(state, charId, (e) => {
    const next: SetupEquipment = { ...e };
    if (keyId === undefined) delete next.expansionKeyId;
    else next.expansionKeyId = keyId;
    return next;
  });
}

/** Maximum Fortification level exposed by the UI (per-run global; QJ's engine map covers V1–V6).
 *  Higher values would just be ignored by the engine's per-character map — no reason to offer them. */
export const MAX_FORTIFICATION_LEVEL = 6;

/** Set the run's Fortification level (V0–V6, global scenario config). Invalid levels are a no-op. */
export function setFortificationLevel(state: SetupState, level: number): SetupState {
  if (!Number.isInteger(level) || level < 0 || level > MAX_FORTIFICATION_LEVEL) return state;
  return { ...state, fortificationLevel: level };
}

/**
 * UI-LOCAL "obviously invalid" checks (displayed before Start; the ENGINE remains the final
 * authority). A doll with NO equipment at all keeps the legacy valid state (no weapon/affinity
 * is engine-valid); once equipment is ENGAGED, exactly-one weapon + exactly-one affinity are
 * required locally, and cap violations are reported.
 */
export function equipmentErrors(state: SetupState): string[] {
  const errors: string[] = [];
  // DEBUG MODE (2026): an explicit alternative path — the normal exactly-1 weapon/affinity and
  // calibration requirements do NOT apply; keys/weapon are all optional there. Cap violations
  // remain impossible through the capped toggle helpers.
  if (state.debug.enabled) return errors;
  for (const c of state.characters.filter((x) => x.selected)) {
    const e = equipmentOf(c);
    if (!equipmentEngaged(c)) continue; // legacy mode: entirely unconfigured = valid
    if (e.equippedFixedKeys && e.equippedFixedKeys.length > MAX_FIXED_KEYS) {
      errors.push(`${c.name}: more than ${MAX_FIXED_KEYS} Fixed Keys selected (max 3).`);
    }
    if (e.commonKeyIds && e.commonKeyIds.length > MAX_COMMON_KEYS_UI) {
      errors.push(`${c.name}: more than ${MAX_COMMON_KEYS_UI} Common Keys selected (3 slots).`);
    }
    if (e.weaponId === undefined) {
      errors.push(`${c.name}: select a Weapon (equipment is partially configured).`);
    }
    if (e.affinityKeyId === undefined) {
      errors.push(`${c.name}: select an Affinity Key (equipment is partially configured).`);
    }
    if (e.weaponId !== undefined && e.calibrationLevel === undefined) {
      errors.push(`${c.name}: select a weapon calibration level (C1–C6).`);
    }
    if (e.affinityKeyId !== undefined && e.affinityLevel === undefined) {
      errors.push(`${c.name}: select an affinity level for the equipped key.`);
    }
    if (e.calibrationLevel !== undefined && (e.weaponId === undefined || e.calibrationLevel < MIN_CALIBRATION_LEVEL || e.calibrationLevel > MAX_CALIBRATION_LEVEL)) {
      errors.push(`${c.name}: calibration requires an equipped weapon and a C1–C6 level.`);
    }
  }
  return errors;
}

export class SetupError extends Error {}

/**
 * ONE authoritative in-memory Setup configuration for the application session.
 * Survives Setup ↔ Debug navigation (no disk/localStorage); every change replaces the
 * stored state, and starting a simulation stamps the latest configuration as remembered.
 */
export class SetupStore {
  private state: SetupState;
  constructor(initial: SetupState = DEFAULT_SETUP) {
    this.state = initial;
  }
  get(): SetupState {
    return this.state;
  }
  set(next: SetupState): void {
    this.state = next;
  }
}

/** Map the form state into an engine ScenarioView. Throws SetupError on invalid input. */
export function buildScenario(setup: SetupState): ScenarioView {
  const team = setup.characters
    .filter((c) => c.selected)
    .map((c) => {
      const rotation = setup.rotations[c.id];
      if (!rotation || rotation.length === 0) {
        throw new SetupError(`Character ${c.name} is selected but has an empty rotation.`);
      }
      // Loadout fields are carried through VERBATIM (no id validation/filtering here — the
      // engine is the only validator). Absent equipment reproduces the EXACT legacy member
      // shape (`equippedFixedKeys: []`, no weapon/key fields).
      const equ = c.equipment ?? {};
      // DEBUG MODE (2026): only fields the user EDITED become baseStatOverrides.
      const debugOv = debugBaseStatOverrides(setup, c.id);
      return {
        characterId: c.id,
        rotation,
        equippedFixedKeys: equ.equippedFixedKeys ?? [],
        ...(equ.affinityKeyId !== undefined ? { affinityKeyId: equ.affinityKeyId } : {}),
        ...(equ.affinityLevel !== undefined ? { affinityLevel: equ.affinityLevel } : {}),
        ...(equ.commonKeyIds !== undefined ? { commonKeyIds: equ.commonKeyIds } : {}),
        ...(equ.weaponId !== undefined ? { weaponId: equ.weaponId } : {}),
        ...(equ.calibrationLevel !== undefined ? { calibrationLevel: equ.calibrationLevel } : {}),
        ...(equ.expansionKeyId !== undefined ? { expansionKeyId: equ.expansionKeyId } : {}),
        ...(Object.keys(debugOv).length > 0 ? { baseStatOverrides: debugOv } : {}),
      };
    });
  if (team.length === 0) throw new SetupError("Select at least one character.");
  if (!Number.isInteger(setup.turns) || setup.turns < 1 || setup.turns > 7) {
    throw new SetupError("Turns must be an integer between 1 and 7 (engine MVP cap).");
  }
  // Phase weaknesses must be exactly one of the five authoritative phases (burn/hydro/freeze/
  // electric/corrosion). physical and decay are NOT part of the taxonomy (rejected).
  const weaknesses = setup.dummy.weaknesses.filter((w) => REPRESENTABLE_PHASE_IDS.includes(w));
  const nonRepresentable = setup.dummy.weaknesses.filter((w) => !REPRESENTABLE_PHASE_IDS.includes(w));
  if (nonRepresentable.length > 0) {
    throw new SetupError(`Phase weakness(es) not in the authoritative taxonomy: ${nonRepresentable.join(", ")} (never mapped to a wrong element).`);
  }
  // Ammo weaknesses map 1:1 onto the engine AmmoType union → dummy.weaknessTags.
  const tagSet = new Set(AMMO_WEAKNESSES.map((a) => a.tag));
  const weaknessTags = setup.dummy.ammoWeaknesses.filter((t) => tagSet.has(t));
  // AWU (Training Dummy): with at least one Ammo Weakness selected, the dummy automatically
  // receives the EXISTING `grant_stacks_on_weakness_exploit` trigger so the validated progressive
  // Ammo Weakness Upgrade mechanic is testable from the Setup UI (first exploit +2, then +1,
  // cap 5, Physical-only, permanent). No ammo weakness ⇒ no passive ⇒ AWU cannot advance.
  const passives =
    weaknessTags.length > 0
      ? [
          {
            id: "awu",
            name: "AWU trigger",
            effects: weaknessTags.map((tag) => ({
              kind: "grant_stacks_on_weakness_exploit",
              weaknessTag: tag,
              statusId: "ammo_weakness_upgrade",
              firstGain: 2,
              gainPerEvent: 1,
              maxStacks: 5,
              requiresElements: [null], // phase-less (physical-ammo) attacks only — Physical is the Ammo dimension
            })),
          },
        ]
      : undefined;
  return {
    version: 1,
    seed: setup.seed,
    turns: setup.turns,
    team,
    dummy: {
      id: "training_dummy",
      name: "Training Dummy",
      hp: setup.dummy.hp,
      defense: setup.dummy.defense,
      stability: setup.dummy.stability,
      weaknesses: weaknesses as never,
      weaknessTags: weaknessTags as never,
      passives: passives as never,
      phase: null,
      cover: "none",
    },
    // GRID (2026): keep placement/tiles/ladders, but ONLY attach scripted moves for units with a
    // declared Mobility > 0 (data-driven — no character special case). Absent Mobility = the
    // unit cannot move; the engine would (correctly) reject any scripted move for it.
    grid: setup.gridEnabled && sampleScenario.grid
      ? { ...sampleScenario.grid, moves: (sampleScenario.grid.moves ?? []).filter((m) => (setup.characters.find((c) => c.id === m.unitId)?.mobility ?? 0) > 0) }
      : undefined,
    // Fortification (V) is a GLOBAL engine config override — always sent (V0 explicitly as 0).
    configOverrides: { fortificationLevel: setup.fortificationLevel },
  };
}