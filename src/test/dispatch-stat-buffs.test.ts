import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import type { DummyConfig, Scenario } from "../model/types.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REGISTRY } from "../data/registry.js";
import { DISPATCH_STAT_BUFFS } from "../data/dispatch.js";

/**
 * DISPATCH STAT BUFFS (2026) — the permanent GLOBAL class-stat system.
 *
 * These tests prove DISPATCH behaviour. Dispatch is delivered together with the other permanent
 * character/global stat sources (Remolder Lv.60 flats, Neural Helix) behind ONE fixture switch, so
 * the math/oracle tests here pin the character's stat basis explicitly (applyDispatchStats:false +
 * explicit baseStatOverrides) to observe DISPATCH alone and stay independent of Qiongjiu's
 * ever-changing live panel. The DEBUG-authoritative rows exercise the LIVE stack on purpose.
 * The real-Qiongjiu "all implemented systems" panel lives in qiongjiu-integration.test.ts.
 */
const dummy: DummyConfig = { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" };

/** CONTROLLED dispatch basis: the permanent character/global stat bundle is OFF, so the ONLY flat
 *  under observation is what each test adds. Qiongjiu's Sentinel class still routes dispatch. */
function ctrlScenario(extra: Partial<Scenario["team"][number]> = {}): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    // applyDispatchStats AFTER the spread so a fixture basis can never accidentally re-enable it.
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...extra, applyDispatchStats: false }],
    dummy,
  };
}

/** CONTROLLED basis WITH the permanent bundle LIVE (dispatch + Remolder flats + Neural Helix), with
 *  the character's base pinned so the DISPATCH contribution is observable and Qiongjiu-independent. */
function liveScenario(extra: Partial<Scenario["team"][number]> = {}): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...extra }],
    dummy,
  };
}

/** LIVE character run: no applyDispatchStats ⇒ the full permanent stack applies (production semantics). */
function qjScenario(extra: Partial<Scenario["team"][number]> = {}): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
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

test("Qiongjiu is a Sentinel (mandatory class) and dispatches its class flat onto base", () => {
  assert.equal(QIONGJIU.class, "sentinel");
  // Isolate DISPATCH on a controlled basis: the Sentinel class row (+231/+519/+222) enters the
  // flat bucket, then the live percentage buckets apply. Control (bundle OFF) vs live (bundle ON).
  const off = createState(ctrlScenario({ baseStatOverrides: { atk: 802, hp: 1893, def: 528 } }), REGISTRY, new Set()).units[0];
  const on = createState(liveScenario({ baseStatOverrides: { atk: 802, hp: 1893, def: 528 } }), REGISTRY, new Set()).units[0];
  assert.equal(off.panelAtk, 802, "control run = base only (bundle OFF)");
  assert.equal(on.panelAtk, 1939, "base 802 + dispatch 231 + Remolder 245 + NH 196 + affinity Lv5 115, then the live 22% ATK%: ceil(1589 × 1.22)");
  assert.equal(on.hp, 4162, "base 1893 + dispatch 519 + Remolder 679 + NH 333 + affinity Lv5 292, then the live 12% HP%: ceil(3716 × 1.12)");
  assert.equal(on.defStat, 1315, "base 528 + dispatch 222 + Remolder 224 + NH 92 + affinity Lv5 108, then the live 12% DEF%: ceil(1174 × 1.12)");
  assert.equal(on.stability, 9, "dispatch never touches stability");
});

