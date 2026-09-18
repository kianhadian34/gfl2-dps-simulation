import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef } from "../model/types.js";

/**
 * EXPANSION KEY — Ruined Gem (VALIDATED in-game 2026, engine implemented):
 *  (1) While equipped, the SUPPORT ACTION's effective damage element resolves as Burn (the base
 *      `qiongjiu_support.element` stays null = Physical/phase-less); without the key it stays null.
 *  (2) On SUPPORT ACTIONS ONLY, when the target has Overburn (the Burn debuff), +0.15 enters the
 *      existing ADDITIVE dealt-DMG bucket (no separate multiplier). Never on own-turn attacks.
 *
 * Deterministic math (mirror: base ATK 2000, critRate 0; V6 Steady Plan: No-Cover +0.20 and
 * Out-of-Turn +0.10; V5 Damage Up II +0.20 pre-applied on the triggering ally's attack):
 *   Support base = 2000 × 0.9 × 2000/7000 = 514.2857
 *   no key:               bucket 0.20 No-Cover + 0.20 DU2 + 0.10 Out-of-Turn = 1.50 → ceil(514.2857 × 1.50) = 772
 *   key, no Overburn:     bucket 0.20+0.20+0.10                             = 1.50 (no +15%) → 772
 *   key + Overburn:       bucket 0.20+0.20+0.10+0.15                        = 1.65 → 848.57 × Burn ×1.10 = 933.43 → **934**
 *   own-turn (r2 QJ basic): bucket 0.20 No-Cover + 0.20 retained DU2        = 1.40 (no out-of-turn, no +15%)
 * Overburn comes from QJ's r1 Guide (applies Overburn 2 turns); the round-end dummy tick keeps it
 * active across r1/r2, so the r1/r2 Support Actions see it.
 */

const RG = "qiongjiu_exp_ruined_gem";

function qj(): CharacterDef {
  const qj = structuredClone(QIONGJIU);
  qj.id = "qjrg";
  qj.base = { ...qj.base, atk: 2000, critRate: 0, critDmg: 0 };
  return qj;
}

function run(opts: { key?: boolean; weaknesses?: string[] }) {
  const ally = makeAlly("rg_ally", 1000);
  const weaknesses = (opts.weaknesses ?? []) as never;
  return simulateScenario(
    {
      version: 1, seed: 1, turns: 2,
      team: [
        { characterId: "rg_ally", rotation: ["basic", "basic"], equippedFixedKeys: [] },
        { characterId: "qjrg", rotation: ["active2", "basic"], equippedFixedKeys: [], expansionKeyId: opts.key ? RG : undefined },
      ] as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses, phase: null, cover: "none" },
      configOverrides: { fortificationLevel: 6 },
    },
    customRegistry({ rg_ally: ally, qjrg: qj() }),
  );
}

const supports = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.supportAttack === true);

test("Ruined Gem equipped + Overburn target: effective element is Burn and +15% is additive → exact 934", () => {
  const r = run({ key: true, weaknesses: ["burn"] });
  const s = supports(r);
  assert.equal(s.length, 2, "both Support Actions fire (r1 after Guide apply, r2)");
  const last = s[s.length - 1];
  assert.deepEqual(last.weaknessExploited, ["burn"], "effective support element resolves as Burn with the key");
  assert.equal(last.bonusBracket, 1.65, "0.20 No-Cover + 0.20 DU2 + 0.10 Out-of-Turn + 0.15 Ruined Gem — same additive bucket");
  assert.equal(last.finalDamage, 934, "ceil(514.2857 × 1.65 × 1.10) — exact in-game match");
});

test("Ruined Gem NOT equipped: Support Action stays phase-less (no Burn weakness, no +15%)", () => {
  const r = run({ key: false, weaknesses: ["burn"] });
  const last = supports(r)[supports(r).length - 1];
  assert.deepEqual(last.weaknessExploited, [], "base support element remains null — no Burn exploit");
  assert.equal(last.bonusBracket, 1.50, "0.20 No-Cover + 0.20 DU2 + 0.10 Out-of-Turn only — no Ruined Gem term");
  assert.equal(last.finalDamage, 772, "ceil(514.2857 × 1.50)");
});

test("Ruined Gem equipped but target WITHOUT Overburn: no +15% (bucket stays 1.50)", () => {
  // No Guide in r1 → the dummy never gets Overburn; r1 ally basic triggers the Support Action.
  const ally = makeAlly("rg_ally", 1000);
  const r = simulateScenario(
    {
      version: 1, seed: 1, turns: 1,
      team: [
        { characterId: "rg_ally", rotation: ["basic"], equippedFixedKeys: [] },
        { characterId: "qjrg", rotation: ["basic"], equippedFixedKeys: [], expansionKeyId: RG },
      ] as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
      configOverrides: { fortificationLevel: 6 },
    },
    customRegistry({ rg_ally: ally, qjrg: qj() }),
  );
  const s = supports(r)[0];
  assert.deepEqual(s.weaknessExploited, [], "no Burn weakness on this target → nothing exploited (element override still in effect)");
  assert.equal(s.bonusBracket, 1.50, "no +15% without the Burn debuff: 0.20+0.20+0.10");
  assert.equal(s.finalDamage, 772, "ceil(514.2857 × 1.50) — no Burn weakness here");
});

test("Ruined Gem +15% does NOT leak into Qiongjiu's own-turn attacks", () => {
  const r = run({ key: true, weaknesses: ["burn"] });
  const ownBasic = r.log.find((e) => e.action === "qiongjiu_basic")!; // r2 QJ own turn
  assert.ok(ownBasic, "r2 QJ own-turn Basic executed while the target has Overburn");
  assert.equal(ownBasic.bonusBracket, 1.40, "own-turn bracket: No-Cover 0.20 + retained DU2 0.20 — NO out-of-turn 0.10, NO +15% Ruined Gem (1.40, not 1.55)");
});

test("Ruined Gem data pins: effective-element override + target-status bonus declared; deferral removed", () => {
  const rg = QIONGJIU.expansionKey!;
  assert.equal(rg.id, RG);
  assert.equal(rg.supportElementOverride, "burn", "support element override is data-driven");
  assert.deepEqual(rg.supportTargetStatusDealtBonus, { statusId: "overburn", value: 0.15 }, "target-has-Burn-debuff +15% additive, data-driven");
  assert.equal(rg.deferredNote, undefined, "Ruined Gem no longer deferred");
});
