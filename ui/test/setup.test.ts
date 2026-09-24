import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScenario, DEFAULT_SETUP, SetupError, SetupStore, PHASE_WEAKNESSES, AMMO_WEAKNESSES, REPRESENTABLE_PHASE_IDS, type SetupState } from "../src/shared/setup.js";
import type { LogEventView, ScenarioView } from "../src/shared/engine-types.js";

function setupWith(): SetupState {
  return {
    ...DEFAULT_SETUP,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true }],
    rotations: { qiongjiu: ["basic", "active1"] },
  };
}

test("setup: the default Turns value is 7 (MVP cap), preserved into the engine scenario", () => {
  assert.equal(DEFAULT_SETUP.turns, 7, "Simulation Settings default Turns = 7");
  const sc: ScenarioView = buildScenario(setupWith());
  assert.equal(sc.version, 1);
  assert.equal(sc.turns, 7, "default turns reach the engine scenario");
  assert.equal(sc.seed, 7);
  assert.equal(sc.team.length, 1);
  assert.deepEqual(sc.team[0].rotation, ["basic", "active1"]);
  assert.equal(sc.dummy.cover, "none");
  assert.equal(sc.grid, undefined);
});

test("setup: gridEnabled produces the 15x15 sample grid", () => {
  const sc = buildScenario({ ...setupWith(), gridEnabled: true });
  assert.equal(sc.grid?.size, 15);
  assert.ok(sc.grid?.units.some((u) => u.unitId === "qiongjiu"));
});

test("setup: rejects no characters and empty rotations with clear errors", () => {
  assert.throws(() => buildScenario(DEFAULT_SETUP), SetupError);
  assert.throws(
    () => buildScenario({ ...setupWith(), rotations: { qiongjiu: [] } }),
    (e: unknown) => e instanceof SetupError && /empty rotation/.test(e.message),
  );
});

test("setup: rejects turns outside the engine MVP cap (1-7)", () => {
  assert.throws(() => buildScenario({ ...setupWith(), turns: 8 }), SetupError);
  assert.throws(() => buildScenario({ ...setupWith(), turns: 0 }), SetupError);
  assert.doesNotThrow(() => buildScenario({ ...setupWith(), turns: 7 }));
});

test("setup: a 7-turn configuration is preserved into the engine contract", () => {
  // Regression for the "simulation stops at turn 2" bug: the builder must emit exactly the
  // configured turns (a node-level trace confirmed the engine runs all 7 rounds when 7 arrives).
  const sc = buildScenario({ ...setupWith(), turns: 7 });
  assert.equal(sc.turns, 7);
  assert.equal(sc.seed, DEFAULT_SETUP.seed);
});

test("setup: unknown phase weakness ids are rejected loudly (no silent filtering)", () => {
  assert.throws(
    () => buildScenario({ ...setupWith(), dummy: { ...DEFAULT_SETUP.dummy, weaknesses: ["burn", "nonsense"], ammoWeaknesses: [] } }),
    (e: unknown) => e instanceof SetupError && /authoritative taxonomy/.test(e.message),
  );
});

test("setup: Training Dummy with an Ammo Weakness automatically receives the AWU-triggering passive", () => {
  const sc = buildScenario({
    ...setupWith(),
    dummy: { ...DEFAULT_SETUP.dummy, weaknesses: [], ammoWeaknesses: ["medium_ammo"] },
  });
  const passives = (sc.dummy as never as { passives?: Array<{ id: string; effects: Array<Record<string, unknown>> }> }).passives!;
  assert.equal(passives.length, 1);
  assert.equal(passives[0].id, "awu");
  const effect = passives[0].effects.find((e) => e.kind === "grant_stacks_on_weakness_exploit")!;
  assert.equal(effect.weaknessTag, "medium_ammo");
  assert.equal(effect.statusId, "ammo_weakness_upgrade");
  assert.equal(effect.firstGain, 2);
  assert.equal(effect.gainPerEvent, 1);
  assert.equal(effect.maxStacks, 5);
  assert.deepEqual(effect.requiresElements, [null], "AWU trigger limited to phase-less (physical-ammo) attacks — the Ammo dimension");
  // The basic ammo weakness dimension is also preserved.
  assert.deepEqual((sc.dummy as never as { weaknessTags: string[] }).weaknessTags, ["medium_ammo"]);
});

