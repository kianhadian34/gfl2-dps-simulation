import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { abilities, customRegistry, makeAlly } from "./helpers.js";
import type { ActionSlot, CharacterDef, ConfigOverrides, Scenario, SkillDefVariant } from "../model/types.js";

/**
 * Qiongjiu V5 — Damage Up II (VALIDATED in-game 2026):
 *   1. Recipients: Qiongjiu (support owner) + the allied unit whose attack triggers her Support Action.
 *   2. Applied BEFORE the triggering ally's attack (existing Steady Plan trigger sequence; no new trigger).
 *   3. The triggering allied attack benefits from Damage Up II.
 *   4. Duration: existing 1-turn / holder own-turn-end behavior — the ally loses it at ITS turn end;
 *      Qiongjiu keeps it after the Support Action and loses it when SHE finishes her own next turn.
 *   5. Qiongjiu's Support Action benefits from the Damage Up II applied to her (validated 747 example:
 *      ATK 1962 · 90% · DEF 5000 · 1 + 0.20 No-Cover + 0.10 Out-of-Turn + 0.20 DU2 = 1.50 → 747).
 */

const ALLY = makeAlly("v5_ally", 1000);
const ALLY2 = makeAlly("v5_ally2", 1000);

/** 0-damage idle ult for the no-trigger rounds (existing pattern: cost-0, multiplier 0). */
function idleUlt(id: string): SkillDefVariant {
  return { id: `${id}_ult`, name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 0 };
}

/** Clone an ally but swap in the idle 0-damage ultimate (all other skills kept at their Lv1 variants). */
function withIdleUlt(b: CharacterDef, id: string): CharacterDef {
  const v = (slot: "basic" | "active1" | "active2" | "ultimate") => b.skills[slot].levels[1];
  return { ...b, id, name: id, skills: abilities({ basic: v("basic"), active1: v("active1"), active2: v("active2"), ultimate: idleUlt(id) }) };
}

function sc(opts: { turns: number; team: { id: string; rotation: ActionSlot[] }[]; fort: number; start?: number }): Scenario {
  const cfg: ConfigOverrides = { fortificationLevel: opts.fort, confectanceStart: opts.start ?? 3 };
  return {
    version: 1,
    seed: 7,
    turns: opts.turns,
    team: opts.team.map((m) => ({ characterId: m.id, rotation: m.rotation, equippedFixedKeys: [] })),
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: cfg,
  };
}

// fort 5 → ult Lv3 (V5) + passive Lv2 (V3: No-Cover 0.10, Support +0.10).
function qjTeam(rotations: ActionSlot[][], ids: string[] = ["qiongjiu", "v5_ally"]): { id: string; rotation: ActionSlot[] }[] {
  return ids.map((id, i) => ({ id, rotation: rotations[i] }));
}

const reg = customRegistry({ v5_ally: ALLY, v5_ally2: ALLY2 });
const supports = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.supportAttack);

test("V5: DU2 goes to Qiongjiu AND the triggering ally BEFORE the ally's attack; the ally's attack and the Support both benefit", () => {
  // r1: QJ basic (no trigger for herself); v5_ally basic → V5 applies DU2 to QJ + ally pre-action.
  const r = simulateScenario(sc({ turns: 1, team: qjTeam([["basic"], ["basic"]]), fort: 5 }), reg);
  const allyEv = r.log.find((e) => e.action === "v5_ally_basic")!;
  // (1)(2) BOTH recipients get DU2 on the trigger event: the owner (Qiongjiu) and the triggering
  // ally — applied BEFORE the ally's attack resolves.
  assert.equal((allyEv.appliedSources ?? []).filter((s) => s.statusId === "damage_up_ii").length, 2, "DU2 applied to BOTH the owner and the triggering ally (recorded on the trigger event)");
  assert.ok(Math.abs(allyEv.bonusBracket - 1.2) < 1e-9, `ally attack bracket ${allyEv.bonusBracket} (1 + 0.20 DU2)`);
  const sup = supports(r)[0];
  // (5) QJ's Support Action benefits from her own DU2: 1 + 0.10 (No-Cover) + 0.10 (V3 support) + 0.20 (DU2) = 1.40.
  assert.ok(Math.abs(sup.bonusBracket - 1.4) < 1e-9, `V5 support bracket ${sup.bonusBracket}`);
});

