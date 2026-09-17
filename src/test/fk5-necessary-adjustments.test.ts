import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { STATUS_DEFS } from "../data/statuses.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef } from "../model/types.js";

/**
 * FIXED KEY 5: Necessary Adjustments (VALIDATED in-game 2026):
 * "When a phase weakness is exploited using Common Rail, gains Blazing Assault II for 2 turns."
 * Blazing Assault II: +15% ATK, Burn-buff classification, 2 turns.
 *  - PHASE-weakness exploit only; ammo-only exploits NEVER trigger.
 *  - The triggering Common Rail ALREADY uses the +15% ATK (status applied before damage).
 *
 * Validated scenario: ATK 2000 → Blazing Assault II → 2300 ATK → Common Rail 150% (3450) →
 * DEF 5000 (ratio 2300/7300) → No-Cover +20% → Burn ×1.10 → ceil = 1435 (observed in-game).
 *  ceil(3450 × (2300/7300) × 1.20 × 1.10) = ceil(1434.83) = 1435
 * No-trigger damage (no weakness): ceil(3000 × (2000/7000) × 1.20) = ceil(1028.57) = 1029 (no weakness → no Burn bonus).
 * (Holder id "qjf5" — the helper registry pins id "qiongjiu" to the real doll.)
 */

function qjf5(): CharacterDef {
  const qj = structuredClone(QIONGJIU);
  qj.id = "qjf5";
  qj.base = { ...qj.base, atk: 2000, critRate: 0 };
  qj.weapon = { ...qj.weapon, atkLvl1: 0, atkLvl60: 0, subStats: [] }; // panel ATK == 2000
  return qj;
}

function run(opts: {
  fk5?: boolean;
  weaknesses?: string[];
  weaknessTags?: string[];
  rotation?: string[];
  turns?: number;
  fortificationLevel?: number;
}) {
  const weaknesses = (opts.weaknesses ?? []) as never;
  const weaknessTags = (opts.weaknessTags ?? []) as never;
  return simulateScenario(
    {
      version: 1, seed: 7, turns: opts.turns ?? 1,
      team: [
        { characterId: "qjf5", rotation: (opts.rotation ?? ["active1"]) as never, equippedFixedKeys: opts.fk5 ? ["qiongjiu_fk5_necessary_adjustments"] : [] },
      ] as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses, weaknessTags, phase: null, cover: "none" },
      configOverrides: { fortificationLevel: opts.fortificationLevel ?? 0 },
    },
    customRegistry({ qjf5: qjf5() }),
  );
}

const hasBlazing = (e: { statusesApplied?: string[] }) => e.statusesApplied?.includes("blazing_assault_ii") === true;

test("FK5: Common Rail + phase (Burn) weakness → Blazing Assault II applies and the triggering hit uses +15% ATK (1435)", () => {
  const r = run({ fk5: true, weaknesses: ["burn"], fortificationLevel: 6 });
  const ev = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.ok(hasBlazing(ev), "triggering Common Rail applies Blazing Assault II");
  assert.equal(ev.attackerAtk, 2300, "panel 2000 × 1.15 = 2300 BEFORE the hit resolves");
  assert.equal(ev.finalDamage, 1435, "validated in-game: ceil(3450 × 2300/7300 × 1.2 × 1.1)");
});

test("FK5: Common Rail WITHOUT a phase weakness → no Blazing Assault II", () => {
  const r = run({ fk5: true, weaknesses: [], fortificationLevel: 6 });
  const ev = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.ok(!hasBlazing(ev), "no phase weakness exploited → no trigger");
  assert.equal(ev.attackerAtk, 2000, "ATK unchanged");
  assert.equal(ev.finalDamage, 1029, "ceil(3000 × 2000/7000 × 1.2) = 1029 (no Burn ×1.10 without a weakness)");
});

test("FK5: Common Rail with ONLY an ammo weakness → no Blazing Assault II (ammo-only never triggers)", () => {
  const r = run({ fk5: true, weaknesses: [], weaknessTags: ["medium"], fortificationLevel: 6 });
  const ev = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.ok(!hasBlazing(ev), "ammo weakness alone does not satisfy the phase-weakness trigger");
  assert.equal(ev.attackerAtk, 2000);
});

test("FK5: Basic Fuse does not trigger Blazing Assault II", () => {
  const r = run({ fk5: true, weaknesses: ["burn"], rotation: ["basic"], fortificationLevel: 6 });
  const ev = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(ev, "Basic Attack executed against the Burn-weak target");
  assert.ok(!hasBlazing(ev), "trigger is Common Rail ONLY");
});

