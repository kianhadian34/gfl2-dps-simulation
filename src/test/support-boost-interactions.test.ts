import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { REGISTRY } from "../data/registry.js";
import { abilities, customRegistry } from "./helpers.js";
import type { ActionSlot, CharacterDef, Scenario } from "../model/types.js";

/**
 * Support Boost cross-buff interactions — ALL VALIDATED in-game 2026:
 *   1. SB I has NO stack cap (4 stacks reached, none observed) — unbounded in data.
 *   2. SB I → SB II: applying SB II replaces/removes ALL SB I stacks.
 *   3. SB II → SB I: while SB II is active, SB I applications are BLOCKED.
 *   4. SB II consumes exactly ONE stack per Support Action.
 *
 * The ally has a COST-0, 0-damage ultimate (unlimited idle rounds) so no consumption happens
 * during "idle" windows. confectanceStart 3 keeps QJ below cap (no at-max bonus) while still
 * letting her Ultimate cast.
 */

const ALLY: CharacterDef = {
  id: "int_ally",
  name: "int_ally",
  phase: "physical",
  base: { atk: 1000, hp: 1000, def: 100, stability: 6, critRate: 0, critDmg: 0.2 },
  weapon: { id: "int_ally_w", name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
  skills: abilities({
    basic: { id: "int_ally_basic", name: "Hit", type: "basic", element: "physical", multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
    active1: { id: "int_ally_a1", name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
    active2: { id: "int_ally_a2", name: "-", type: "active", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 1, confectanceCost: 0 },
    ultimate: { id: "int_ally_ult", name: "-", type: "ultimate", element: "physical", multiplier: 0, stabDamage: 0, cooldown: 0, confectanceCost: 0 },
  }),
  passive: { id: "int_ally_p", name: "-", effects: [] },
  fixedKeys: [],
};

/** QJ FIRST. SB II keeps its data duration untouched — the knob gives it a long duration so the
 *  validated cross-round interactions are observable (replacement/blocking/consumption). */
function sc(opts: { turns: number; qjRotation: string[]; allyRotation: ("basic" | "ultimate")[] }): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: opts.turns,
    team: [
      { characterId: "qiongjiu", rotation: opts.qjRotation as ("basic" | "active1" | "ultimate")[], equippedFixedKeys: [] },
      { characterId: "int_ally", rotation: opts.allyRotation, equippedFixedKeys: [] },
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { confectanceStart: 3, statusOverrides: { support_boost_ii: { durationRounds: 5 } } },
  };
}

const reg = customRegistry({ int_ally: ALLY });
const supports = (r: ReturnType<typeof simulateScenario>) => r.log.filter((e) => e.supportAttack);

test("SB I: data is UNBOUNDED (no maxStacks) and 4 applications + 3 consuming Supports leave no cap-2 expiry", () => {
  // VALIDATED: 4 stacks reached with no cap observed — represented by `maxStacks: undefined`.
  assert.equal(REGISTRY.getStatus("support_boost_i")!.maxStacks, undefined);
  // QJ applies Common Rail at r1/r3/r5/r7 (4 stacks); the ally idles r1–r4 (0-damage ults) and
  // triggers Supports at r5–r7 (3 consumes → 1 stack left). A cap of 2 would expire at r6;
  // a cap of 1 at r5; unbounded (or cap ≥ 3) shows NO expiry inside the 7-turn run.
  const r = simulateScenario(
    sc({
      turns: 7,
      qjRotation: ["active1", "basic", "active1", "basic", "active1", "basic", "active1", "basic", "basic", "basic"],
      allyRotation: ["ultimate", "ultimate", "ultimate", "ultimate", "basic", "basic", "basic"],
    }),
    reg,
  );
  assert.equal(supports(r).length, 3, "expected 3 consuming Supports (r5–r7)");
  const expiryRounds = r.log.filter((e) => (e.statusesExpired ?? []).includes("support_boost_i")).map((e) => e.round);
  assert.deepEqual(expiryRounds, [], `unexpected SB I expiry at ${JSON.stringify(expiryRounds)}`);
});

test("SB I → SB II: casting the Ultimate replaces SB I entirely (all SB I stacks removed)", () => {
  // r1 Common Rail (SB I ×1, persistent), r2 Ult (SB II ×3) → SB I must be gone.
  const r = simulateScenario(
    sc({ turns: 2, qjRotation: ["active1", "ultimate"], allyRotation: ["ultimate", "ultimate"] }),
    reg,
  );
  const ult = r.log.find((e) => e.action === "qiongjiu_pressing_momentum")!;
  assert.ok(ult.statusesExpired?.includes("support_boost_i"), `SB I not removed on ult: ${JSON.stringify(ult.statusesExpired)}`);
});

test("SB II blocks SB I: while SB II is active, Common Rail applies NO SB I", () => {
  // r1 Ult (SB II ×3), r2 Common Rail → no SB I applied (SB II priority).
  const r = simulateScenario(
    sc({ turns: 2, qjRotation: ["ultimate", "active1"], allyRotation: ["ultimate", "ultimate"] }),
    reg,
  );
  const rail = r.log.find((e) => e.action === "qiongjiu_common_rail")!;
  const sb1 = (rail.appliedSources ?? []).filter((s) => s.statusId === "support_boost_i");
  assert.equal(sb1.length, 0, `SB I must be blocked while SB II is active: ${JSON.stringify(rail.appliedSources)}`);
});

test("SB II consumes exactly ONE stack per Support Action (×3 → ×2 → ×1 → removed)", () => {
  // r1 Ult (SB II ×3); r2–r4 ally basics each trigger one Support Action.
  const r = simulateScenario(
    sc({ turns: 4, qjRotation: ["ultimate", "basic", "basic", "basic"], allyRotation: ["ultimate", "basic", "basic", "basic"] }),
    reg,
  );
  const sup = supports(r);
  assert.equal(sup.length, 3, `expected 3 consuming supports, got ${sup.length}`);
  const expiredOn = r.log.filter((e) => (e.statusesExpired ?? []).includes("support_boost_ii")).map((e) => e.round);
  // 3 stacks, one consumed per Support Action → expiry only after the THIRD support.
  assert.deepEqual(expiredOn, [4], `SB II expiry rounds ${JSON.stringify(expiredOn)} — expected only the 3rd support`);
});

test("Ultimate-granted SB II is PERSISTENT: an unused stack survives the round boundary (no Ultimate-imposed duration)", () => {
  // Regression for the corrected data: the Ultimate must NOT impose durationRounds on SB II.
  // r1: QJ casts the Ultimate (SB II ×3) while the ally idles with a 0-damage active (NO support,
  // stacks untouched); r2: the ally lands a basic → a Support Action fires.
  // NO statusOverrides here — the data default must keep the stack alive across the round end
  // (a durationRounds:1 application would expire it at end of r1 and the r2 support would lose SB II).
  const r = simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 2,
      team: [
        { characterId: "qiongjiu", rotation: ["ultimate", "basic"], equippedFixedKeys: [] },
        { characterId: "int_ally", rotation: ["active1", "basic"], equippedFixedKeys: [] },
      ],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
      configOverrides: { confectanceStart: 3 }, // below cap: no at-max extras; only the 3 base stacks
    },
    reg,
  );
  assert.equal(supports(r).filter((e) => e.round === 1).length, 0, "no Support Action may fire during the idle r1 (stacks untouched)");
  const ult = r.log.find((e) => e.action === "qiongjiu_pressing_momentum")!;
  assert.ok(ult.statusesApplied.includes("support_boost_ii"), "Ultimate must grant SB II");
  const sup = supports(r).find((e) => e.round === 2)!;
  // Passive Lv1 No-Cover +0.10 + SB II +0.30 (Support-scoped) = bracket 1.40 (the +0.10 vs
  // Exposed is NOT in play: the dummy starts stability 0 but is not in the broken/exposed state —
  // exposed is break-triggered, default false). Under the old durationRounds:1 data this support
  // would sit at 1.10 (SB II expired at the r1 round end).
  assert.ok(Math.abs(sup.bonusBracket - 1.4) < 1e-9, `r2 support bracket ${sup.bonusBracket} — SB II must still be active across rounds`);
});

