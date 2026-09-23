import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { applyStatus, tickStatuses } from "../engine/statuses.js";
import { applyEndOfActionStatusEffects } from "../engine/simulation.js";
import { scenario, customRegistry } from "./helpers.js";
import type { SimulationState, UnitState, EffectiveStatusDef } from "../engine/state.js";
import type { ActiveStatus } from "../model/runtime.js";

/**
 * CONTINUOUS HEALING I (Golden Melody Trait outcome #3 â€” authoritative tooltip, VALIDATED
 * 2026): "restores 10% of maximum HP at the end of the action". Buff/Healing class, 1 turn.
 * - 10% of MAXIMUM HP (never current HP), at the HOLDER's own action end (the standard
 *   `ownActionEnd` onTick phase â€” before the tick decrement, same timing as status-sourced
 *   fixed damage).
 * - HP never exceeds max HP. Math.ceil for non-integer amounts (unvalidated MVP choice,
 *   damage-ceil convention). No other mechanics invented.
 */

// The SAME end-of-action effect implementation the simulation wires into its end-of-turn
// tick (simulation.ts endOfOwnTurn) â€” tests exercise the real engine path.
const onActionEnd = (st: SimulationState, u: UnitState, def: EffectiveStatusDef, active: ActiveStatus) =>
  applyEndOfActionStatusEffects(st, u, def, active);

function stateWith(seed = 7): SimulationState {
  return createState(
    {
      ...scenario({ turns: 3, seed }),
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "weapon_qj_panel_test" }],
    },
    customRegistry({}),
    new Set(),
  );
}

const healTick = (st: SimulationState, u: UnitState) => tickStatuses(st, u, "ownActionEnd", onActionEnd);

function healUnit(st: SimulationState, hp: number): UnitState {
  const u = st.units[0];
  u.maxHp = 1000; // normalized max HP for exact oracle numbers (10% = 100)
  u.hp = hp;
  return u;
}

test("restores exactly 10% of MAXIMUM HP at the holder's action end", () => {
  const st = stateWith();
  const u = healUnit(st, 700); // maxHp 1000 â†’ 10% = 100
  applyStatus(st, u, { statusId: "trait_continuous_healing_i", source: "test" });
  healTick(st, u);
  assert.equal(u.hp, 800, "700 + 10% of max HP (100) = 800");
});

test("100% max-HP basis: a low current HP still heals 10% of MAX, not of current", () => {
  const st = stateWith();
  const u = healUnit(st, 10); // current 1% â€” 10% of MAX is still 100
  applyStatus(st, u, { statusId: "trait_continuous_healing_i", source: "test" });
  healTick(st, u);
  assert.equal(u.hp, 110, "uses max HP (10% Ã— 1000), not current HP");
});

test("HP never exceeds maximum HP (no overheal)", () => {
  const st = stateWith();
  const u = healUnit(st, 950);
  applyStatus(st, u, { statusId: "trait_continuous_healing_i", source: "test" });
  healTick(st, u);
  assert.equal(u.hp, 1000, "950 + 100 capped at maxHp 1000 (not 1050)");
  // At full HP the heal is a no-op (still capped).
  const st2 = stateWith();
  const u2 = healUnit(st2, 1000);
  applyStatus(st2, u2, { statusId: "trait_continuous_healing_i", source: "test" });
  healTick(st2, u2);
  assert.equal(u2.hp, 1000, "full HP unchanged");
});

test("correct action-end timing: round-end ticks do NOT heal; only the holder's own action end", () => {
  const st = stateWith();
  const u = healUnit(st, 700);
  applyStatus(st, u, { statusId: "trait_continuous_healing_i", source: "test" });
  tickStatuses(st, u, "roundEnd");
  assert.equal(u.hp, 700, "roundEnd tick heals nothing");
  healTick(st, u);
  assert.equal(u.hp, 800, "ownActionEnd heals");
});

test("no healing when the buff is not active", () => {
  const st = stateWith();
  const u = healUnit(st, 700);
  healTick(st, u);
  assert.equal(u.hp, 700, "no heal without the buff");
});

test("1-turn expiration: heals once, then the buff is gone (no further healing)", () => {
  const st = stateWith();
  const u = healUnit(st, 500);
  applyStatus(st, u, { statusId: "trait_continuous_healing_i", source: "test" });
  healTick(st, u); // heals 100 AND expires (duration 1)
  assert.equal(u.hp, 600);
  healTick(st, u);
  assert.equal(u.hp, 600, "second action end: no second heal (buff expired)");
  assert.equal(
    u.statuses.some((s) => s.statusId === "trait_continuous_healing_i"),
    false,
    "buff no longer present after one action end",
  );
});

test("non-integer 10% uses ceil (documented model choice, exact-integer default)", () => {
  // maxHp 333: 10% = 33.3 â†’ ceil 34 (MVP convention; tooltip specifies no rounding).
  const st = createState(
    {
      ...scenario({ turns: 3 }),
      team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "weapon_qj_panel_test" }],
    },
    customRegistry({}),
    new Set(),
  );
  const u = st.units[0];
  u.hp = 200;
  u.maxHp = 333;
  applyStatus(st, u, { statusId: "trait_continuous_healing_i", source: "test" });
  healTick(st, u);
  assert.equal(u.hp, 234, "200 + ceil(33.3)");
});