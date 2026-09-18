import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REGISTRY, type Registry } from "../data/registry.js";
import { customRegistry, makeAlly } from "./helpers.js";
import type { CharacterDef, Scenario } from "../model/types.js";

/**
 * GOLDEN MELODY IMPRINT (2026, owner-gated, SOURCE FACTS; data-driven):
 * When the ACTUAL OWNER of Golden Melody deals damage:
 *   +2.5% Damage Dealt vs targets whose Race/Type is ELID (imprint.targetType "elid");
 *   +2.5% more when the target is not protected by Cover (imprint.noCoverBonus).
 * Both conditions stack → +5.0%; both lost → +0%. The Imprint is ADDITIVE in the existing
 * DMG% bucket — NO new formula/bucket. `ownerCharacterId` ("qiongjiu") is DATA: an attacking
 * unit that is NOT the owner gets no Imprint even while Golden Melody exists.
 *
 * MVP GAP (reported, not workaround-ed): `createState` rejects any dummy with cover !== "none"
 * (Cover is explicitly deferred; `UnitState.cover` is typed "none"), so the two COVER-side
 * scenarios (ELID+Cover → +2.5% and non-ELID+Cover → +0%) are NOT representable in a run —
 * they are documented mechanics with no testable path in the MVP.
 *
 * Harness: the real Qiongjiu def id ("qiongjiu") is the owner, with critRate zeroed via a
 * registry wrapper (deterministic non-crit). Golden Melody is equipped with NO calibrationLevel,
 * so no Damage Dealt / Charging terms pollute the imprint math (bracket = No-Cover 0.20 at V6).
 */

// Qiongjiu REAL def (owner id "qiongjiu") with critRate 0 for deterministic non-crit oracles.
const qjNonCrit: Registry = {
  ...REGISTRY,
  getCharacter: (id) => (id === "qiongjiu" ? { ...QIONGJIU, base: { ...QIONGJIU.base, critRate: 0 } } : REGISTRY.getCharacter(id)),
};

/** Non-owner attacker (a Qiongjiu CLONE with a different id) that still equips Golden Melody. */
function qjClone(): CharacterDef {
  const q = structuredClone(QIONGJIU);
  q.id = "qjgm";
  q.base = { ...q.base, critRate: 0 };
  return q;
}

function ownerRun(opts: { elid: boolean; ally?: boolean }): ReturnType<typeof simulateScenario> {
  const team: Scenario["team"] = [
    { characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou", weaponImprintActive: true },
  ];
  if (opts.ally) team.push({ characterId: "im_ally", rotation: ["basic"], equippedFixedKeys: [] });
  const sc: Scenario = {
    version: 1,
    seed: 7,
    turns: 1,
    team,
    dummy: {
      id: "training_dummy",
      name: "Training Dummy",
      hp: 999999999,
      defense: 5000,
      stability: 65,
      weaknesses: [],
      raceTypes: opts.elid ? ["elid"] : [],
      phase: null,
      cover: "none",
    },
    configOverrides: { fortificationLevel: 6 }, // V6: No-Cover +20% total (+ Out-of-Turn +10% on supports)
  };
  const registry = opts.ally
    ? { ...qjNonCrit, getCharacter: (id: string) => (id === "im_ally" ? makeAlly("im_ally", 1000) : qjNonCrit.getCharacter(id)) }
    : qjNonCrit;
  return simulateScenario(sc, registry);
}

test("Imprint: owner + ELID + No Cover → +5.0% (both conditions stack, bracket 1.25 → 492)", () => {
  const ev = ownerRun({ elid: true }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(ev.bonusBracket - 1.25) < 1e-9, `0.20 No-Cover + 0.025 ELID + 0.025 No-Cover = 1.25 (got ${ev.bonusBracket})`);
  assert.equal(ev.finalDamage, 492, "ceil(393.00 × 1.25) = 492");
});

test("Imprint: owner + non-ELID + No Cover → +2.5% (the No-Cover bonus is independent of ELID, bracket 1.225 → 482)", () => {
  const ev = ownerRun({ elid: false }).log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(ev.bonusBracket - 1.225) < 1e-9, `0.20 No-Cover + 0.025 No-Cover-Imprint = 1.225 (got ${ev.bonusBracket})`);
  assert.equal(ev.finalDamage, 482, "ceil(393.00 × 1.225) = 482");
});

test("Imprint: additivity — the ELID/No-Cover bonuses live in the SAME additive DMG% bucket (delta exactly +0.025)", () => {
  const a = ownerRun({ elid: true }).log.find((e) => e.action === "qiongjiu_basic")!.bonusBracket;
  const b = ownerRun({ elid: false }).log.find((e) => e.action === "qiongjiu_basic")!.bonusBracket;
  assert.ok(Math.abs((a as number) - (b as number) - 0.025) < 1e-9, `ELID adds exactly +2.5% in the same bracket: ${a} vs ${b}`);
  assert.ok(Math.abs((a as number) - (1 + 0.2 + 0.025 + 0.025)) < 1e-9, "single additive bucket: 1 + 0.20 + 0.025 + 0.025");
});

test("Imprint: NON-owner damage gets +0% even while another unit owns/equips Golden Melody (bracket 1.20 → 472)", () => {
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      // Qiongjiu (the OWNER) equips Golden Melody, but the ATTACKING unit is a clone that is NOT
      // the owner — the clone's own character id fails the ownerCharacterId gate.
      team: [{ characterId: "qjgm", rotation: ["basic"], equippedFixedKeys: [], weaponId: "jinshizou" }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], raceTypes: ["elid"], phase: null, cover: "none" },
      configOverrides: { fortificationLevel: 6 },
    },
    customRegistry({ qjgm: qjClone() }),
  );
  const ev = r.log.find((e) => e.action === "qiongjiu_basic")!;
  assert.ok(Math.abs(ev.bonusBracket - 1.2) < 1e-9, `owner-gated: No-Cover only (no Imprint even vs ELID) — got ${ev.bonusBracket}`);
  assert.equal(ev.finalDamage, 472, "ceil(393.00 × 1.20) = 472");
});

test("Imprint: Support Action (the MVP out-of-turn damage path) also receives it — additive with DU2/No-Cover/Out-of-Turn (bracket 1.55 → 686)", () => {
  // V6 support bracket: 0.20 No-Cover + 0.10 Out-of-Turn + 0.20 Damage Up II (the resolved V5
  // `beforeSupportTrigger` applies DU2 on every support at V6 — the established behavior the
  // 1434 oracle relies on) + 0.05 Imprint = 1.55.
  const r = ownerRun({ elid: true, ally: true });
  const ev = r.log.find((e) => e.supportAttack === true)!;
  assert.ok(ev, "Support Action fired");
  assert.ok(Math.abs(ev.bonusBracket - 1.55) < 1e-9, `0.20 No-Cover + 0.10 OoT + 0.20 DU2 + 0.05 Imprint = 1.55 (got ${ev.bonusBracket})`);
  assert.equal(ev.finalDamage, 686, "ceil(442.13 × 1.55) = 686");
});