test("Max-Confectance Ultimate (VALIDATED 2026): 4 SB II stacks AND 4 Support Actions that turn — vs the normal cap of 3", () => {
  // 5 damaging allies hit the dummy once in round 1 (budget = 1 action/unit/round) — 5 triggers,
  // more than either Support quota (3 normal / 4 at-max) can serve.
  const allys = ["int_ally_1", "int_ally_2", "int_ally_3", "int_ally_4", "int_ally_5"];
  const sixReg = customRegistry(
    Object.fromEntries(allys.map((id) => [
      id,
      {
        ...ALLY,
        id,
        name: id,
        skills: abilities({
          basic: { ...ALLY.skills.basic.levels[1], id: `${id}_basic` },
          active1: ALLY.skills.active1.levels[1],
          active2: ALLY.skills.active2.levels[1],
          ultimate: ALLY.skills.ultimate.levels[1],
        }),
      },
    ])),
  );
  const maxSc = (qjRotation: ActionSlot[]): Scenario => ({
    version: 1 as const,
    seed: 7,
    turns: 2, // r1 = at-max cast turn; r2 = following turn (quota must reset to 3)
    team: [
      { characterId: "qiongjiu", rotation: qjRotation, equippedFixedKeys: [] },
      // 5 damaging allies hit the dummy once per round (budget = 1 action/unit/round) — 5 triggers.
      ...allys.map((id) => ({ characterId: id, rotation: ["basic", "basic"] as ActionSlot[], equippedFixedKeys: [] })),
    ],
    dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none" },
    configOverrides: { confectanceStart: 6 }, // AT MAX → the at-max bonuses fire (r1 cast only)
  });
  const r = simulateScenario(maxSc(["ultimate", "basic"]), sixReg);
  const sups = supports(r);
  // (B) +1 Support Action quota: 3 (Steady Plan) + 1 (Ultimate at max) = 4 THIS turn (5 triggers → 4 fired).
  assert.equal(sups.filter((e) => e.round === 1).length, 4, `expected 4 Supports in the casting turn (3+1 quota; 5 triggers), got ${sups.filter((e) => e.round === 1).length}`);
  // STRICTLY TURN-SCOPED: the +1 does NOT carry over — the following round resets to the normal 3.
  assert.equal(sups.filter((e) => e.round === 2).length, 3, `expected 3 Supports next round (reset, no carry-over), got ${sups.filter((e) => e.round === 2).length}`);
  // (A) +1 SB II stack: 3 + 1 = 4 stacks, one consumed per Support Action → expiry only after the 4th.
  const expiredOn = r.log.filter((e) => (e.statusesExpired ?? []).includes("support_boost_ii")).map((e) => e.round);
  assert.deepEqual(expiredOn, [1], `SB II expiry ${JSON.stringify(expiredOn)} — expected only after the 4th support`);
  const ult = r.log.find((e) => e.action === "qiongjiu_pressing_momentum")!;
  // Both bonuses are separate effects: the Ult records 3+1 SB II applications and pays the normal cost.
  assert.equal(ult.statusesApplied.filter((s) => s === "support_boost_ii").length, 2, "two SB II applications (3 + 1)");
  assert.equal(ult.confectance!.cost, 3, "Ultimate still pays its normal 3 Confectance");

  // Control: the SAME 5 triggers on a NON-at-max turn stay capped at the normal 3 Supports (every round).
  const c = simulateScenario(
    { ...maxSc(["basic"]), configOverrides: { confectanceStart: 3 } },
    sixReg,
  );
  assert.deepEqual(
    [supports(c).filter((e) => e.round === 1).length, supports(c).filter((e) => e.round === 2).length],
    [3, 3],
    `normal turns must stay capped at 3 Supports each round, got ${JSON.stringify(supports(c).map((e) => e.round))}`,
  );
  assert.equal(c.log.some((e) => (e.statusesExpired ?? []).includes("support_boost_ii")), false, "no SB II on the control turn");
});