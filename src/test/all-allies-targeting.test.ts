import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry, makeAlly } from "./helpers.js";
import { STATUS_DEFS } from "../data/statuses.js";
import type { CharacterDef, Scenario, SkillDefVariant } from "../model/types.js";

/**
 * ALL-ALLIES STATUS TARGETING (`StatusApplySpec.target: "all_allies"`) — added 2026.
 *
 * "All allies on the battlefield" = EVERY member of the allied team (`state.units`), INCLUDING
 * the acting unit. The enemy/dummy lives in `state.dummy` and is NEVER included.
 *
 * Motivated by Vector's Searing Finale: "Applies Accelerant to all allied units" (and its V2
 * "Applies Blazing Assault II to all allied units"). The statuses themselves are NOT defined
 * here — this pins the TARGETING vocabulary with synthetic, registry-injected fixtures.
 *
 * Fixture: a caster whose Ultimate applies a synthetic marker status to `all_allies`, plus two
 * synthetic allies. The marker is a plain `stat_modifier` (ATK +50%) so each recipient's panel is
 * directly readable from the log's `attackerAtk`.
 */

const ATK = 1000;

/** A synthetic all-allies marker: ATK +50% (flat pct) for a long duration. */
const MARKER = {
  id: "aa_marker",
  name: "All-Allies Marker (test)",
  category: "buff" as const,
  stackable: false,
  maxStacks: 1,
  durationRounds: 99,
  tickAt: "ownActionEnd" as const,
  purgeable: true,
  effects: [{ kind: "stat_modifier" as const, stat: "atk" as const, mode: "pct" as const, value: 0.5 }],
  verified: false,
};

/**
 * A caster whose ULTIMATE applies `MARKER` to `target`. A 0-damage Ultimate keeps the log clean;
 * `cooldown: 9` makes it fire once. `multiplier: 0` means no damage — so the marker's effect is
 * observed through the FOLLOWING Basic attacks.
 */
function caster(target: "self" | "target" | "all_allies"): CharacterDef {
  const basic: SkillDefVariant = { id: "aa_basic", name: "aa_basic", type: "basic", element: null, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 };
  const ult: SkillDefVariant = {
    id: "aa_ult",
    name: "aa_ult",
    type: "ultimate",
    element: null,
    multiplier: 0,
    stabDamage: 0,
    cooldown: 9,
    confectanceCost: 0,
    appliesStatuses: [{ statusId: MARKER.id, stacks: 1, target }],
  };
  const wrap = (s: SkillDefVariant) => ({ id: s.id, name: s.name, type: s.type, levels: { 1: s } });
  return {
    id: "aa_caster",
    name: "All-Allies Caster",
    class: "support",
    phase: null,
    base: { atk: ATK, hp: 1000, def: 0, stability: 0, critRate: 0, critDmg: 0 },
    skills: { basic: wrap(basic), ultimate: wrap(ult) },
    passive: { id: "aa_passive", name: "-", effects: [] },
    fixedKeys: [],
  };
}

/** Two allies that only Basic-attack, so their panels are observable. */
function ally(id: string, atk: number): CharacterDef {
  return makeAlly(id, atk);
}

