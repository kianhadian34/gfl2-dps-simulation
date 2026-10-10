import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { tickStatuses } from "../engine/statuses.js";
import { customRegistry, scenario } from "./helpers.js";
import { STATUS_DEFS } from "../data/statuses.js";
import type { CharacterDef, Scenario, SkillDefVariant, StatusDef } from "../model/types.js";

/**
 * START-OF-ACTION STATUS TICK (`tickAt: "ownActionStart"`) — added 2026.
 *
 * Ordering, per the project owner (2026-10-09):
 *   turn starts  →  start-of-turn effect fires  →  the unit acts
 *
 * So a status declaring this tick point fires its effects BEFORE the holder moves or acts, and
 * its duration decrements at that point (a 1-turn status is therefore gone before the holder's
 * action resolves).
 *
 * Motivated by Vector's **Overheat Combustion** ("at the start of this unit's action, this unit
 * and all allied units within a 1-tile area take fixed damage") — but the status is NOT
 * implemented here: the fixtures below are synthetic and registry-injected, so this pins the
 * TICK POINT independently of Vector's kit data. A guard asserts they never leak into production.
 */

const ATK = 1000;

/** A synthetic status with a fixed-damage tick at the chosen tick point. */
function fixedTickStatus(id: string, tickAt: StatusDef["tickAt"], percentOfAtk = 0.2, durationRounds = 2): StatusDef {
  return {
    id,
    name: `${id} (test)`,
    category: "debuff",
    stackable: false,
    maxStacks: 1,
    durationRounds,
    tickAt,
    purgeable: true,
    effects: [{ kind: "fixed_damage", percentOfAtk, applies: ["onTick"] }],
    verified: false,
  };
}

/** A doll that applies `statusId` to the DUMMY on its active1, then attacks with Basic. */
function applierDoll(statusId: string, durationRounds: number): CharacterDef {
  const basic: SkillDefVariant = { id: "sa_basic", name: "sa_basic", type: "basic", element: null, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 };
  const apply: SkillDefVariant = {
    id: "sa_apply",
    name: "sa_apply",
    type: "active",
    element: null,
    multiplier: 0,
    stabDamage: 0,
    cooldown: 9,
    confectanceCost: 0,
    appliesStatuses: [{ statusId, stacks: 1, durationRounds, target: "target" }],
  };
  const wrap = (s: SkillDefVariant) => ({ id: s.id, name: s.name, type: s.type, levels: { 1: s } });
  return {
    id: "sa_test",
    name: "Start Tick Test",
    class: "support",
    phase: null,
    base: { atk: ATK, hp: 1000, def: 0, stability: 0, critRate: 0, critDmg: 0 },
    skills: { basic: wrap(basic), active1: wrap(apply) },
    passive: { id: "sa_passive", name: "-", effects: [] },
    fixedKeys: [],
  };
}

/** A doll that applies `statusId` to ITSELF on active1 (the self-applied case). */
function selfApplierDoll(statusId: string, durationRounds: number): CharacterDef {
  const doll = applierDoll(statusId, durationRounds);
  const apply = doll.skills.active1!.levels[1];
  doll.skills.active1 = { ...doll.skills.active1!, levels: { 1: { ...apply, appliesStatuses: [{ statusId, stacks: 1, durationRounds, target: "self" }] } } };
  return doll;
}

