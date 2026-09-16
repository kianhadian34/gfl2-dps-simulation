import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLogRows,
  classifyEvent,
  movementRows,
  resolveStatus,
  rotationStates,
  statusRefsFor,
  statusTooltipLines,
  totalsRows,
} from "../src/shared/presenters.js";
import type { LogEventView, ScenarioView, SessionView, SimulationResultView } from "../src/shared/engine-types.js";

const basEv = (over: Partial<LogEventView>): LogEventView => ({
  round: 1,
  turn: 1,
  unit: "tester",
  action: "tester_basic",
  actionType: "basic",
  target: "training_dummy",
  source: "basic",
  supportAttack: false,
  weaknessExploited: [],
  phaseMult: 1,
  bonusBracket: 1,
  reductionMult: 1,
  finalDamage: 100,
  cooldownAfter: {},
  statusesApplied: [],
  statusesExpired: [],
  ...over,
});

test("classifyEvent: action / support / fixed / tick categories", () => {
  assert.equal(classifyEvent(basEv({})), "action");
  assert.equal(classifyEvent(basEv({ supportAttack: true })), "support");
  assert.equal(classifyEvent(basEv({ actionType: "status_tick" })), "tick");
  assert.equal(classifyEvent(basEv({ fixedDamage: 50 })), "fixed");
  assert.equal(classifyEvent(basEv({ statusTick: { statusId: "overburn", amount: 10 } })), "fixed");
  // Status/resource signals on an action keep the action category; the row details expose them.
  assert.equal(classifyEvent(basEv({ statusesApplied: ["vulnerable_i"] })), "action");
  assert.equal(classifyEvent(basEv({ confectance: { before: 3, after: 0, cost: 3 } })), "action");
});

test("buildLogRows: preserves every LogEvent field in the detail expansion", () => {
  const ev = basEv({
    attackerAtk: 1962,
    targetDef: 5000,
    critical: true,
    critMultiplier: 1.2,
    weaknessExploited: ["burn"],
    bonusBracket: 1.5,
    confectance: { before: 3, after: 0, cost: 3 },
    statusesApplied: ["support_boost_i"],
    appliedSources: [{ statusId: "support_boost_i", source: "Common Rail Lv.1" }],
    effectSources: ["Out-of-Turn Damage +10% (Source: Steady Plan Lv.2 (V3))"],
    statusesExpired: [],
  });
  const rows = buildLogRows([ev]);
  assert.equal(rows.length, 1);
  const labels = rows[0].detail.map((d) => d.label);
  for (const required of ["attackerAtk", "targetDef", "critical", "critMultiplier", "weaknessExploited", "phaseMult", "bonusBracket", "reductionMult", "exposed", "finalDamage", "killingBlow", "confectance", "cooldownAfter", "statusesApplied", "appliedSources", "effectSources", "statusesExpired", "upgradeStacks", "statusTick", "fixedDamage"]) {
    assert.ok(labels.includes(required), `detail must expose ${required}`);
  }
});

test("rotationStates: completed / current / upcoming derived from the engine log only", () => {
  const scenario: ScenarioView = {
    version: 1,
    seed: 1,
    turns: 2,
    team: [{ characterId: "qiongjiu", rotation: ["basic", "active1"] }],
    dummy: { id: "d", name: "d", hp: 999, defense: 5000, stability: 6, weaknesses: [], phase: null, cover: "none" },
  };
  const log: LogEventView[] = [
    basEv({ round: 1, turn: 1, unit: "qiongjiu", action: "qiongjiu_basic", actionType: "basic" }),
    basEv({ round: 1, turn: 2, unit: "qiongjiu", action: "qiongjiu_common_rail", actionType: "active" }),
  ];
  const members = rotationStates(scenario, log);
  assert.equal(members[0].characterId, "qiongjiu");
  const [slot1, slot2] = members[0].slots;
  assert.equal(slot1.action, "qiongjiu_basic");
  assert.equal(slot1.state, "completed");
  assert.equal(slot2.action, "qiongjiu_common_rail");
  assert.equal(slot2.state, "current");
  // A member that never acted shows all-upcoming.
  const idle = rotationStates({ ...scenario, team: [{ characterId: "idler", rotation: ["basic"] }] }, log);
  assert.equal(idle[0].slots[0].state, "upcoming");
});

