import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { createState } from "../engine/state.js";
import { additiveTakenBonus, applyStatus, tickStatuses } from "../engine/statuses.js";
import { REGISTRY } from "../data/registry.js";
import { customRegistry, scenario } from "./helpers.js";
import type { AmmoType, CharacterDef, Element, PassiveEffect } from "../model/types.js";

// Ammo Weakness Upgrade (AWU) — validated 2026 (docs/research.md §3.18).
// SEPARATE from the generic weakness multiplier: triggered by exploiting an
// Ammo weakness (first exploit 2 stacks, subsequent +1, max 5); Physical-only
// bonus tiers 2→+7% / 3→+11% / 4→+17% / 5→+25%; Phase damage exempt.
// Damage placement (validated): base → generic weakness ×(1+0.10×n) → additive
// DMG% bucket (1 + no-cover + AWU tier …) → existing pipeline → ceil.
// Style/rounding: the project's existing ceil semantics reproduce the observed
// numbers exactly — no new rounding stage was introduced.

const AWU = "ammo_weakness_upgrade";

/** Target-side trigger (declared on the dummy, U5-style passive channel). */
function awuPassive(
  tag: string,
  over: Partial<{ firstGain: number; gainPerEvent: number; maxStacks: number }> = {},
): PassiveEffect {
  return {
    kind: "grant_stacks_on_weakness_exploit",
    weaknessTag: tag,
    statusId: AWU,
    firstGain: over.firstGain ?? 2,
    gainPerEvent: over.gainPerEvent ?? 1,
    maxStacks: over.maxStacks ?? 5,
    requiresElements: ["physical"], // Phase exploits neither gain nor benefit (validated scope)
  };
}

interface CharOpts {
  atk: number;
  mult: number;
  element: Element;
  ammoType?: AmmoType;
  critRate?: number;
  critDmg?: number;
  noCover?: number;
}

function skillsFor(opts: CharOpts): CharacterDef["skills"] {
  const base = (id: string, mult: number) => ({
    id,
    name: id,
    type: "basic" as const,
    element: opts.element,
    ammoType: opts.ammoType,
    multiplier: mult,
    stabDamage: 0,
    cooldown: 0,
    confectanceCost: 0,
  });
  const idle = (id: string, type: "active" | "ultimate") => ({
    id,
    name: id,
    type,
    element: opts.element,
    ammoType: opts.ammoType,
    multiplier: 0,
    stabDamage: 0,
    cooldown: type === "ultimate" ? 0 : 1,
    confectanceCost: 0,
  });
  return {
    basic: base(`${opts.element}_basic`, opts.mult),
    active1: idle(`${opts.element}_a1`, "active"),
    active2: idle(`${opts.element}_a2`, "active"),
    ultimate: idle(`${opts.element}_ult`, "ultimate"),
  };
}

/** Plain deterministic attacker for engine-level regression runs. */
function makeChar(id: string, opts: CharOpts): CharacterDef {
  return {
    id,
    name: id,
    phase: "physical",
    base: { atk: opts.atk, hp: 1000, def: 100, stability: 6, critRate: opts.critRate ?? 0, critDmg: opts.critDmg ?? 0.2 },
    weapon: { id: `${id}_w`, name: "w", rarity: "standard", atkLvl1: 0, atkLvl60: 0, level: 60, subStats: [] },
    skills: skillsFor(opts),
    passive: {
      id: `${id}_passive`,
      name: "-",
      effects: opts.noCover ? [{ kind: "conditional_damage_modifier", scope: "dealt", mode: "additive", value: opts.noCover, when: "target.noCover" }] : [],
    },
    fixedKeys: [],
  };
}