function runWith(doll: CharacterDef, statuses: StatusDef[], rotation: Scenario["team"][number]["rotation"], turns: number) {
  const reg = customRegistry({ sa_test: doll });
  const map = new Map(reg.getStatusMap());
  for (const s of statuses) map.set(s.id, s);
  const sc: Scenario = {
    version: 1,
    seed: 1,
    turns,
    team: [{ characterId: "sa_test", rotation, applyDispatchStats: false, equippedFixedKeys: [] }],
    dummy: { id: "training_dummy", name: "Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: {},
  };
  return simulateScenario(sc, { ...reg, getStatus: (id) => map.get(id), getStatusMap: () => map });
}

const ticks = (r: ReturnType<typeof runWith>) => r.log.filter((e) => e.actionType === "status_tick");

/**
 * TARGET-side: the status is applied to the dummy; its turn start fires the tick. The dummy's
 * "turn" is its pass-turn, so the damage lands once per round while the status lives.
 */
test("ownActionStart: a target-side status ticks at the target's turn start", () => {
  const r = runWith(applierDoll("sa_start", 2), [fixedTickStatus("sa_start", "ownActionStart")], ["active1", "basic"], 3);
  const t = ticks(r);
  // Applied in round 1 (dummy pass-turn ticks it), then round 2 (2 → 1 → expires). Round 3: gone.
  assert.equal(t.length, 2, "two ticks over the 2-turn duration");
  assert.deepEqual(t.map((e) => e.finalDamage), [200, 200], "ceil(1000 × 0.20) each");
  assert.deepEqual(t.map((e) => e.round), [1, 2], "round 1 and round 2");
});

/** The tick fires BEFORE the holder acts — the source's stated ordering. */
test("ownActionStart fires BEFORE the holder's action (turn starts → effect → action)", () => {
  // The doll applies it to ITSELF in round 1; from round 2 its own turn start ticks it.
  const r = runWith(selfApplierDoll("sa_self", 3), [fixedTickStatus("sa_self", "ownActionStart", 0.2, 3)], ["active1", "basic"], 2);
  const round2 = r.log.filter((e) => e.round === 2);
  const tickIdx = round2.findIndex((e) => e.actionType === "status_tick");
  const actionIdx = round2.findIndex((e) => e.action === "sa_basic");
  assert.ok(tickIdx >= 0, "the tick fired in round 2");
  assert.ok(actionIdx >= 0, "the action resolved in round 2");
  assert.ok(tickIdx < actionIdx, "the tick precedes the action in the log (start-of-turn effect first)");
});

/** The duration decrements AT the tick point: a 1-turn status is gone before the action resolves. */
test("ownActionStart: a 1-turn status expires at the turn start, before the holder acts", () => {
  const r = runWith(selfApplierDoll("sa_one", 1), [fixedTickStatus("sa_one", "ownActionStart", 0.2, 1)], ["active1", "basic"], 2);
  const t = ticks(r);
  assert.equal(t.length, 1, "fires exactly once (round 2's turn start), then expires");
  assert.equal(t[0].round, 2);
  // And the status is gone from round 3 onward.
  assert.equal(r.log.filter((e) => e.round === 3 && e.actionType === "status_tick").length, 0);
});

/** CONTROL: the same status with `ownActionEnd` is NOT fired by the start tick. */
test("control: an ownActionEnd status is unaffected by the start-of-action tick", () => {
  const r = runWith(applierDoll("sa_end", 2), [fixedTickStatus("sa_end", "ownActionEnd")], ["active1", "basic"], 3);
  const t = ticks(r);
  // It still ticks twice — but at the dummy's ACTION END (the existing, validated timing).
  assert.equal(t.length, 2, "ownActionEnd behaviour is unchanged");
  assert.deepEqual(t.map((e) => e.finalDamage), [200, 200]);
});

/** The two tick points are mutually exclusive: a status fires at ONE of them, never both. */
test("a status ticks at exactly one point — the start tick does not double-fire an end status", () => {
  const r = runWith(applierDoll("sa_end2", 2), [fixedTickStatus("sa_end2", "ownActionEnd")], ["active1", "basic"], 2);
  // 2 turns of duration ⇒ exactly 2 ticks total (not 4).
  assert.equal(ticks(r).length, 2, "no double-firing");
});

/** A permanently-applied status (durationRounds null) never ticks, at either point. */
test("a permanent status never ticks at the start of the action", () => {
  const permanent = fixedTickStatus("sa_perm", "ownActionStart");
  permanent.durationRounds = null;
  const r = runWith(applierDoll("sa_perm", 2), [permanent], ["active1", "basic"], 3);
  assert.equal(ticks(r).length, 0, "a null duration never ticks");
});

/** Unit-level: `tickStatuses` honours the new point directly (the real engine path). */
test("tickStatuses(ownActionStart) fires only statuses declaring that point", () => {
  const state = createState(scenario({ turns: 1 }), customRegistry({}), new Set());
  const map = new Map(state.statusRegistry);
  map.set("sa_start", fixedTickStatus("sa_start", "ownActionStart"));
  map.set("sa_end", fixedTickStatus("sa_end", "ownActionEnd"));
  state.statusRegistry = map;
  const doll = state.units[0];
  doll.statuses = [
    { statusId: "sa_start", stacks: 1, durationLeft: 2, applier: { id: doll.id, atk: ATK } },
    { statusId: "sa_end", stacks: 1, durationLeft: 2, applier: { id: doll.id, atk: ATK } },
  ];
  let fired: string[] = [];
  const expired = tickStatuses(state, doll, "ownActionStart", (_st, _u, def) => fired.push(def.id));
  assert.deepEqual(fired, ["sa_start"], "only the ownActionStart status fires");
  assert.deepEqual(expired, [], "duration 2 → 1, nothing expires yet");
  assert.equal(doll.statuses.find((s) => s.statusId === "sa_end")!.durationLeft, 2, "the end status is untouched");
});

/** The synthetic fixtures must never leak into production data. */
test("the synthetic fixtures stay out of the production status table", () => {
  assert.ok(!STATUS_DEFS.some((s) => s.id.startsWith("sa_")), "no sa_* fixture in STATUS_DEFS");
});