test("setup: multiple Ammo Weaknesses produce one AWU trigger effect per tag", () => {
  const sc = buildScenario({
    ...setupWith(),
    dummy: { ...DEFAULT_SETUP.dummy, weaknesses: [], ammoWeaknesses: ["medium_ammo", "shotgun_ammo"] },
  });
  const passives = (sc.dummy as never as { passives?: Array<{ effects: Array<{ weaknessTag: string }> }> }).passives!;
  const tags = passives[0].effects.map((e) => e.weaknessTag).sort();
  assert.deepEqual(tags, ["medium_ammo", "shotgun_ammo"]);
});

test("setup: Training Dummy with NO Ammo Weakness does NOT receive the AWU passive", () => {
  const sc = buildScenario({ ...setupWith(), dummy: { ...DEFAULT_SETUP.dummy, weaknesses: [], ammoWeaknesses: [] } });
  assert.equal((sc.dummy as never as { passives?: unknown }).passives, undefined);
});

test("weakness options: exactly the five authoritative PHASE weaknesses (no Physical/Acid/Decay)", () => {
  const labels = new Set(PHASE_WEAKNESSES.map((p) => p.label));
  assert.deepEqual([...labels], ["Burn", "Hydro", "Freeze", "Electric", "Corrosion"]);
  assert.equal(labels.has("Physical"), false);
  assert.equal(labels.has("Acid"), false);
  assert.equal(labels.has("Decay"), false);
  // All five phases map onto real engine Elements (hydro first-class since 2026; ice→freeze,
  // acid→corrosion renames). physical/decay are NOT part of the taxonomy (removed).
  assert.equal(PHASE_WEAKNESSES.find((p) => p.label === "Burn")!.elementId, "burn");
  assert.equal(PHASE_WEAKNESSES.find((p) => p.label === "Hydro")!.elementId, "hydro");
  assert.equal(PHASE_WEAKNESSES.find((p) => p.label === "Freeze")!.elementId, "freeze");
  assert.equal(PHASE_WEAKNESSES.find((p) => p.label === "Electric")!.elementId, "electric");
  assert.equal(PHASE_WEAKNESSES.find((p) => p.label === "Corrosion")!.elementId, "corrosion");
  assert.equal(new Set(REPRESENTABLE_PHASE_IDS).size, 5);
});

test("weakness options: exactly the five authoritative AMMO weaknesses (engine AmmoType 1:1)", () => {
  const labels = new Set(AMMO_WEAKNESSES.map((a) => a.label));
  assert.deepEqual([...labels], ["Heavy Ammo", "Medium Ammo", "Light Ammo", "Shotgun Ammo", "Melee"]);
  assert.deepEqual(new Set(AMMO_WEAKNESSES.map((a) => a.tag)), new Set(["heavy_ammo", "medium_ammo", "light_ammo", "shotgun_ammo", "melee"]));
});

test("weakness preservation: selected phase weaknesses survive into the engine contract", () => {
  const sc = buildScenario({
    ...setupWith(),
    dummy: { ...DEFAULT_SETUP.dummy, weaknesses: ["burn", "freeze", "electric", "hydro", "corrosion"], ammoWeaknesses: [] },
  });
  assert.deepEqual((sc.dummy as never as { weaknesses: string[] }).weaknesses, ["burn", "freeze", "electric", "hydro", "corrosion"]);
});

test("weakness preservation: selected ammo weaknesses flow through dummy.weaknessTags", () => {
  const sc = buildScenario({
    ...setupWith(),
    dummy: {
      ...DEFAULT_SETUP.dummy,
      weaknesses: [],
      ammoWeaknesses: ["medium_ammo", "shotgun_ammo", "melee"],
    },
  });
  assert.deepEqual((sc.dummy as never as { weaknessTags: string[] }).weaknessTags, ["medium_ammo", "shotgun_ammo", "melee"]);
});