function run(char: CharacterDef, dummy: object, turns = 6) {
  return simulateScenario(
    {
      version: 1,
      seed: 7,
      turns,
      team: [{ characterId: char.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0, weaknesses: [], phase: null, cover: "none", ...dummy },
    },
    customRegistry({ [char.id]: char }),
  );
}

// ---------------------------------------------------------------------------
// Tier values + Physical gate (unit level, target-side status engine)
// ---------------------------------------------------------------------------

function takenBonus(stacks: number, element: Element): number {
  const st = createState(scenario({ turns: 1 }), REGISTRY, new Set());
  applyStatus(st, st.dummy, { statusId: AWU, stacks });
  return additiveTakenBonus(st.dummy, st.statusRegistry, element);
}

test("AWU tier values: 2→0.07, 3→0.11, 4→0.17, 5→0.25; below 2 and above 5 stay capped", () => {
  assert.equal(takenBonus(2, "physical"), 0.07);
  assert.equal(takenBonus(3, "physical"), 0.11);
  assert.equal(takenBonus(4, "physical"), 0.17);
  assert.equal(takenBonus(5, "physical"), 0.25);
  assert.equal(takenBonus(1, "physical"), 0, "below the lowest tier contributes 0");
  // Stacks above maxStacks (manually raised) stay at the top tier.
  const st = createState(scenario({ turns: 1 }), REGISTRY, new Set());
  applyStatus(st, st.dummy, { statusId: AWU, stacks: 5 });
  st.dummy.statuses[0].stacks = 7;
  assert.equal(additiveTakenBonus(st.dummy, st.statusRegistry, "physical"), 0.25);
});

test("AWU is Physical-only: the tier bonus does not apply to Phase attack elements", () => {
  assert.equal(takenBonus(5, "burn"), 0);
  assert.equal(takenBonus(5, "electric"), 0);
  assert.equal(takenBonus(5, "physical"), 0.25, "Physical still receives it");
});

test("AWU persistence: stacks do NOT expire from elapsed turns (validated in-game: 6 skipped turns)", () => {
  // Validated (2026): AWU stacks remained on the target after 6 full skipped turns
  // with no further attacks — no expiration. Modeled as permanent (durationRounds: null);
  // the engine never ticks a permanent status. NOTE: this validates 6 skipped turns,
  // not a mathematical proof of infinite persistence; no reset condition is invented.
  const st = createState(scenario({ turns: 1 }), REGISTRY, new Set());
  applyStatus(st, st.dummy, { statusId: AWU, stacks: 5 });
  for (let i = 0; i < 6; i++) {
    tickStatuses(st, st.dummy, "roundEnd");
    tickStatuses(st, st.dummy, "ownActionEnd");
  }
  const active = st.dummy.statuses.find((s) => s.statusId === AWU);
  assert.ok(active, "AWU status still present after 6 elapsed turns");
  assert.equal(active!.stacks, 5, "stacks unchanged (no time-based expiry)");
  assert.equal(additiveTakenBonus(st.dummy, st.statusRegistry, "physical"), 0.25, "tier bonus intact");
});

// ---------------------------------------------------------------------------
// Shotgun-character regression (validated 2026): 89 → 105/109/114/122, capped
// ---------------------------------------------------------------------------

const SHOTGUN = makeChar("shotgun", { atk: 801, mult: 0.8, element: "physical", ammoType: "shotgun_ammo" });

test("AWU progression + damage (shotgun mirror): 105/109/114/122/122/122 with stacks 2,3,4,5,5,5", () => {
  const r = run(SHOTGUN, { weaknessTags: ["shotgun_ammo"], passives: [{ id: "awu", name: "AWU trigger", effects: [awuPassive("shotgun_ammo")] }] });
  assert.deepEqual(r.log.map((e) => e.finalDamage), [105, 109, 114, 122, 122, 122]);
  assert.deepEqual(r.log.map((e) => e.upgradeStacks), [
    [{ statusId: AWU, stacks: 2 }],
    [{ statusId: AWU, stacks: 3 }],
    [{ statusId: AWU, stacks: 4 }],
    [{ statusId: AWU, stacks: 5 }],
    [{ statusId: AWU, stacks: 5 }],
    [{ statusId: AWU, stacks: 5 }],
  ]);
  assert.deepEqual(r.log.map((e) => e.weaknessExploited), Array(6).fill(["shotgun_ammo"]));
});

test("no-ammo control (shotgun mirror): 89 non-crit, no AWU stacks", () => {
  const r = run(SHOTGUN, {});
  assert.deepEqual(r.log.map((e) => e.finalDamage), [89, 89, 89, 89, 89, 89]);
  assert.ok(r.log.every((e) => e.upgradeStacks === undefined));
});

test("ammo weakness tag WITHOUT the AWU trigger: generic ×1.10 applies, stacks stay 0", () => {
  const r = run(SHOTGUN, { weaknessTags: ["shotgun_ammo"] });
  // ceil(88.48 × 1.10) = 98 — the generic weakness multiplier, no AWU bonus.
  assert.deepEqual(r.log.map((e) => e.finalDamage), [98, 98, 98, 98, 98, 98]);
  assert.ok(r.log.every((e) => e.upgradeStacks === undefined));
});

// ---------------------------------------------------------------------------
// Qiongjiu mirror regression (validated 2026): 529 → 616/636/665/704, capped.
// The +20% No-Cover bracket (passive 10% + V6 10%) is folded into the char's
// passive (same explicit-V6 approach as weakness-validation.test.ts).
// ---------------------------------------------------------------------------

const QJ_ATK = 1958;
const QJ = makeChar("qj_mirror", { atk: QJ_ATK, mult: 0.8, element: "physical", ammoType: "assault_rifle_ammo", noCover: 0.2 });

test("Qiongjiu AWU regression: 616/636/665/704/704/704 (no-cover 20% + AWU in the same DMG% bucket)", () => {
  const r = run(QJ, { weaknessTags: ["assault_rifle_ammo"], passives: [{ id: "awu", name: "AWU trigger", effects: [awuPassive("assault_rifle_ammo")] }] });
  assert.deepEqual(r.log.map((e) => e.finalDamage), [616, 636, 665, 704, 704, 704]);
  assert.ok(Math.abs(r.log[0].bonusBracket - (1 + 0.2 + 0.07)) < 1e-9);
  assert.ok(Math.abs(r.log[4].bonusBracket - (1 + 0.2 + 0.25)) < 1e-9);
});

test("Qiongjiu baseline: no ammo weakness → 529 non-crit (validated)", () => {
  const r = run(QJ, {});
  assert.deepEqual(r.log.map((e) => e.finalDamage), [529, 529, 529, 529, 529, 529]);
});

// ---------------------------------------------------------------------------
// Phase control (validated 2026): generic ×1.20 two-weakness applies to Burn;
// AWU does NOT apply and does NOT advance on Phase attacks.
// ---------------------------------------------------------------------------

function burnMirror(critRate: number, critDmg: number): CharacterDef {
  return makeChar("qj_rail", {
    atk: QJ_ATK, mult: 1.5, element: "burn", ammoType: "assault_rifle_ammo", critRate, critDmg, noCover: 0.2,
  });
}

function burnRun(c: CharacterDef): ReturnType<typeof simulateScenario> {
  return simulateScenario(
    {
      version: 1,
      seed: 7,
      turns: 1,
      team: [{ characterId: c.id, rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: {
        id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 0,
        weaknesses: ["burn"], weaknessTags: ["assault_rifle_ammo"], phase: null, cover: "none",
        passives: [{ id: "awu", name: "AWU trigger", effects: [awuPassive("assault_rifle_ammo")] }],
      },
    },
    customRegistry({ [c.id]: c }),
  );
}

test("Phase control: Burn+Ammo two weaknesses → 1191 non-crit (AWU absent from Burn damage)", () => {
  const ev = burnRun(burnMirror(0, 0.2)).log[0];
  assert.equal(ev.finalDamage, 1191); // ceil(826.48 × 1.20 bracket × 1.20 two-weakness) — validated
  assert.deepEqual(ev.weaknessExploited, ["burn", "assault_rifle_ammo"]);
  assert.ok(ev.upgradeStacks === undefined, "Phase exploits neither gain nor receive AWU");
});

test("Phase control crit: 1470 at 123.5% Crit DMG (validated; AWU still absent)", () => {
  assert.equal(burnRun(burnMirror(1, 0.235)).log[0].finalDamage, 1470);
});

// ---------------------------------------------------------------------------
// Data-driven trigger values (2/1/5 must live in data, not the formula)
// ---------------------------------------------------------------------------

test("trigger values are data-driven: firstGain 3 / gainPerEvent 2 caps at 5", () => {
  const passive = awuPassive("assault_rifle_ammo", { firstGain: 3, gainPerEvent: 2 });
  const c = makeChar("qj_mirror", { atk: QJ_ATK, mult: 0.8, element: "physical", ammoType: "assault_rifle_ammo", noCover: 0.2 });
  const r = run(c, { weaknessTags: ["assault_rifle_ammo"], passives: [{ id: "awu", name: "AWU trigger", effects: [passive] }] });
  assert.deepEqual(
    r.log.map((e) => e.upgradeStacks),
    [
      [{ statusId: AWU, stacks: 3 }],
      [{ statusId: AWU, stacks: 5 }],
      [{ statusId: AWU, stacks: 5 }],
      [{ statusId: AWU, stacks: 5 }],
      [{ statusId: AWU, stacks: 5 }],
      [{ statusId: AWU, stacks: 5 }],
    ],
  );
});