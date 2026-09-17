import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef } from "../model/types.js";

/**
 * COMMON KEY — Strategic Negotiation (VALIDATED in-game 2026):
 * Crit Rate +5%, Crit DMG +5%, ATK +5%, Out-of-Turn Damage +7%.
 * The +5% stats are NORMAL stat increases (ATK folds via the Final Stat formula; Crit Rate /
 * Crit DMG additive). The +7% IS an Out-of-Turn Damage stat increase — QJ's existing validated
 * 10% Out-of-Turn support damage + 7% = 17% total — NOT a Support-Action-specific modifier: the
 * engine consumes the `outOfTurnDmg` panel stat for ANY event outside the unit's own turn (in the
 * MVP, Support Actions are the only such events); attacks during her own turn never receive it.
 *
 * Deterministic math (mirror: base ATK 2000, critRate 0 for the bracket/damage scenarios, no
 * weapon substats; QJ Steady Plan Lv1 passive intact — own-turn no-cover +10%; the support-scoped
 * +10% IS the validated existing Out-of-Turn Damage line):
 *   with key: panel ATK = ceil(2000 × 1.05) = 2100
 *   SUPPORT (Guide 90%, DEF 5000): mit = atk×0.9×atk/(atk+5000)
 *     no key: bracket 1 + 0.10 (existing out-of-turn)   = 1.10 → ceil(514.29×1.10) = 566
 *     key:    bracket 1 + (0.10 + 0.07) = 1.17 total    = 1.17 → ceil(559.01×1.17) = 655
 *   OWN-TURN Common Rail (150%): bracket = no-cover ONLY (out-of-turn never applies):
 *     no key: ceil(3000 × 2000/7000 × 1.10) = 943   key: ceil(3150 × 2100/7100 × 1.10) = 1025
 *   CRIT Basic (0.8, passive off, critRate 1, critDmg 0): key panel 2100 → 496.90 × 1.05 = 522
 */

const SN = "qiongjiu_common_strategic_negotiation";

function qj(overrides: { passive?: boolean; critRate?: number; critDmg?: number } = {}): CharacterDef {
  const qj = structuredClone(QIONGJIU);
  qj.id = "qjsn";
  qj.base = { ...qj.base, atk: 2000, critRate: overrides.critRate ?? 0.2, critDmg: overrides.critDmg ?? 0 };
  qj.weapon = { ...qj.weapon, atkLvl1: 0, atkLvl60: 0, subStats: [] };
  if (overrides.passive === false) qj.passive = { ...qj.passive, effects: [], levels: undefined };
  return qj;
}

function supportRun(withKey: boolean) {
  const ally = makeAlly("ally", 1000);
  return simulateScenario(
    {
      version: 1, seed: 1, turns: 1,
      team: [
        { characterId: "ally", rotation: ["basic"], equippedFixedKeys: [] },
        { characterId: "qjsn", rotation: ["basic"], equippedFixedKeys: [], commonKeyId: withKey ? SN : undefined },
      ] as never,
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ ally, qjsn: qj({ critRate: 0 }) }),
  );
}

function railRun(withKey: boolean) {
  return simulateScenario(
    {
      version: 1, seed: 1, turns: 1,
      team: [{ characterId: "qjsn", rotation: ["active1"], equippedFixedKeys: [], commonKeyId: withKey ? SN : undefined }],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjsn: qj({ critRate: 0 }) }),
  ).log.find((e) => e.action === "qiongjiu_common_rail")!;
}

test("Strategic Negotiation equipped: ATK +5% (2100), Out-of-Turn 10% → 17%; Support Action uses it (bracket 1.17, 655)", () => {
  const ev = supportRun(true).log.find((e) => e.supportAttack === true)!;
  assert.ok(ev, "Qiongjiu's Support Action fired");
  assert.equal(ev.attackerAtk, 2100, "ATK +5% via the Final Stat formula");
  assert.equal(ev.bonusBracket, 1.17, "1 + (0.10 existing + 0.07 key) out-of-turn — 10%→17% in the SAME additive bracket");
  assert.equal(ev.finalDamage, 655, "ceil(559.01 × 1.17)");
});

