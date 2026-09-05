import type { ActionSlot, SourceKind, StatusOverride } from "./types.js";

export interface ResolvedConfig {
  /** null = derive from the attacker's Crit DMG stat (1 + critDmg, confirmed U1/U19); number = test-only alternative. */
  critMultiplier: number | null;
  exposedDurationRounds: number;
  confectanceMax: number;
  confectanceStart: number;
  statusOverrides: Record<string, StatusOverride>;
  cooldownModel: "endOfOwnTurn" | "nextOwnTurnEnd";
}

export interface ActiveStatus {
  statusId: string;
  stacks: number;
  durationLeft: number;
  /** Effect applier captured at application time (applier-ATK fixed damage, Overburn 2026). Optional. */
  applier?: { id: string; atk: number };
}

/** Structured event per resolved action/hit — docs/schemas.md §9. */
export interface LogEvent {
  round: number;
  turn: number;
  unit: string;
  action: string;
  actionType: "basic" | "active" | "ultimate" | "support" | "status_tick";
  target: string;
  source: SourceKind;
  supportAttack: boolean;
  baseDamage?: number;
  mitigatedDamage?: number;
  /** Damage-pipeline inputs recorded so every action reproduces against an in-game test (validation mode). */
  attackerAtk?: number;
  targetDef?: number;
  critical?: boolean;
  critMultiplier?: number;
  weaknessExploited: string[];
  phaseMult: number;
  bonusBracket: number;
  reductionMult: number;
  stabilityDamage?: number;
  targetStabilityAfter?: number;
  exposed?: boolean;
  finalDamage: number;
  confectance?: { before: number; after: number; cost: number };
  cooldownAfter: Record<string, number>;
  statusesApplied: string[];
  statusesExpired: string[];
  /** Snapshot of permanent target 'upgrade' statuses after the hit (e.g. Ammo Weakness Upgrade stacks, 2026) — absent when none. */
  upgradeStacks?: { statusId: string; stacks: number }[];
  /** Status-sourced fixed damage fired on application or at an ownActionEnd tick (Overburn, 2026) — absent for normal actions. */
  statusTick?: { statusId: string; amount: number };
  /** Independently ceiled Fixed Damage component (U21) — absent for normal-only hits. */
  fixedDamage?: number;
}

/** docs/schemas.md §10. */
export interface SimulationResult {
  seed: number;
  turns: number;
  totals: { damage: number; damagePerRound: number; damagePerAction: number; actions: number };
  byCharacter: { id: string; damage: number; actions: number }[];
  bySource: { source: SourceKind; damage: number; actions: number }[];
  warnings: string[];
  log: LogEvent[];
}