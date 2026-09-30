import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import type { DummyConfig, Scenario } from "../model/types.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REGISTRY } from "../data/registry.js";
import { DISPATCH_STAT_BUFFS } from "../data/dispatch.js";

/**
 * DISPATCH STAT BUFFS (2026) — the permanent GLOBAL class-stat system.
 * Real characters receive their Class's flat ATK/HP/DEF automatically (member
 * `applyDispatchStats` absent); controlled math fixtures opt out explicitly. These tests
 * validate the REAL system: a true Qiongjiu (sentinel, no fixture flag) and the 4-class table.
 */
const dummy: DummyConfig = { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" };

function qjScenario(extra: Partial<Scenario["team"][number]> = {}): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    // REAL character run: no applyDispatchStats ⇒ dispatch ALWAYS applies (production semantics).
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...extra }],
    dummy,
  };
}

test("dispatch_stat_buffs table: exactly the validated ATK/HP/DEF bonuses for all four classes", () => {
  assert.deepEqual(DISPATCH_STAT_BUFFS, {
    bulwark: { atk: 168, hp: 720, def: 270 },
    vanguard: { atk: 192, hp: 576, def: 192 },
    support: { atk: 183, hp: 618, def: 240 },
    sentinel: { atk: 231, hp: 519, def: 222 },
  });
});

test("Qiongjiu is a Sentinel (mandatory class) and receives Sentinel dispatch", () => {
  assert.equal(QIONGJIU.class, "sentinel");
  const u = createState(qjScenario(), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 802 + 231, "base 802 + dispatch +231");
  assert.equal(u.hp, 1893 + 519, "base 1893 + dispatch +519");
  assert.equal(u.maxHp, 2412);
  assert.equal(u.defStat, 528 + 222, "base 528 + dispatch +222");
  assert.equal(u.stability, 9, "dispatch never touches stability");
});

test("clean Qiongjiu panel (no weapon): ATK 1033 / HP 2412 / DEF 750", () => {
  const u = createState(qjScenario(), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1033);
  assert.equal(u.hp, 2412);
  assert.equal(u.defStat, 750);
});

test("dispatch interacts with weapon flat + percentage: ceil((802 + 231 + 369) × 1.15) = 1613", () => {
  const u = createState(qjScenario({ weaponId: "jinshizou" }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1613, "dispatch folded BEFORE the ATK% — one panel path");
});

test("dispatch remains separate from baseStatOverrides: ATK 1000 override → 1000 + 231 = 1231", () => {
  const u = createState(qjScenario({ baseStatOverrides: { atk: 1000 } }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1231, "override replaces base only; dispatch is an independent flat source");
});

test("percentage modifiers (common keys) operate on the dispatch-inclusive panel: ceil(1033 × 1.05) = 1085", () => {
  const u = createState(qjScenario({ commonKeyIds: ["qiongjiu_common_strategic_negotiation"] }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1085, "dispatch participates in the SAME finalStat(base + flat, pct) product");
  assert.equal(u.hp, 2412, "no HP% → HP stays the dispatch-inclusive value");
});
test("DEBUG-authoritative overrides: ATK 1500 override suppresses Sentinel dispatch (panel stays 1500); HP/DEF still dispatch", () => {
  const u = createState(qjScenario({ baseStatOverrides: { atk: 1500 }, overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1500, "overridden stat is authoritative ? no +231 underneath");
  assert.equal(u.hp, 2412, "HP not overridden ? dispatch still applies (1893 + 519)");
  assert.equal(u.defStat, 750, "DEF not overridden ? dispatch still applies (528 + 222)");
});

test("DEBUG-authoritative overrides: HP override suppresses dispatch HP; ATK/DEF still dispatch", () => {
  const u = createState(qjScenario({ baseStatOverrides: { hp: 2000 }, overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.hp, 2000, "HP override authoritative");
  assert.equal(u.maxHp, 2000);
  assert.equal(u.panelAtk, 1033, "ATK still receives dispatch");
  assert.equal(u.defStat, 750, "DEF still receives dispatch");
});

test("DEBUG-authoritative overrides: DEF override suppresses dispatch DEF; ATK/HP still dispatch", () => {
  const u = createState(qjScenario({ baseStatOverrides: { def: 700 }, overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.defStat, 700, "DEF override authoritative");
  assert.equal(u.panelAtk, 1033, "ATK still receives dispatch");
  assert.equal(u.hp, 2412, "HP still receives dispatch");
});

test("DEBUG-authoritative overrides: all three overridden ? all authoritative", () => {
  const u = createState(qjScenario({ baseStatOverrides: { atk: 1500, hp: 2000, def: 700 }, overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1500);
  assert.equal(u.hp, 2000);
  assert.equal(u.defStat, 700);
});

test("DEBUG-authoritative flag with NO overrides ? dispatch fully applies (no phantoms)", () => {
  const u = createState(qjScenario({ overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1033);
  assert.equal(u.hp, 2412);
  assert.equal(u.defStat, 750);
});

test("math fixtures WITHOUT the flag keep override + dispatch coexistence: ATK 2000 override ? 2231", () => {
  const u = createState(qjScenario({ baseStatOverrides: { atk: 2000 } }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 2231, "fixture override coexists with dispatch (established engine-fixture behavior)");
});