test("weakness guard: all five phases accepted; physical/decay rejected as never-selectable attack elements", () => {
  // Hydro + Corrosion are first-class phase weaknesses now (no longer rejected).
  const sc = buildScenario({
    ...setupWith(),
    dummy: { ...DEFAULT_SETUP.dummy, weaknesses: ["hydro", "corrosion"], ammoWeaknesses: [] },
  });
  assert.deepEqual((sc.dummy as never as { weaknesses: string[] }).weaknesses, ["hydro", "corrosion"]);
  // Physical and Decay are attack elements — NOT phase weaknesses (never mapped in).
  assert.throws(
    () => buildScenario({ ...setupWith(), dummy: { ...DEFAULT_SETUP.dummy, weaknesses: ["physical"], ammoWeaknesses: [] } }),
    (e: unknown) => e instanceof SetupError && /authoritative taxonomy/.test(e.message),
  );
  assert.throws(
    () => buildScenario({ ...setupWith(), dummy: { ...DEFAULT_SETUP.dummy, weaknesses: ["decay"], ammoWeaknesses: [] } }),
    SetupError,
  );
});

test("setup store: initial Setup uses defaults", () => {
  const store = new SetupStore();
  assert.deepEqual(store.get(), DEFAULT_SETUP);
});

test("setup store: session persistence — edited configuration survives and the newest edit wins", () => {
  // Simulates the app flow: defaults → user edits (turns 7, DEF 3500, ammo weakness, character
  // + rotation) → return to Setup reads the SAME store → further edits replace it → newest wins.
  const store = new SetupStore();
  const edited: SetupState = {
    ...store.get(),
    turns: 7,
    dummy: { ...store.get().dummy, defense: 3500, ammoWeaknesses: ["medium_ammo"] },
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true }],
    rotations: { qiongjiu: ["basic", "active1"] },
  };
  store.set(edited);
  const returned = store.get();
  assert.equal(returned.turns, 7, "turns preserved after returning to Setup");
  assert.equal(returned.dummy.defense, 3500, "target DEF preserved");
  assert.deepEqual(returned.dummy.ammoWeaknesses, ["medium_ammo"], "ammo weakness preserved");
  assert.deepEqual(returned.characters, [{ id: "qiongjiu", name: "Qiongjiu", selected: true }], "character selection preserved");
  assert.deepEqual(returned.rotations, { qiongjiu: ["basic", "active1"] }, "rotation preserved");
  assert.equal(returned.seed, DEFAULT_SETUP.seed);

  // Editing a preserved value (seed) becomes the new remembered configuration.
  const editedAgain: SetupState = { ...store.get(), seed: 42 };
  store.set(editedAgain);
  const newest = store.get();
  assert.equal(newest.seed, 42, "newest configuration preserved");
  assert.equal(newest.turns, 7, "earlier edits survive the newest change");
  assert.deepEqual(newest.dummy.ammoWeaknesses, ["medium_ammo"]);
});

test("setup store: starting a simulation uses the store's current configuration (edits are not lost)", () => {
  const store = new SetupStore();
  store.set({ ...store.get(), turns: 7, characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true }], rotations: { qiongjiu: ["basic"] } });
  const sc = buildScenario(store.get());
  assert.equal(sc.turns, 7, "run uses the edited configuration");
  assert.equal(sc.team[0].characterId, "qiongjiu");
});