test("FK5: Guide to Victory does not trigger Blazing Assault II", () => {
  const r = run({ fk5: true, weaknesses: ["burn"], rotation: ["active2"], fortificationLevel: 6 });
  const ev = r.log.find((e) => e.action === "qiongjiu_guide_to_victory")!;
  assert.ok(ev, "Guide executed against the Burn-weak target");
  assert.ok(!hasBlazing(ev), "trigger is Common Rail ONLY");
});

test("FK5: Support Action does not trigger Blazing Assault II", () => {
  // QJ in Support Mode fires her support attack (Guide) during the allied turn; the FK5 hook is
  // gated to Common Rail's skill id, so NO event in the whole scenario may carry Blazing Assault II.
  const qj = qjf5();
  const ally = makeAlly("ally", 1000);
  const r = simulateScenario(
    {
      version: 1, seed: 7, turns: 1,
      team: [
        { characterId: "ally", rotation: ["basic"], equippedFixedKeys: [] },
        { characterId: "qjf5", rotation: ["basic"], equippedFixedKeys: ["qiongjiu_fk5_necessary_adjustments"] },
      ] as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: ["burn"], phase: null, cover: "none" },
    },
    customRegistry({ ally, qjf5: qj }),
  );
  assert.equal(r.log.some(hasBlazing), false, "no Blazing Assault II anywhere in the support scenario");
});

test("FK5: Ultimate (Pressing Momentum) does not trigger Blazing Assault II", () => {
  const r = run({ fk5: true, weaknesses: ["burn"], rotation: ["ultimate"], fortificationLevel: 6 });
  const ev = r.log.find((e) => e.action === "qiongjiu_pressing_momentum")!;
  assert.ok(ev, "Ultimate executed against the Burn-weak target");
  assert.ok(!hasBlazing(ev), "trigger is Common Rail ONLY");
});

test("FK5: without the key, Common Rail + phase weakness → no Blazing Assault II", () => {
  const r = run({ fk5: false, weaknesses: ["burn"], fortificationLevel: 6 });
  const ev = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  assert.ok(!hasBlazing(ev));
  assert.equal(ev.attackerAtk, 2000);
  assert.equal(ev.finalDamage, 1132, "burn weakness present but no FK5 → no ATK buff: ceil(3000 × 2000/7000 × 1.2 × 1.1)");
});

test("FK5: Blazing Assault II lasts EXACTLY 2 turns (action-end ticks: 2300 → 2300 → 2000)", () => {
  // r1 Common Rail triggers (BLZ 2 → tick at r1 end → 1); r2 Basic still buffed (2300 → tick → 0);
  // r3 Basic sees the buff EXPIRED (2000).
  const r = run({ fk5: true, weaknesses: ["burn"], rotation: ["active1", "basic", "basic"], turns: 3, fortificationLevel: 6 });
  const stuff = r.log.filter((e) => ["qiongjiu_common_rail", "qiongjiu_basic"].includes(e.action));
  assert.equal(stuff.length, 3);
  assert.equal(stuff[0].attackerAtk, 2300, "trigger turn: +15% ATK active");
  assert.equal(stuff[1].attackerAtk, 2300, "turn 2: still active (1 tick remaining)");
  assert.equal(stuff[2].attackerAtk, 2000, "turn 3: expired after exactly 2 action-end ticks");
});

test("FK5 data: key declares Common Rail (active1) phase-weakness Blazing Assault II (2 turns); status is +15% ATK Burn buff", () => {
  const fk5 = QIONGJIU.fixedKeys.find((k) => k.id === "qiongjiu_fk5_necessary_adjustments")!;
  assert.ok(fk5.phaseWeaknessExploitStatuses, "FK5 declares its trigger");
  assert.equal(fk5.phaseWeaknessExploitStatuses!.ability, "active1", "trigger scoped to Common Rail");
  assert.equal(fk5.phaseWeaknessExploitStatuses!.statuses.length, 1);
  assert.equal(fk5.phaseWeaknessExploitStatuses!.statuses[0].statusId, "blazing_assault_ii");
  assert.equal(fk5.phaseWeaknessExploitStatuses!.statuses[0].durationRounds, 2);
  assert.equal(fk5.deferredNote, undefined, "FK5 no longer deferred");
  const def = STATUS_DEFS.find((s) => s.id === "blazing_assault_ii")!;
  assert.ok(def, "Blazing Assault II registered");
  assert.equal(def.category, "buff", "Burn buff classification");
  assert.equal(def.durationRounds, 2);
  assert.deepEqual(def.effects, [{ kind: "stat_modifier", stat: "atk", mode: "pct", value: 0.15 }], "+15% ATK through the stat-modifier system");
});