test("Without the key: existing Out-of-Turn 10% only (bracket 1.10, 566) — the +7% is absent", () => {
  const ev = supportRun(false).log.find((e) => e.supportAttack === true)!;
  assert.equal(ev.attackerAtk, 2000);
  assert.equal(ev.bonusBracket, 1.10, "1 + 0.10 existing out-of-turn");
  assert.equal(ev.finalDamage, 566, "ceil(514.29 × 1.10)");
});

test("Own-turn attacks NEVER receive the out-of-turn component (bracket stays 1.10)", () => {
  const withKey = railRun(true);
  assert.equal(withKey.attackerAtk, 2100, "ATK +5% still applies on her own turn");
  assert.equal(withKey.bonusBracket, 1.10, "no-cover only — outOfTurnDmg must NOT enter her own-turn bracket");
  assert.equal(withKey.finalDamage, 1025, "ceil(3150 × 2100/7100 × 1.10)");
  const noKey = railRun(false);
  assert.equal(noKey.finalDamage, 943, "ceil(3000 × 2000/7000 × 1.10) — the +7% never leaks into own-turn damage");
});

test("Crit Rate +5% and Crit DMG +5% are normal additive stat increases (crit ×1.05, no key → ×1.00)", () => {
  const crit = (withKey: boolean) =>
    simulateScenario(
      {
        version: 1, seed: 1, turns: 1,
        team: [{ characterId: "qjsn", rotation: ["basic"], equippedFixedKeys: [], commonKeyId: withKey ? SN : undefined }],
        dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
      },
      customRegistry({ qjsn: qj({ passive: false, critRate: 1, critDmg: 0 }) }),
    ).log.find((e) => e.action === "qiongjiu_basic")!;
  const keyed = crit(true);
  assert.equal(keyed.attackerAtk, 2100);
  assert.equal(keyed.critical, true);
  assert.equal(keyed.finalDamage, 522, "ceil(496.90 × 1.05) — +5% Crit DMG folded into the crit multiplier");
  const plain = crit(false);
  assert.equal(plain.attackerAtk, 2000);
  assert.equal(plain.finalDamage, 458, "ceil(457.14 × 1.00) — no Crit DMG bonus");
});

test("Unequipped / removed: all four bonuses absent (2000 ATK, crit 20%, critDmg 0, out-of-turn 0)", () => {
  const st = createState(
    {
      version: 1, seed: 1, turns: 1,
      team: [{ characterId: "qjsn", rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjsn: qj() }),
    new Set(),
  );
  const u = st.units.find((x) => x.id === "qjsn")!;
  assert.equal(u.panelAtk, 2000);
  assert.equal(u.critRate, 0.2);
  assert.equal(u.critDmg, 0);
  assert.equal(u.outOfTurnDmg, 0);
});

test("Strategic Negotiation data + state pins: +5% ATK/CR/CDMG and outOfTurnDmg 0.07 (10%→17%)", () => {
  const ck = QIONGJIU.commonKey!;
  assert.equal(ck.id, SN);
  assert.equal(ck.name, "Strategic Negotiation");
  assert.equal(ck.type, "Universal Key: Skill");
  assert.deepEqual(ck.stats, { atkPct: 0.05, critRate: 0.05, critDmg: 0.05, outOfTurnDmg: 0.07 });
  const st = createState(
    {
      version: 1, seed: 1, turns: 1,
      team: [{ characterId: "qjsn", rotation: ["basic"], equippedFixedKeys: [], commonKeyId: SN }],
      dummy: { id: "d", name: "d", hp: 1, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ qjsn: qj() }),
    new Set(),
  );
  const u = st.units.find((x) => x.id === "qjsn")!;
  assert.equal(u.panelAtk, 2100, "ceil(2000 × 1.05)");
  assert.equal(u.critRate, 0.25, "20% + 5%");
  assert.equal(u.critDmg, 0.05, "0 + 5%");
  assert.equal(u.outOfTurnDmg, 0.07, "added to Qiongjiu's existing 10% → 17% total on out-of-turn events");
});