import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { REGISTRY } from "../data/registry.js";
import { PERMANENT_COOKING_STATS } from "../data/cooking-stats.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef, DummyConfig, Scenario } from "../model/types.js";

/**
 * PERMANENT COOKING STATS (2026) — a user-toggleable permanent flat ATK/DEF/HP bonus.
 *
 * The bonus enters the EXISTING flat bucket of the ONE panel path (`computePanel`) — no second stat
 * system and no separate formula. Gating matches the other permanent sources:
 *   - OFF unless the member sets `permanentCookingStats: true`;
 *   - excluded by controlled math fixtures (`applyDispatchStats: false`);
 *   - suppressed on any stat under a Debug-authoritative override.
 *
 * TESTING STRATEGY — the permanent bundle (dispatch / remolder / neural helix) is always LIVE here
 * except where a controlled fixture is the point, so the tests make NO assumption about those
 * sources' magnitudes. The key trick is EQUIVALENCE: folding `F` into the flat bucket must be
 * indistinguishable from raising the character's own base by `F`:
 *     panel(base N, cooking ON)  ===  panel(base N + F, cooking OFF)
 * That identity holds only if the bonus enters the flat bucket BEFORE percentage modifiers, so it
 * proves both the folding and its position without hard-coding any percentage.
 */