test("end-to-end: Setup-built Training Dummy drives the real engine AWU progression (Medium Ammo)", async () => {
  // setup → buildScenario → simulateScenario (real engine). The Setup-emitted AWU passive must
  // advance ammo_weakness_upgrade 2→3→4→5→5 while the basic weakness stays one ×1.10 exploit.
  // (Requires the engine build output under ../dist; runs the real engine, no damage-number
  // inference — asserts the actual state/log fields.)
  const sim = await import(new URL("../../../dist/simulate.js", import.meta.url).href);
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simulateScenarioEngine = (sim as { simulateScenario: (s: unknown, r: unknown) => any }).simulateScenario;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY;
  const sc = buildScenario({
    ...setupWith(),
    turns: 5,
    rotations: { qiongjiu: ["basic", "basic", "basic", "basic", "basic"] },
    dummy: { ...DEFAULT_SETUP.dummy, weaknesses: [], ammoWeaknesses: ["medium_ammo"] },
  });
  const passives = (sc.dummy as never as { passives?: Array<{ effects: Array<{ weaknessTag: string }> }> }).passives;
  assert.ok(passives && passives[0].effects.some((e) => e.weaknessTag === "medium_ammo"), "Setup dummy carries the AWU trigger");
  const result = simulateScenarioEngine(sc as never, REGISTRY);
  assert.equal(result.turns, 5, "configured turns reach the engine");
  const basics: LogEventView[] = result.log.filter((e: LogEventView) => e.action === "qiongjiu_basic");
  assert.equal(basics.length, 5);
  const stacks = basics.map((e: LogEventView) => (e.upgradeStacks ?? []).find((u: { statusId: string }) => u.statusId === "ammo_weakness_upgrade")?.stacks ?? 0);
  assert.deepEqual(stacks, [2, 3, 4, 5, 5], "AWU progression first +2 then +1, capped at 5");
  for (const ev of basics) {
    assert.deepEqual(ev.weaknessExploited, ["medium_ammo"], "one ammo weakness match per hit (basic ×1.10)");
    assert.equal(ev.phaseMult, 1);
  }
  // AWU tier bonuses land in the additive DMG% bucket (bracket = 1 + 0.10 no-cover + tier).
  const brackets = basics.map((e: LogEventView) => Number(e.bonusBracket.toFixed(2)));
  assert.deepEqual(brackets, [1.17, 1.21, 1.27, 1.35, 1.35], "tiers +7%/+11%/+17%/+25% in the DMG% bucket");
});

test("grid: enabled with a no-Mobility unit strips scripted moves but keeps the rest of the grid", () => {
  // Qiongjiu has no CharacterDef.mobility (engine data) → the setup must NOT attach scripted
  // moves (the engine would reject them), while placement/tiles/ladders stay available.
  const sc: ScenarioView = buildScenario({ ...setupWith(), gridEnabled: true });
  assert.ok(sc.grid, "grid stays enabled");
  const g = sc.grid!;
  assert.deepEqual(g.moves!, [], "no scripted moves without declared Mobility");
  assert.equal(g.units.length, 1, "Qiongjiu placement kept");
  assert.equal(g.units[0].unitId, "qiongjiu");
  assert.equal(g.units[0].coord.x, 4);
  assert.equal(g.blockedTiles!.length, 3, "blocked tiles kept");
  assert.ok(g.ladders!.length >= 1, "ladders kept");
});

test("grid: enabled with a declared-Mobility unit keeps its scripted moves", () => {
  const setup = {
    ...setupWith(),
    gridEnabled: true,
    characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true, mobility: 5 }],
  };
  const sc: ScenarioView = buildScenario(setup);
  const g = sc.grid!;
  assert.equal(g.moves!.length, 2, "both scripted moves kept when Mobility is declared");
  assert.deepEqual(g.moves![0], { unitId: "qiongjiu", round: 1, to: { x: 5, y: 7 } });
  assert.deepEqual(g.moves![1], { unitId: "qiongjiu", round: 2, to: { x: 5, y: 6 } });
});

test("grid: disabled → no grid attached", () => {
  const sc: ScenarioView = buildScenario(setupWith());
  assert.equal(sc.grid, undefined);
});

test("end-to-end: grid-enabled no-Mobility Qiongjiu setup runs the real engine without a Mobility-0 error", async () => {
  const sim = await import(new URL("../../../dist/simulate.js", import.meta.url).href);
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simulateScenarioEngine = (sim as { simulateScenario: (s: unknown, r: unknown) => any }).simulateScenario;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY;
  const sc = buildScenario({ ...setupWith(), gridEnabled: true });
  assert.deepEqual(sc.grid?.moves, [], "no moves to trip the engine's Mobility-0 legality gate");
  let result: { turns: number; log: unknown[] };
  try {
    result = simulateScenarioEngine(sc as never, REGISTRY);
  } catch (e) {
    assert.fail(`grid-enabled run threw: ${String(e)}`);
    return;
  }
  assert.equal(result.turns, DEFAULT_SETUP.turns);
  assert.ok(result.log.length >= 1, "simulation produced events");
});