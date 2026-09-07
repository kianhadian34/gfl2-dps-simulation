import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { applyStatus, tickStatuses } from "../engine/statuses.js";
import { REGISTRY } from "../data/registry.js";
import { scenario } from "./helpers.js";

/**
 * U7 CONFIRMED in-game (2026-09-03, Attack Up II): a normal timed buff's
 * duration is consumed at the END of the RECIPIENT's own action — not at the
 * turn start and not at round end. Self-applied buffs follow the same rule
 * (VALIDATED 2026, Fortification Protocol / Positive Charge: 3 → 2 at the end
 * of the casting unit's own action; no same-action skip).
 */
test("U7: timed buff duration ticks at the recipient's action end, not at turn/round end", () => {
  const state = createState(scenario({ turns: 1, seed: 7 }), REGISTRY, new Set());
  const doll = state.units[0];
  // overburn: non-stackable, duration 2 — a plain timed buff for timing checks.
  applyStatus(state, doll, { statusId: "overburn", durationRounds: 2 });
  const active = () => doll.statuses.find((s) => s.statusId === "overburn");
  assert.ok(active(), "buff applied");
  assert.equal(active()!.stacks, 1);
  assert.equal(active()!.durationLeft, 2, "initial: 2 turns remaining");

  // A round end / turn start must NOT consume an actionEnd-timed buff.
  tickStatuses(state, doll, "roundEnd");
  assert.equal(active()!.durationLeft, 2, "no tick at round end / turn start");

  // The recipient's own action end consumes one duration unit.
  tickStatuses(state, doll, "ownActionEnd");
  assert.equal(active()!.durationLeft, 1, "decremented to 1 at the recipient's action end");

  // The next action end consumes the remaining duration (status removed).
  tickStatuses(state, doll, "ownActionEnd");
  assert.ok(!active(), "buff expired at the following action end");
});

/**
 * VALIDATED in-game (2026, Fortification Protocol / Positive Charge):
 * a buff a unit applies to ITSELF during its own action still ticks at the end
 * of that same action — 3 turns applied → 2 after the action ends. This
 * disproved the old `appliedThisAction` same-action skip, which was removed.
 */
test("U7 (2026): self-applied buff ticks at the end of the same action (Positive Charge 3 → 2)", () => {
  const state = createState(scenario({ turns: 1, seed: 7 }), REGISTRY, new Set());
  const doll = state.units[0];
  // No reset/absent appliedThisAction: the status is applied during the cast action itself.
  applyStatus(state, doll, { statusId: "overburn", durationRounds: 3 });
  const active = () => doll.statuses.find((s) => s.statusId === "overburn");
  assert.equal(active()!.durationLeft, 3, "applied with 3 turns");

  // The casting unit's action end consumes one turn (no same-action skip).
  tickStatuses(state, doll, "ownActionEnd");
  assert.equal(active()!.durationLeft, 2, "3 → 2 at the end of the same action (validated)");

  tickStatuses(state, doll, "ownActionEnd");
  assert.equal(active()!.durationLeft, 1);

  tickStatuses(state, doll, "ownActionEnd");
  assert.ok(!active(), "expired after the second subsequent action end");
});

/**
 * U8 CONFIRMED in-game (2026-09-03, Attack Up II): reapplying the SAME status
 * tier while it is active REFRESHES the duration and does NOT add another
 * stack. This is the default same-tier convention; statuses whose text defines
 * their own stacking are unaffected by it.
 */
test("U8: same-tier reapplication refreshes duration and keeps a single stack", () => {
  const state = createState(scenario({ turns: 1, seed: 7 }), REGISTRY, new Set());
  const doll = state.units[0];
  applyStatus(state, doll, { statusId: "overburn", durationRounds: 2 });
  assert.equal(doll.statuses.length, 1);
  assert.equal(doll.statuses[0].stacks, 1);
  assert.equal(doll.statuses[0].durationLeft, 2, "initial duration and one stack");

  tickStatuses(state, doll, "ownActionEnd"); // 2 → 1 (partially consumed)
  assert.equal(doll.statuses[0].durationLeft, 1);

  // Reapply the same tier while active: duration refreshes back to full,
  // stack count stays 1, and no second status entry is created.
  applyStatus(state, doll, { statusId: "overburn", durationRounds: 2 });
  assert.equal(doll.statuses.length, 1, "no second status entry");
  assert.equal(doll.statuses[0].stacks, 1, "stack count stays 1");
  assert.equal(doll.statuses[0].durationLeft, 2, "duration refreshed to full");
});