const dummy: DummyConfig = { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" };

/** A controlled doll (not a fixture — the permanent bundle stays LIVE) with a pinned base. */
function pinned(id = "h"): CharacterDef {
  const base = makeAlly(id, 1000);
  return { ...base, id, name: id, base: { ...base.base, atk: 1000, hp: 2000, def: 500 } };
}

/** Run one member with a chosen base + optional cooking flag / authoritative overrides. */
function unit(opts: { base?: { atk: number; hp: number; def: number }; cooking?: boolean; overrides?: { atk?: number; hp?: number; def?: number }; authoritative?: boolean }, char: CharacterDef = pinned()) {
  const base = opts.base ?? { atk: 1000, hp: 2000, def: 500 };
  const scenario: Scenario = {
    version: 1,
    seed: 1,
    turns: 1,
    team: [
      {
        characterId: char.id,
        rotation: ["basic"],
        equippedFixedKeys: [],
        baseStatOverrides: opts.overrides ?? base,
        ...(opts.authoritative ? { overridesAuthoritative: true } : {}),
        ...(opts.cooking ? { permanentCookingStats: true } : {}),
      },
    ],
    dummy,
  };
  return createState(scenario, customRegistry({ [char.id]: char }), new Set()).units.find((u) => u.id === char.id)!;
}

test("cooking stats: the data values are the user-provided 15 ATK / 15 DEF / 30 HP", () => {
  assert.deepEqual(PERMANENT_COOKING_STATS, { atk: 15, def: 15, hp: 30 });
});

test("cooking stats: OFF by default — absent and explicit `false` behave identically", () => {
  const absent = unit({});
  const explicitOff = unit({ cooking: false });
  assert.equal(absent.panelAtk, explicitOff.panelAtk, "absent flag = off");
  assert.equal(absent.maxHp, explicitOff.maxHp);
  assert.equal(absent.defStat, explicitOff.defStat);
  // ...and enabling it must actually change something (guards against a silent no-op).
  assert.notEqual(unit({ cooking: true }).panelAtk, absent.panelAtk, "enabling the toggle has an effect");
});

test("cooking stats: the bonus folds into the FLAT bucket BEFORE % — equivalent to raising the base", () => {
  // panel(base 1000, cooking ON) must equal panel(base 1015, cooking OFF) for ATK (+15),
  // panel(base 2000, ON) == panel(base 2030, OFF) for HP (+30),
  // panel(base 500,  ON) == panel(base 515,  OFF) for DEF (+15).
  const on = unit({ base: { atk: 1000, hp: 2000, def: 500 }, cooking: true });
  const basePlus = unit({ base: { atk: 1015, hp: 2030, def: 515 }, cooking: false });
  assert.equal(on.panelAtk, basePlus.panelAtk, "+15 ATK behaves exactly like +15 base ATK (flat, pre-%)");
  assert.equal(on.maxHp, basePlus.maxHp, "+30 HP behaves exactly like +30 base HP");
  assert.equal(on.defStat, basePlus.defStat, "+15 DEF behaves exactly like +15 base DEF");
});

test("cooking stats: CONTROLLED math fixtures (applyDispatchStats:false) exclude it even when enabled", () => {
  // Same convention as the other permanent sources, so every existing number-pinning oracle is
  // unaffected by this system.
  const member = (cooking: boolean) => ({
    characterId: "h",
    rotation: ["basic" as const],
    equippedFixedKeys: [],
    applyDispatchStats: false,
    baseStatOverrides: { atk: 1000, hp: 2000, def: 500 },
    ...(cooking ? { permanentCookingStats: true } : {}),
  });
  const char = pinned();
  const run = (cooking: boolean) =>
    createState({ version: 1, seed: 1, turns: 1, team: [member(cooking)], dummy }, customRegistry({ h: char }), new Set()).units.find((u) => u.id === "h")!;
  const off = run(false);
  const on = run(true);
  assert.equal(on.panelAtk, off.panelAtk, "controlled fixture: cooking stats never apply");
  assert.equal(on.maxHp, off.maxHp);
  assert.equal(on.defStat, off.defStat);
  assert.equal(on.panelAtk, 1000, "exactly the pinned base — the fixture switch wins over the toggle");
});

test("cooking stats: a Debug-authoritative override suppresses it on the OVERRIDDEN stat only", () => {
  // Debug ATK 1500 is authoritative → suppressed. HP/DEF are NOT overridden → still receive it.
  const common = { overrides: { atk: 1500 }, authoritative: true };
  const off = unit({ ...common, cooking: false });
  const on = unit({ ...common, cooking: true });
  assert.equal(on.panelAtk, off.panelAtk, "authoritative ATK override suppresses the cooking flat");
  assert.equal(on.panelAtk, 1500, "authoritative ATK stays exactly 1500 (no +15)");
  assert.notEqual(on.maxHp, off.maxHp, "HP not overridden → the cooking bonus still applies there");
  assert.notEqual(on.defStat, off.defStat, "DEF not overridden → the cooking bonus still applies there");
});

test("cooking stats: applies PER CHARACTER — only the enabled member receives it", () => {
  const a = pinned("a");
  const b = pinned("b");
  const state = createState(
    {
      version: 1,
      seed: 1,
      turns: 1,
      team: [
        { characterId: "a", rotation: ["basic"], equippedFixedKeys: [], baseStatOverrides: { atk: 1000, hp: 2000, def: 500 }, permanentCookingStats: true },
        { characterId: "b", rotation: ["basic"], equippedFixedKeys: [], baseStatOverrides: { atk: 1000, hp: 2000, def: 500 } },
      ],
      dummy,
    },
    customRegistry({ a, b }),
    new Set(),
  );
  const ua = state.units.find((u) => u.id === "a")!;
  const ub = state.units.find((u) => u.id === "b")!;
  assert.notEqual(ua.panelAtk, ub.panelAtk, "member a (enabled) differs from member b (disabled)");
  // Equivalent to member b having +15 base ATK — i.e. member b is untouched, member a got the bonus.
  const bPlus = unit({ base: { atk: 1015, hp: 2030, def: 515 } }, b);
  assert.equal(ua.panelAtk, bPlus.panelAtk, "member a == an identical doll whose base was raised by the bonus");
  assert.equal(ub.panelAtk, unit({}, b).panelAtk, "member b is exactly the untouched baseline");
});

test("cooking stats: it is a SEPARATE source — it never mutates the character's own base stats", () => {
  const char = pinned();
  const before = JSON.stringify(char.base);
  unit({ cooking: true }, char);
  assert.equal(JSON.stringify(char.base), before, "CharacterDef.base is never merged with the bonus");
  assert.deepEqual(char.base, { atk: 1000, hp: 2000, def: 500, stability: char.base.stability, critRate: char.base.critRate, critDmg: char.base.critDmg });
});

test("cooking stats: consistent on a REAL character (Qiongjiu + full registry)", () => {
  const run = (cooking: boolean) =>
    createState(
      { version: 1, seed: 1, turns: 1, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...(cooking ? { permanentCookingStats: true } : {}) }], dummy },
      REGISTRY,
      new Set(),
    ).units.find((u) => u.id === "qiongjiu")!;
  const off = run(false);
  const on = run(true);
  // No assumption about Qiongjiu's other permanent sources: the bonus only ever ADDS to the flat
  // bucket, so the panel is strictly higher and the run is error-free with the full registry.
  assert.ok(on.panelAtk > off.panelAtk, "enabling cooking raises Qiongjiu's ATK");
  assert.ok(Number.isFinite(on.panelAtk) && Number.isFinite(on.maxHp) && Number.isFinite(on.defStat), "real-character run produces finite stats");
});
