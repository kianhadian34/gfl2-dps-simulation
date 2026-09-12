import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { ActionSlot, ConfigOverrides, Scenario } from "../model/types.js";

/**
 * Qiongjiu V4 — Vulnerable I (VALIDATED in-game 2026):
 *   • Applied on the EXISTING Steady Plan Support Action trigger, immediately BEFORE Qiongjiu's
 *     Support Action resolves (so Vulnerable is present when the support hit lands).
 *   • 1 turn — expires immediately when the target finishes its own turn.
 *   · Independent of Confectance level / the max-Confectance Ultimate branch.
 *
 * Reference brackets (QJ passive Lv2 at V3+ = No-Cover +0.10 and Support Action +0.10; SB II
 * (Ult) = +0.30 Support-scoped; Vulnerable I = +0.10 taken on the target):
 *   support WITHOUT V4 (fort 3): 1 + 0.10 + 0.10 + 0.30 = 1.50
 *   support WITH V4   (fort 4): 1 + 0.10 + 0.10 + 0.30 + 0.10 (Vulnerable, taken) = 1.60
 *   QJ Basic (never support-scoped): 1 + 0.10 (No-Cover) [+0.10 if Vulnerable still active]
 */

const ALLY = makeAlly("v4_ally", 1000);

function sc(opts: { turns: number; qjRotation: ActionSlot[]; allyRotation: ActionSlot[]; fort: number; start: number }): Scenario {
  const cfg: ConfigOverrides = { confectanceStart: opts.start, fortificationLevel: opts.fort };
  return {
    version: 1,
    seed: 7,
    turns: opts.turns,
    team: [
      { characterId: "qiongjiu", rotation: opts.qjRotation, equippedFixedKeys: [] },
      { characterId: "v4_ally", rotation: opts.allyRotation, equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: cfg,
  };
}

const reg = customRegistry({ v4_ally: ALLY });
const supports = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.supportAttack);

test("V4 below max Confectance: Vulnerable I is applied BEFORE the Support Action (present when it resolves)", () => {
  // confectanceStart 3 = BELOW the cap of 6 → the max-Confectance branch never fires; V4 still applies.
  const v4 = simulateScenario(sc({ turns: 1, qjRotation: ["ultimate"], allyRotation: ["basic"], fort: 4, start: 3 }), reg);
  const sup = supports(v4)[0];
  assert.ok(sup, "expected a Support Action from the ally hit");
  const ob = (sup.appliedSources ?? []).filter((s) => s.statusId === "vulnerable_i");
  assert.equal(ob.length, 1, `V4 must apply Vulnerable I on the support event: ${JSON.stringify(sup.appliedSources)}`);
  // Vulnerable is ON the target when the support resolves → its +10% (taken) is in the support hit.
  assert.ok(Math.abs(sup.bonusBracket - 1.6) < 1e-9, `V4 support bracket ${sup.bonusBracket} (expected 1.60 incl. Vulnerable)`);

  // Control: same setup at fort 3 (V3, no V4) → identical except NO Vulnerable → 1.50.
  const ctl = simulateScenario(sc({ turns: 1, qjRotation: ["ultimate"], allyRotation: ["basic"], fort: 3, start: 3 }), reg);
  const cSup = supports(ctl)[0];
  assert.ok(Math.abs(cSup.bonusBracket - 1.5) < 1e-9, `control support bracket ${cSup.bonusBracket} (expected 1.50)`);
  assert.equal((cSup.appliedSources ?? []).some((s) => s.statusId === "vulnerable_i"), false, "no Vulnerable without V4");
  assert.ok(Math.abs(sup.bonusBracket - cSup.bonusBracket - 0.1) < 1e-9, "V4 adds exactly the +10% taken to the support hit");
});

test("V4 max Confectance is NOT required: an at-max cast also applies Vulnerable I (both branches)", () => {
  const belowMax = simulateScenario(sc({ turns: 1, qjRotation: ["ultimate"], allyRotation: ["basic"], fort: 4, start: 3 }), reg);
  const atMax = simulateScenario(sc({ turns: 1, qjRotation: ["ultimate"], allyRotation: ["basic"], fort: 4, start: 6 }), reg);
  for (const [label, r] of [["below max", belowMax], ["at max", atMax]] as const) {
    const sup = supports(r)[0];
    assert.equal((sup.appliedSources ?? []).filter((s) => s.statusId === "vulnerable_i").length, 1, `Vulnerable missing (${label})`);
    assert.ok(Math.abs(sup.bonusBracket - 1.6) < 1e-9, `${label}: bracket ${sup.bonusBracket} — Vulnerable must apply regardless of Confectance`);
  }
});

test("V4 Vulnerable I disappears when the target finishes its turn (1 turn, target turn-end expiry)", () => {
  // r1: QJ casts the Ultimate, the ally hits → Support Action applies Vulnerable I before it resolves;
  //     the target then finishes its own (pass) turn → Vulnerable must expire there.
  // r2: QJ's Basic comes FIRST (a non-support hit, no re-application) — if Vulnerable had survived,
  //     the Basic would carry +0.10 taken (bracket 1.20); expired ⇒ bracket 1.10.
  const r = simulateScenario(
    sc({ turns: 2, qjRotation: ["ultimate", "basic"], allyRotation: ["basic", "basic"], fort: 4, start: 3 }),
    reg,
  );
  const r1Sup = supports(r).find((e) => e.round === 1)!;
  assert.equal((r1Sup.appliedSources ?? []).filter((s) => s.statusId === "vulnerable_i").length, 1, "r1: Vulnerable applied by V4");
  const r2Basic = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(r2Basic.bonusBracket - 1.1) < 1e-9, `r2 Basic bracket ${r2Basic.bonusBracket} — Vulnerable must have expired at the target's turn end (1.20 would mean it persisted)`);
  assert.deepEqual(r2Basic.weaknessExploited, []);
});