test("totalsRows and movementRows present engine numbers verbatim", () => {
  const result: SimulationResultView = {
    seed: 7,
    turns: 1,
    totals: { damage: 1234, damagePerRound: 1234, damagePerAction: 617, actions: 2 },
    byCharacter: [],
    bySource: [],
    warnings: [],
    log: [],
  };
  const rows = totalsRows(result);
  assert.ok(rows.some((r) => r.label === "Total damage" && r.value === "1,234"));
  assert.ok(rows.some((r) => r.label === "Seed" && r.value === "7"));

  const session: SessionView = {
    runId: "r1",
    scenario: { version: 1, seed: 7, turns: 1, team: [], dummy: { id: "d", name: "d", hp: 9, defense: 1, stability: 1, weaknesses: [], phase: null, cover: "none" } },
    result,
    movements: [{ round: 1, unitId: "mover", from: { x: 4, y: 4 }, to: { x: 5, y: 4 }, cost: 1, endTurnWithoutAction: false }],
    facts: null,
  };
  const mv = movementRows(session);
  assert.equal(mv.length, 1);
  assert.equal(mv[0].from, "4,4");
  assert.equal(mv[0].to, "5,4");
  assert.equal(mv[0].cost, "1");
});

// ------------------------------------------------------------------ status tooltips (player-facing only)

test("tooltips: Support Boost II shows ONLY clean gameplay effects (no internal documentation)", () => {
  const catalog = {
    support_boost_ii: {
      id: "support_boost_ii",
      name: "Support Boost II",
      category: "buff",
      description: "Support Action damage +30%. Damage against Exposed targets +10%.",
      durationRounds: null,
      stackable: true,
      maxStacks: undefined,
      purgeable: false,
      consumeOneOnUse: true,
    },
  };
  const tip = statusTooltipLines(resolveStatus("support_boost_ii", catalog))!;
  assert.ok(tip, "SB II resolves");
  assert.equal(tip.name, "Support Boost II");
  const text = [tip.description, ...tip.lines].join("\n");
  // Gameplay effects present:
  assert.match(text, /Support Action damage \+30%/);
  assert.match(text, /Damage against Exposed targets \+10%/);
  assert.match(text, /Activates 1 time/);
  assert.match(text, /Duration: Permanent/);
  assert.match(text, /Cannot be cleansed/);
  // NO internal documentation/evidence text:
  for (const banned of ["VALIDATED", "Source fact", "validation-checklist", "research.md", "in-game", "2026", "test", "§", "note:"]) {
    assert.equal(text.includes(banned), false, `tooltip must not contain ${banned}`);
  }
});

test("tooltips: Support Boost I shows its own gameplay effects", () => {
  const catalog = {
    support_boost_i: {
      id: "support_boost_i",
      name: "Support Boost I",
      category: "buff",
      description: "Support Action damage +15%. Damage against Exposed targets +10%.",
      durationRounds: null,
      stackable: true,
      maxStacks: undefined,
      purgeable: false,
      consumeOneOnUse: true,
    },
  };
  const tip = statusTooltipLines(resolveStatus("support_boost_i", catalog))!;
  const text = [tip.description, ...tip.lines].join("\n");
  assert.match(text, /Support Action damage \+15%/);
  assert.match(text, /Damage against Exposed targets \+10%/);
  assert.match(text, /Duration: Permanent/);
  assert.match(text, /Cannot be cleansed/);
});

test("tooltips: duration/stack/cleansing rows show structured fields and omit what does not apply", () => {
  const catalog = {
    vulnerable_i: { id: "vulnerable_i", name: "Vulnerable I", category: "debuff", description: "Damage taken +10%.", durationRounds: 1, stackable: false, maxStacks: undefined, purgeable: true },
    overburn: { id: "overburn", name: "Overburn", category: "debuff", description: "Burn damage.", durationRounds: 2, stackable: true, maxStacks: 1, purgeable: false },
  };
  const vul = statusTooltipLines(catalog.vulnerable_i)!;
  assert.match(vul.lines.join("\n"), /Duration: 1 turn\(s\)/);
  assert.match(vul.lines.join("\n"), /Stacks: not stackable/);
  assert.match(vul.lines.join("\n"), /Can be cleansed/);
  assert.equal(vul.lines.some((l) => l.includes("Activates 1 time")), false, "no activation row for non-consumption statuses");
  const ob = statusTooltipLines(catalog.overburn)!;
  assert.match(ob.lines.join("\n"), /Stacks: max 1/);
  assert.match(ob.lines.join("\n"), /Cannot be cleansed/);
});