test("V5: Qiongjiu retains DU2 through her next own action and loses it when her own next turn ends", () => {
  // r1: ally triggers → DU2 on QJ + ally (QJ acted first in r1, so her turn-end already passed:
  // the buff ticks at QJ's r2 own action end). r2: QJ basic while DU2 is still active → 1.30
  // (retention, incl. No-Cover 0.10); the ally idles (no re-application). After QJ's r2 action
  // end the buff expires → r3 QJ basic bracket back to 1.10 (No-Cover only).
  const r = simulateScenario(
    sc({
      turns: 3,
      team: qjTeam([["basic", "basic", "basic"], ["basic", "ultimate", "ultimate"]]),
      fort: 5,
    }),
    customRegistry({ v5_ally: withIdleUlt(ALLY, "v5_ally") }),
  );
  const r2 = r.log.find((e) => e.action === "qiongjiu_basic" && e.round === 2)!;
  assert.ok(Math.abs(r2.bonusBracket - 1.3) < 1e-9, `r2 QJ basic bracket ${r2.bonusBracket} — must retain DU2 (1.30)`);
  const r3 = r.log.find((e) => e.action === "qiongjiu_basic" && e.round === 3)!;
  assert.ok(Math.abs(r3.bonusBracket - 1.1) < 1e-9, `r3 QJ basic bracket ${r3.bonusBracket} — DU2 must expire at QJ's own r2 turn end (1.10)`);
  // QJ still performs her Support Action in r1 and KEEPS the buff after it (r2 bracket proves retention).
  assert.equal(supports(r).filter((e) => e.round === 1).length, 1, "Support fired in r1; DU2 retained afterwards");
});

test("V5: non-triggering allies get NO DU2 and the ally's buff expires at its own turn end; quota unchanged", () => {
  // 5-member team: QJ + filler1..3 + probe. r1: fillers idle (0-dmg ult) → probe's basic triggers
  // (DU2 on QJ + probe; probe bracket 1.20; probe's buff expires at probe's own r1 turn end).
  // r2: fillers basic in order — 3 supports consume the full quota (unchanged Steady Plan cap) →
  // probe's basic is damage-capable but quota is 0 → NO support and NO DU2 pre-application →
  // probe bracket back to 1.00 (had the r1 DU2 survived, it would be 1.20).
  const ids = ["qiongjiu", "v5_f1", "v5_f2", "v5_f3", "v5_probe"];
  const fillers: Record<string, CharacterDef> = {};
  for (const id of ids.slice(1)) fillers[id] = withIdleUlt(makeAlly(id, 1000), id);
  const team = [
    { characterId: "qiongjiu", rotation: ["basic", "basic"] as ActionSlot[], equippedFixedKeys: [] },
    { characterId: "v5_f1", rotation: ["ultimate", "basic"] as ActionSlot[], equippedFixedKeys: [] },
    { characterId: "v5_f2", rotation: ["ultimate", "basic"] as ActionSlot[], equippedFixedKeys: [] },
    { characterId: "v5_f3", rotation: ["ultimate", "basic"] as ActionSlot[], equippedFixedKeys: [] },
    { characterId: "v5_probe", rotation: ["basic", "basic"] as ActionSlot[], equippedFixedKeys: [] },
  ];
  const sc5: Scenario = {
    version: 1,
    seed: 7,
    turns: 2,
    team,
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { fortificationLevel: 5, confectanceStart: 3 },
  };
  const r = simulateScenario(sc5, customRegistry(fillers));
  const probeR1 = r.log.find((e) => e.action === "v5_probe_basic" && e.round === 1)!;
  assert.ok(Math.abs(probeR1.bonusBracket - 1.2) < 1e-9, `probe r1 bracket ${probeR1.bonusBracket} — triggering ally benefits (1.20)`);
  assert.equal(supports(r).filter((e) => e.round === 1).length, 1, "r1: only the probe triggers (1 support)");
  assert.equal(supports(r).filter((e) => e.round === 2).length, 3, "r2: 3 fillers consume the normal quota of 3 — unchanged");
  const probeR2 = r.log.find((e) => e.action === "v5_probe_basic" && e.round === 2)!;
  assert.ok(Math.abs(probeR2.bonusBracket - 1.0) < 1e-9, `probe r2 bracket ${probeR2.bonusBracket} — no DU2 on the non-triggering ally; r1 buff expired at its turn end (1.00)`);
});

test("V5 at V6: support bracket 1.50 = the validated 747 composition (No-Cover 0.20 + Out-of-Turn 0.10 + DU2 0.20)", () => {
  const ally = makeAlly("v5_ally", 1000);
  const r = simulateScenario(sc({ turns: 1, team: qjTeam([["basic"], ["basic"]]), fort: 6 }), customRegistry({ v5_ally: ally }));
  const sup = supports(r)[0];
  // 1 + 0.20 (V6 No-Cover total) + 0.10 (V3 Support) + 0.20 (V5 DU2) = 1.50 — exact validated
  // modifier composition; with QJ ATK 1962 this yields ceil(1962×0.9×1962/6962×1.50) = 747 (documented).
  assert.ok(Math.abs(sup.bonusBracket - 1.5) < 1e-9, `V6 support bracket ${sup.bonusBracket}`);
});