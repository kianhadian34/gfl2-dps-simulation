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

export interface SetupState {
  turns: number;
  seed: number;
  dummy: { hp: number; defense: number; stability: number; weaknesses: string[]; ammoWeaknesses: string[] };
  characters: SetupCharacter[];
  /** Fixed rotation per selected character id. */
  rotations: Record<string, RotationSlot[]>;
  gridEnabled: boolean;
}

export const DEFAULT_SETUP: SetupState = {
  turns: 2,
  seed: 7,
  dummy: { hp: 999999999, defense: 5000, stability: 6, weaknesses: [], ammoWeaknesses: [] },
  characters: [],
  rotations: {},
  gridEnabled: false,
};

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
  };
}