test("tooltips: even if a raw status carried an internal note, the builder never renders it", () => {
  // Mirror of the catalog contract: the renderer catalog carries NO `note`; the builder
  // only reads description + structured fields, so internal doc text cannot leak through.
  const infoWithNote = {
    id: "support_boost_i_30",
    name: "Support Boost I (V1 kill, +30%)",
    category: "buff",
    description: "Support Action damage +30%. Damage against Exposed targets +10%.",
    note: "VALIDATED 2026 internal documentation ... validation-checklist.md",
    durationRounds: null,
    stackable: true,
    maxStacks: undefined,
    purgeable: false,
    consumeOneOnUse: true,
  } as never;
  const tip = statusTooltipLines(infoWithNote)!;
  assert.ok(tip, "resolves even with an extra internal note key present");
  const text = [tip.description, ...tip.lines].join("\n");
  assert.equal(text.includes("VALIDATED"), false);
  assert.equal(text.includes("validation-checklist"), false);
  assert.match(text, /Support Action damage \+30%/);
});

test("tooltips: a known status reference resolves to player-facing display information", () => {
  const catalog = {
    support_boost_i: {
      id: "support_boost_i",
      name: "Support Boost I",
      category: "buff",
      description: "Support Action damage +15%. Damage against Exposed targets +10%.",
      durationRounds: null,
      stackable: true,
      maxStacks: undefined,
      purgeable: false,
    },
  };
  const info = resolveStatus("support_boost_i", catalog);
  assert.ok(info, "known id resolves");
  assert.equal(info.name, "Support Boost I");
  assert.equal(info.durationRounds, null);
  assert.equal(info.purgeable, false);
  assert.equal(info.description, "Support Action damage +15%. Damage against Exposed targets +10%.");
  assert.equal("note" in info, false, "the catalog carries no internal note field");
});

test("tooltips: an unknown status reference does not crash and yields no fabricated content", () => {
  const catalog = { known: { id: "known", name: "K", category: "buff", description: "K.", durationRounds: null, stackable: true, purgeable: false } };
  assert.equal(resolveStatus("does_not_exist", catalog), undefined);
  assert.equal(resolveStatus("anything", undefined), undefined);
  assert.equal(statusTooltipLines(resolveStatus("does_not_exist", catalog)), undefined);
});

test("tooltips: status-bearing LogEvent fields are surfaced presentation-only", () => {
  const ev = basEv({
    statusesApplied: ["vulnerable_i"],
    statusesExpired: ["overburn"],
    appliedSources: [{ statusId: "support_boost_i", source: "Common Rail Lv.1" }],
    upgradeStacks: [{ statusId: "ammo_weakness_upgrade", stacks: 3 }],
    statusTick: { statusId: "overburn", amount: 10 },
  });
  const refs = statusRefsFor(ev);
  const byLabel = new Map(refs.map((r) => [r.label, r.refs]));
  assert.equal(byLabel.get("statusesApplied")?.[0].statusId, "vulnerable_i");
  assert.equal(byLabel.get("statusesExpired")?.[0].statusId, "overburn");
  assert.equal(byLabel.get("appliedSources")?.[0].source, "Common Rail Lv.1");
  assert.equal((byLabel.get("upgradeStacks") as { statusId: string; stacks: number }[] | undefined)?.[0].stacks, 3);
  assert.equal(byLabel.get("statusTick")?.[0].statusId, "overburn");
});

test("tooltips: the existing full-fidelity combat log rendering stays intact", () => {
  const ev = basEv({
    attackerAtk: 1962,
    targetDef: 5000,
    critical: true,
    critMultiplier: 1.2,
    weaknessExploited: ["medium_ammo"],
    bonusBracket: 1.17,
    statusesApplied: ["support_boost_i"],
    appliedSources: [{ statusId: "support_boost_i", source: "Common Rail Lv.1" }],
  });
  const rows = buildLogRows([ev]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event.finalDamage, 100);
  const labels = rows[0].detail.map((d) => d.label);
  for (const required of ["attackerAtk", "targetDef", "critical", "critMultiplier", "weaknessExploited", "bonusBracket", "statusesApplied", "appliedSources"]) {
    assert.ok(labels.includes(required), `detail must expose ${required}`);
  }
});