function run(opts: { target: "self" | "target" | "all_allies"; allies: number; turns?: number }) {
  const team: Scenario["team"] = [
    { characterId: "aa_caster", rotation: ["ultimate", "basic"], applyDispatchStats: false, equippedFixedKeys: [] },
  ];
  // NOTE: `customRegistry` resolves characters as `id === "qiongjiu" ? QJ : extra[id]`, so the
  // fixture caster must ALSO be supplied through `extra` — it is not the base character.
  const extra: Record<string, CharacterDef> = { aa_caster: caster(opts.target) };
  for (let i = 0; i < opts.allies; i++) {
    const id = `aa_ally${i + 1}`;
    extra[id] = ally(id, 500);
    team.push({ characterId: id, rotation: ["basic"], applyDispatchStats: false, equippedFixedKeys: [] });
  }
  const reg = customRegistry(extra);
  const map = new Map(reg.getStatusMap());
  map.set(MARKER.id, MARKER);
  const sc: Scenario = {
    version: 1,
    seed: 1,
    turns: opts.turns ?? 2,
    team,
    dummy: { id: "training_dummy", name: "Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: {},
  };
  return simulateScenario(sc, { ...reg, getStatus: (id) => map.get(id), getStatusMap: () => map });
}

/** A unit's Basic ATTACK values — the observable proxy for "carries the marker". Filters by UNIT
 *  and action TYPE (each fixture unit's basic has its own id, e.g. `aa_ally1_basic`). */
const basicAtk = (r: ReturnType<typeof run>, unit: string) =>
  r.log.filter((e) => e.unit === unit && e.actionType === "basic").map((e) => e.attackerAtk);

/**
 * The core case: the marker lands on EVERY ally AND the caster. The caster acts FIRST in the team
 * order, so its round-1 Ultimate already buffs the allies before they act that round.
 */
test("all_allies: the status lands on every ally AND the caster", () => {
  const r = run({ target: "all_allies", allies: 2 });
  assert.deepEqual(basicAtk(r, "aa_caster"), [1500], "caster buffed (included) — its round-2 Basic");
  assert.deepEqual(basicAtk(r, "aa_ally1"), [750, 750], "ally 1 buffed from round 1 (500 × 1.5)");
  assert.deepEqual(basicAtk(r, "aa_ally2"), [750, 750], "ally 2 buffed");
});

/** `target: "self"` — only the caster. The allies are untouched. */
test("self: only the caster is affected (control for the fan-out)", () => {
  const r = run({ target: "self", allies: 2 });
  assert.deepEqual(basicAtk(r, "aa_caster"), [1500], "caster buffed");
  assert.deepEqual(basicAtk(r, "aa_ally1"), [500, 500], "ally 1 NOT buffed");
  assert.deepEqual(basicAtk(r, "aa_ally2"), [500, 500], "ally 2 NOT buffed");
});

/** `target: "target"` — the enemy/dummy only; no ally and not the caster. */
test("target: neither the caster nor the allies are affected", () => {
  const r = run({ target: "target", allies: 2 });
  assert.deepEqual(basicAtk(r, "aa_caster"), [1000], "caster NOT buffed");
  assert.deepEqual(basicAtk(r, "aa_ally1"), [500, 500], "ally 1 NOT buffed");
});

/** A SOLO caster: all_allies still includes the caster herself. */
test("all_allies with a solo caster still buffs the caster", () => {
  const r = run({ target: "all_allies", allies: 0 });
  assert.deepEqual(basicAtk(r, "aa_caster"), [1500], "the lone unit is its own ally");
});

/** The all-allies application is reported ONCE in the log (not once per recipient). */
test("all_allies reports the status once on the granting event", () => {
  const r = run({ target: "all_allies", allies: 2 });
  const ult = r.log.find((e) => e.action === "aa_ult")!;
  assert.deepEqual(ult.statusesApplied, ["aa_marker"], "one entry for the spec, not one per recipient");
  assert.equal((ult.appliedSources ?? []).length, 1, "one provenance entry");
});

/** Three allies: the fan-out scales with the team size. */
test("all_allies scales with the team (3 allies + caster = 4 recipients)", () => {
  const r = run({ target: "all_allies", allies: 3 });
  assert.deepEqual(basicAtk(r, "aa_caster"), [1500], "caster carries the marker");
  for (const id of ["aa_ally1", "aa_ally2", "aa_ally3"]) {
    assert.deepEqual(basicAtk(r, id), [750, 750], `${id} carries the marker`);
  }
});

/** The synthetic marker must never leak into production data. */
test("the synthetic fixture stays out of the production status table", () => {
  assert.ok(!STATUS_DEFS.some((s) => s.id === "aa_marker"), "no aa_marker in STATUS_DEFS");
});
