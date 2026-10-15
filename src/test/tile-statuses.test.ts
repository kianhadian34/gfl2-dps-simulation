import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_DEFS, statusMap } from "../data/statuses.js";
import { tileEffectsFor } from "../data/tile-effects.js";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { applyTileEffectsOnActionEnd, generateTiles } from "../engine/tiles.js";
import { additiveTakenBonus, applyStatus } from "../engine/statuses.js";
import type { GridConfig, GridCoord } from "../model/grid.js";
import type { Scenario } from "../model/types.js";

/**
 * ELEMENTAL TILES — T11/M11: THE MISSING TILE-EFFECT STATUSES (2026).
 *
 * T8 shipped the trigger mechanism but could populate the tile-effect table with **`overburn` only**,
 * because the other named tile-effect statuses did not exist. T11 investigated all nine against the
 * PRIMARY SOURCE (the effect records the guide's `[effect:<uuid>]` tokens resolve to, fetched from
 * `dandegate.net/effects/<uuid>` — the same provenance `research.md` §3.23.2 already uses) and defined
 * the three that the engine can express **without inventing a mechanic**:
 *
 *   - **Conflagration** — Burn damage taken +20%            (existing `damage_modifier` taken + `whenElement`)
 *   - **Combustion**     — 15% inflictor-ATK fixed damage, max 3 stacks  (existing `fixed_damage`)
 *   - **Combustion II**  — 20% inflictor-ATK fixed damage, max 5 stacks  (existing `fixed_damage`)
 *
 * The other six are DEFINED in the source but **not expressible yet** — each needs a mechanic the
 * engine lacks, or a clause it has already deferred. They are recorded with reasons in `docs/tiles.md`
 * §10 (T11) rather than half-implemented:
 *   Stability Loss I (no taken-side stability modifier) · Frozen (no mobility mechanic; its 2-stack
 *   conversion target "Frigid" is also unmodeled) · Damp (no healing-received modifier; converts to
 *   Congestion) · Congestion (no heal-blocked mechanic) · Paralysis (denial must also block BASIC
 *   attacks, which would change Overheat's established semantics) · Meltdown (its gate is "damage from
 *   a basic attack or active skill" — no incoming-skill-type gate exists).
 *
 * NOTHING here is `Validated`: every value is the source's (`[SOURCE]`, level 5) and **Not Tested**.
 */

const at = (x: number, y: number): GridCoord => ({ x, y });

const def = (id: string) => STATUS_DEFS.find((s) => s.id === id);

// ============================================================ the three defined statuses

test("T11: the three Burn tile statuses exist", () => {
  for (const id of ["conflagration", "combustion", "combustion_ii"]) {
    assert.ok(def(id), `${id} is defined`);
  }
});

test("T11: they are DEBUFFS classified Burn (the source's own tags)", () => {
  for (const id of ["conflagration", "combustion", "combustion_ii"]) {
    const d = def(id)!;
    assert.equal(d.category, "debuff", `${id} is a debuff`);
    assert.equal(d.element, "burn", `${id} is Burn-affiliated`);
  }
});

test("T11: no `phase` attribute is invented (only Overburn→Burn is in-game validated)", () => {
  // `element` is the source's CLASSIFICATION; `phase` marks a validated status→Phase relationship.
  // The source says "Considered a Burn debuff" — that is classification, not an observed Phase.
  for (const id of ["conflagration", "combustion", "combustion_ii"]) {
    assert.equal(def(id)!.phase ?? null, null, `${id} carries no invented phase`);
  }
  assert.equal(def("overburn")!.phase, "burn", "the one validated relationship is unchanged");
});

// ============================================================ Conflagration

test("T11: Conflagration is Burn damage taken +20% (taken-side, element-gated)", () => {
  const d = def("conflagration")!;
  assert.equal(d.effects.length, 1);
  assert.deepEqual(d.effects[0], {
    kind: "damage_modifier",
    scope: "taken",
    mode: "additive",
    value: 0.2,
    whenElement: ["burn"],
  });
});

test("T11: Conflagration's +20% applies to a BURN hit and NOT to a phase-less one (the gate bites)", () => {
  // Exercised through the REAL taken-side helper the damage path uses.
  const state = createState(scenario(), REGISTRY, new Set());
  const dummy = state.dummy;
  dummy.statuses = [];
  const registry = state.statusRegistry;

  assert.equal(additiveTakenBonus(dummy, registry, "burn"), 0, "control: no status, no bonus");

  applyStatus(state, dummy, { statusId: "conflagration", durationRounds: 2, source: "burn tile Lv1" });
  const burn = additiveTakenBonus(dummy, registry, "burn");
  const phaseLess = additiveTakenBonus(dummy, registry, null);
  const hydro = additiveTakenBonus(dummy, registry, "hydro");

  assert.ok(Math.abs(burn - 0.2) < 1e-9, `Burn hit gets +0.20 (got ${burn})`);
  assert.equal(phaseLess, 0, "a phase-less hit is NOT Burn damage");
  assert.equal(hydro, 0, "neither is a Hydro hit — the source gates to Burn");
});

// ============================================================ Combustion / Combustion II

test("T11: Combustion deals 15% of the inflictor's ATK, on gain and at action end", () => {
  assert.deepEqual(def("combustion")!.effects, [
    { kind: "fixed_damage", percentOfAtk: 0.15, applies: ["onApply", "onTick"] },
  ]);
});

test("T11: Combustion II deals 20% at the higher tier", () => {
  assert.deepEqual(def("combustion_ii")!.effects, [
    { kind: "fixed_damage", percentOfAtk: 0.2, applies: ["onApply", "onTick"] },
  ]);
});

