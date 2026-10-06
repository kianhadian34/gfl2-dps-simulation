import type { AmmoType, AttachmentSetGates, Element } from "../model/types.js";
import type { EffectiveStatusDef } from "./state.js";
import { ATTACHMENT_SETS } from "../data/attachment-sets.js";

/**
 * WEAPON ATTACHMENT SET CONSUMPTION (2026) — implemented batch.
 *
 * The ACTIVE Attachment Set is a loadout-level selection (`ScenarioTeamMember.activeAttachmentSet`,
 * carried on `UnitState.activeAttachmentSet`). Selecting a supported set adds its `additive_dealt`
 * bonuses to the EXISTING additive DMG% dealt bucket — there is NO separate damage-increase bucket,
 * no separate multiplier, and no formula change.
 *
 * Only the gates the engine can actually evaluate are consumed. Any attachment-only gate the engine
 * cannot evaluate (physicalSummonOnBattlefield / targetNearCover / phaseWeaknessCount / hasShield /
 * defenseSkill / allyFullHeal) makes its effect NOT match — so the not-yet-implemented sets stay
 * INERT (never applied unconditionally). No mechanics are invented.
 *
 * MVP SCOPE (2026): the `outOfTurn` gate maps to Support Actions — the ONLY out-of-turn attacker the
 * engine models. Interceptions / Counterattacks / other passive-effect attacks are NOT modeled and
 * are NOT claimed to be supported.
 */

/** The hit context the attachment-set gates are evaluated against (existing signals only). */
export interface AttachmentSetDamageContext {
  element: Element | null;
  /** The resolving skill's ammo category (e.g. "melee"); undefined = no ammo category. */
  ammoType: AmmoType | undefined;
  /** TRUE when the damage occurs outside the attacker's own turn (MVP: Support Actions only). */
  supportAttack: boolean;
  isAoE: boolean;
  skillType: "basic" | "active" | "ultimate" | "support";
  /** The TARGET's active status ids (for the `targetPhaseDebuff` gate). Empty = none. */
  targetStatusIds: readonly string[];
  /** The status registry, to resolve a target status's `phase` attribute. */
  statusRegistry: Map<string, EffectiveStatusDef>;
}

/**
 * Evaluate attachment-set gates against the current hit. Absent gate = applies always. Returns
 * FALSE for any gate the engine cannot evaluate (keeps deferred sets inert — never unconditional).
 */
export function attachmentSetGatesMatch(gates: AttachmentSetGates | undefined, ctx: AttachmentSetDamageContext): boolean {
  if (!gates) return true;
  // Element-of-the-attack gate (OR-list; null = phase-less/physical). Same semantics as the
  // existing `RemolderEffectGates.element`.
  if (gates.element !== undefined && !gates.element.includes(ctx.element)) return false;
  // Ammo-category gate (e.g. ["melee"]) — requires the hit to carry a matching ammoType.
  if (gates.ammoType !== undefined && (ctx.ammoType === undefined || !gates.ammoType.includes(ctx.ammoType))) return false;
  // Out-of-turn gate — MVP: Support Actions are the only out-of-turn attacker.
  if (gates.outOfTurn === true && !ctx.supportAttack) return false;
  // Damage-category gate (aoe / targeted).
  if (gates.category !== undefined) {
    const matches = gates.category === "aoe" ? ctx.isAoE : !ctx.isAoE;
    if (!matches) return false;
  }
  // Ability-type gate.
  if (gates.skillTypes !== undefined && !gates.skillTypes.includes(ctx.skillType)) return false;
  // TARGET PHASE-ATTRIBUTE DEBUFF gate (2026, VALIDATED in-game for Overburn → Burn): the target
  // "has a Phase attribute debuff" when it carries an active status whose DEFINITION has a non-null
  // `phase`. Data-driven — the element lives on the status data, never hard-coded here.
  if (gates.targetPhaseDebuff === true && !ctx.targetStatusIds.some((id) => ctx.statusRegistry.get(id)?.phase != null)) return false;
  // Unmodeled attachment-only gates → NOT evaluable → the effect does NOT match (never applied
  // unconditionally). These belong to the not-yet-implemented sets.
  if (
    gates.physicalSummonOnBattlefield !== undefined ||
    gates.targetNearCover !== undefined ||
    gates.phaseWeaknessCount !== undefined ||
    gates.hasShield !== undefined ||
    gates.defenseSkill !== undefined ||
    gates.allyFullHeal !== undefined
  ) {
    return false;
  }
  return true;
}

/**
 * Σ additive DMG% dealt contributed by the ACTIVE attachment set for this hit (0 when no set is
 * selected, the set is unknown, or no bonus matches). Consumed by the EXISTING `addDealt` bucket in
 * `dealDamageHit` — values come from the set DATA (`ATTACHMENT_SETS`), never duplicated here.
 */
export function attachmentSetDealtBonus(activeSetId: string | undefined, ctx: AttachmentSetDamageContext): number {
  if (!activeSetId) return 0;
  const def = ATTACHMENT_SETS.find((s) => s.id === activeSetId);
  if (!def) return 0;
  let sum = 0;
  for (const bonus of def.bonuses) {
    if (bonus.kind === "additive_dealt" && attachmentSetGatesMatch(bonus.gates, ctx)) sum += bonus.value;
  }
  return sum;
}
