import type { ActionSlot, SourceKind, StatusOverride } from "./types.js";

export interface ResolvedConfig {
  /** null = derive from the attacker's Crit DMG stat (1 + critDmg, confirmed U1/U19); number = test-only alternative. */
  critMultiplier: number | null;
  glanceChance: number;
  exposedDurationRounds: number;
  exposedDamageMult: number;
  confectanceMax: number;
  confectanceStart: number;
  statusOverrides: Record<string, StatusOverride>;
  cooldownModel: "endOfOwnTurn" | "nextOwnTurnEnd";
}

export interface ActiveStatus {
  statusId: string;
  stacks: number;
  durationLeft: number;
}

/** Structured event per resolved action/hit — docs/schemas.md §9. */
export interface LogEvent {
  round: number;
  turn: number;
  unit: string;
  action: string;
  actionType: "basic" | "active" | "ultimate" | "support";
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
  glancing?: boolean;
  stabilityDamage?: number;
  targetStabilityAfter?: number;
  exposed?: boolean;
  finalDamage: number;
  confectance?: { before: number; after: number; cost: number };
  cooldownAfter: Record<string, number>;
  statusesApplied: string[];
  statusesExpired: string[];
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