test("T11: their stack caps are the source's (3 and 5) and they are UN-DISPELTABLE", () => {
  assert.equal(def("combustion")!.maxStacks, 3, "source: 'up to a maximum of 3 stacks'");
  assert.equal(def("combustion_ii")!.maxStacks, 5, "source: 'up to a maximum of 5 stacks'");
  assert.equal(def("combustion")!.stackable, true);
  assert.equal(def("combustion_ii")!.stackable, true);
  assert.equal(def("combustion")!.purgeable, false, "source: 'cannot be dispelled'");
  assert.equal(def("combustion_ii")!.purgeable, false, "source: 'cannot be dispelled'");
  assert.equal(def("conflagration")!.purgeable, true, "the source does NOT say Conflagration is un-dispellable");
});

test("T11: the stack-SCALING question is recorded as unresolved, NOT invented", () => {
  // The source states the cap but never says the damage multiplies per stack; the engine's fixed
  // damage applies its percentage once. That reading is left as-is and flagged.
  for (const id of ["combustion", "combustion_ii"]) {
    assert.ok(def(id)!.deferredNote, `${id} carries a deferredNote`);
    assert.match(def(id)!.deferredNote!, /scales per stack|per stack/i, `${id} records the unresolved stack-scaling question`);
  }
});

test("T11: the HOLDER-SIDE AREA clause is recorded as deferred, not silently dropped", () => {
  // "self AND ALL ALLIES WITHIN a 2/3-tile radius" — the area half is holder-side area targeting,
  // DEFERRED (§3.33 / G14). Same treatment as Overburn, whose analogous clause is recorded in
  // `docs/dolls/vector.md` §7.1 rather than in its own `note`.
  for (const id of ["combustion", "combustion_ii"]) {
    assert.match(def(id)!.deferredNote!, /HOLDER-side|holder-side/, `${id} records the deferred area clause`);
    assert.match(def(id)!.deferredNote!, /3\.33|G14/, `${id} names the owning deferral`);
  }
});

// ============================================================ registry / data wiring

test("T11: all three resolve through the registry (applyStatus will not throw)", () => {
  const map = statusMap();
  for (const id of ["conflagration", "combustion", "combustion_ii"]) {
    assert.ok(map.has(id), `${id} is in the status map`);
  }
});

test("T11: they are `verified: false` — [SOURCE] only, NOT validated by us", () => {
  // The field's contract (src/model/types.ts): unverified values are SURFACED (warnings) rather than
  // silently assumed. These come from the community database's effect records, not our own in-game
  // observation, so they must declare themselves unverified — matching `extra_command`'s precedent.
  for (const id of ["conflagration", "combustion", "combustion_ii"]) {
    assert.equal(def(id)!.verified, false, `${id} is not marked validated`);
    assert.match(def(id)!.note!, /\[SOURCE\]/, `${id}'s note states its [SOURCE] provenance`);
  }
  // Control: a genuinely validated status stays true.
  assert.equal(def("overburn")!.verified, true, "Overburn IS in-game validated");
});

// ============================================================ the tile table is now complete

test("T11: every Burn tile level applies its FULL source set and has NO pending statuses", () => {
  const want: Record<number, string[]> = {
    1: ["overburn", "conflagration"],
    2: ["overburn", "conflagration", "combustion"],
    3: ["overburn", "conflagration", "combustion_ii"],
  };
  for (const level of [1, 2, 3]) {
    const data = tileEffectsFor(["burn"], level)!;
    assert.deepEqual(data.applies.map((a) => a.statusId), want[level]);
    assert.deepEqual(data.pendingStatusIds, [], `Lv${level} has nothing pending — T11 filled the gap`);
  }
});

test("T11: a Burn tile applies its whole set end to end, and each status carries tile provenance", () => {
  const state = createState(scenario(), REGISTRY, new Set());
  generateTiles(state.grid!, { origin: at(7, 7), shape: "manhattan", radius: 0, elements: ["burn"], generatedBy: "qiongjiu" });
  const applied = applyTileEffectsOnActionEnd(state, state.dummy, false);
  assert.deepEqual(applied, ["overburn", "conflagration"], "Lv1's full source set");
  for (const s of state.dummy.statuses) {
    assert.equal(s.source, "burn tile Lv1");
    assert.ok(s.applier, "each carries the applier (the tile's generator)");
  }
});

// ============================================================ scope guard

test("T11: the six NOT-expressible statuses are NOT defined (no half-implementation)", async () => {
  // Defining these would require inventing mechanics the engine lacks. They stay undefined until
  // their prerequisite exists — recorded in docs/tiles.md §10.
  const blocked = ["stability_loss_i", "frozen", "damp", "paralysis", "congestion", "meltdown"];
  const ids = new Set(STATUS_DEFS.map((s) => s.id));
  for (const id of blocked) {
    assert.equal(ids.has(id), false, `${id} is deliberately NOT defined yet (blocked — see docs/tiles.md §10)`);
  }
});

// ------------------------------------------------------------ fixtures

function scenario(): Scenario {
  const grid: GridConfig = {
    size: 15,
    units: [{ unitId: "qiongjiu", coord: at(2, 2) }],
    boss: { center: at(7, 7), footprintSide: 3 },
  };
  return {
    version: 1,
    seed: 1,
    turns: 3,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], applyDispatchStats: false }],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 0, stability: 0, weaknesses: [], phase: null, cover: "none" },
    grid,
  };
}