test("controlled fixture basis: the permanent dispatch row is excluded (panel = base only, no weapon)", () => {
  const u = createState(ctrlScenario({ baseStatOverrides: { atk: 802, hp: 1893, def: 528 } }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 802, "fixture panel = base only (no dispatch/Remolder/Neural Helix)");
  assert.equal(u.hp, 1893);
  assert.equal(u.defStat, 528);
});

test("weapon flat + ATK% fold BEFORE the percentage: ceil((802 + 231 + 369) × 1.15)", () => {
  // base 802 + Sentinel dispatch 231 + Golden Melody flat 369, then × 1.15 (weapon ATK% sub-stat).
  // Controlled basis (bundle ON so dispatch applies) + weapon flat, then the weapon's own ATK%.
  const u = createState(liveScenario({ baseStatOverrides: { atk: 802, hp: 1893, def: 528 }, weaponId: "jinshizou" }), REGISTRY, new Set()).units[0];
  // computePanel: ceil((base 802 + dispatch 231 + Remolder 245 + NH 196 + affinity Lv5 115 + weapon 369) × 1.15 weaponATK%)
  // then the live 22% ATK% bucket: ceil(2253 × 1.22) = 2748. Flat folds BEFORE every ATK% — one panel path.
  assert.equal(u.panelAtk, Math.ceil(Math.ceil((802 + 231 + 245 + 196 + 115 + 369) * 1.15) * 1.22), "flat (base + dispatch + Remolder + NH + affinity + weapon) folded BEFORE the ATK% — one panel path");
});

test("dispatch stays separate from a base override: ATK 1000 override → +231 dispatch", () => {
  const u = createState(liveScenario({ baseStatOverrides: { atk: 1000, hp: 1893, def: 528 } }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, Math.ceil((1000 + 231 + 245 + 196 + 115) * 1.22), "override replaces base (1000) then +dispatch 231 +Remolder 245 +NH 196 +affinity 115 — independent flat sources");
});

test("percentage modifiers operate on the dispatch-inclusive flat: ceil((802 + 231) × 1.05)", () => {
  const u = createState(liveScenario({ baseStatOverrides: { atk: 802, hp: 1893, def: 528 }, commonKeyIds: ["qiongjiu_common_strategic_negotiation"] }), REGISTRY, new Set()).units[0];
  // Live ATK% = NH 22% + Strategic Negotiation 5% = 27%; the common-key % rides the dispatch-inclusive flat.
  assert.equal(u.panelAtk, Math.ceil((802 + 231 + 245 + 196 + 115) * (1 + 0.22 + 0.05)), "ceil((base + dispatch + Remolder + NH + affinity) × 1.27) — same finalStat(base + flat, pct) product");
  assert.equal(u.hp, Math.ceil((1893 + 519 + 679 + 333 + 292) * 1.12), "HP keeps the dispatch-inclusive flat × the live 12% HP%");
});

// --- DEBUG-authoritative rows: these intentionally exercise the LIVE permanent stack ------------
test("DEBUG-authoritative overrides: ATK 1500 override suppresses every ATK source; HP/DEF keep the live stack", () => {
  const u = createState(qjScenario({ baseStatOverrides: { atk: 1500 }, overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1500, "overridden stat is authoritative — no dispatch/Remolder/Neural Helix/affinity underneath");
  assert.equal(u.hp, 4162, "HP not overridden — the live permanent flat + 12% HP% apply");
  assert.equal(u.defStat, 1315, "DEF not overridden — the live permanent flat + 12% DEF% apply");
});

test("DEBUG-authoritative overrides: HP override suppresses every HP source; ATK/DEF keep the live stack", () => {
  const u = createState(qjScenario({ baseStatOverrides: { hp: 2000 }, overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.hp, 2000, "HP override authoritative");
  assert.equal(u.maxHp, 2000);
  assert.equal(u.panelAtk, 1939, "ATK still receives dispatch + Remolder flat + Neural Helix + affinity");
  assert.equal(u.defStat, 1315, "DEF still receives dispatch + Remolder flat + Neural Helix + affinity");
});

test("DEBUG-authoritative overrides: DEF override suppresses every DEF source; ATK/HP keep the live stack", () => {
  const u = createState(qjScenario({ baseStatOverrides: { def: 700 }, overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.defStat, 700, "DEF override authoritative");
  assert.equal(u.panelAtk, 1939, "ATK still receives dispatch + Remolder flat + Neural Helix + affinity");
  assert.equal(u.hp, 4162, "HP still receives dispatch + Remolder flat + Neural Helix + affinity");
});

test("DEBUG-authoritative overrides: all three overridden — all authoritative", () => {
  const u = createState(qjScenario({ baseStatOverrides: { atk: 1500, hp: 2000, def: 700 }, overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1500);
  assert.equal(u.hp, 2000);
  assert.equal(u.defStat, 700);
});

test("DEBUG-authoritative flag with NO overrides — the live permanent stack fully applies", () => {
  const u = createState(qjScenario({ overridesAuthoritative: true }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, 1939);
  assert.equal(u.hp, 4162);
  assert.equal(u.defStat, 1315);
});

test("math fixtures WITHOUT the authoritative flag keep override + dispatch coexistence: ATK 2000 override", () => {
  const u = createState(liveScenario({ baseStatOverrides: { atk: 2000, hp: 1893, def: 528 } }), REGISTRY, new Set()).units[0];
  assert.equal(u.panelAtk, Math.ceil((2000 + 231 + 245 + 196 + 115) * 1.22), "override 2000 + dispatch 231 (+ the other permanent flats), then the live 22% ATK% bucket");
});
