import { test } from "node:test";
import assert from "node:assert/strict";
import { simulateScenario } from "../simulate.js";
import { scenario, customRegistry, makeAlly, abilities } from "./helpers.js";
import type { CharacterDef, EffectSourceRef, SkillDefVariant, StatusApplySpec } from "../model/types.js";

/**
 * STRUCTURED EFFECT-SOURCE PROVENANCE (2026, additive): `effectSourceRefs` is label-aligned
 * with the EXISTING `effectSources` array (same order, same dedup) and carries stable ids so
 * a consumer can resolve the real source definition without parsing the display label.
 * The display grammar of `effectSources` itself is UNCHANGED.
 */

function labelsAndRefs(r: ReturnType<typeof simulateScenario>): { labels: string[]; refs: EffectSourceRef[] } {
  const ev = r.log[0]!;
  return { labels: ev.effectSources ?? [], refs: ev.effectSourceRefs ?? [] };
}

/** Minimal doll with a basic that applies a status (self or target) and no other contributions. */
function statusDoll(id: string, spec: StatusApplySpec): CharacterDef {
  const base = makeAlly(id, 1000);
  const basic: SkillDefVariant = {
    id: `${id}_basic`, name: "Hit", type: "basic", element: null, multiplier: 1.0, stabDamage: 0, cooldown: 0, confectanceCost: 0, appliesStatuses: [spec],
  };
  const noop: SkillDefVariant = { ...basic, id: `${id}_noop`, multiplier: 0, appliesStatuses: undefined };
  return { ...base, id, name: id, skills: abilities({ basic, active1: noop, active2: noop, ultimate: noop }) };
}

test("structured refs: QJ Basic (Steady Plan Lv.1 no-cover dealt) → passive ref with stable ids", () => {
  const r = simulateScenario(scenario({ turns: 1, rotation: ["basic"], keys: [] }));
  const { labels, refs } = labelsAndRefs(r);
  const passive = refs.find((x) => x.kind === "passive") as
    | { kind: "passive"; characterId: string; passiveId: string; level: number; v?: number; label: string }
    | undefined;
  assert.ok(passive, "a passive-kind ref exists on the basic hit");
  assert.equal(passive.characterId, "qiongjiu");
  assert.equal(passive.passiveId, "qiongjiu_steady_plan");
  assert.equal(passive.level, 1);
  assert.equal(passive.v, undefined, "Lv1 has no fortification tag");
  assert.equal(passive.label, "Steady Plan Lv.1");
  assert.deepEqual(refs.map((x) => x.label), labels, "refs are label-aligned with the unchanged display labels");
});

test("structured refs: Steady Plan Lv.3 (V6) carries level + fortification rank", () => {
  const r = simulateScenario(scenario({ turns: 1, rotation: ["basic"], keys: [], config: { fortificationLevel: 6 } }));
  const passive = labelsAndRefs(r).refs.find((x) => x.kind === "passive") as
    | { kind: "passive"; characterId: string; passiveId: string; level: number; v?: number; label: string }
    | undefined;
  assert.ok(passive);
  assert.equal(passive.level, 3);
  assert.equal(passive.v, 6);
  assert.equal(passive.label, "Steady Plan Lv.3 (V6)");
});

test("structured refs: attacker status contributor → status ref with the real status id (never label-parsed)", () => {
  // Custom doll applies damage_up_ii to itself with an explicit source; the follow-up basic
  // then reports that status as a contributing dealt source (same shape as QJ/Common Rail).
  const c = statusDoll("sr", { statusId: "damage_up_ii", durationRounds: 2, target: "self", source: "Pressing the Momentum Lv.3 (V5)" });
  const r = simulateScenario(
    { version: 1, seed: 3, turns: 2, team: [{ characterId: "sr", rotation: ["basic", "basic"], equippedFixedKeys: [] }], dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" } },
    customRegistry({ sr: c }),
  );
  const ev2 = r.log.find((e) => e.action === "sr_basic" && e.round === 2)!;
  const statusRef = (ev2.effectSourceRefs ?? []).find((x) => x.kind === "status") as
    | { kind: "status"; statusId: string; label: string }
    | undefined;
  assert.ok(statusRef, "attacker status contributor produces a status ref");
  assert.equal(statusRef.statusId, "damage_up_ii", "identity from the actual status, not parsed from the label");
  assert.equal(statusRef.label, "Pressing the Momentum Lv.3 (V5)");
  assert.ok(ev2.effectSources?.includes("Pressing the Momentum Lv.3 (V5)"), "display label unchanged");
});

test("structured refs: target taken-modifier status → status ref (dummy side)", () => {
  // Custom doll applies Vulnerable I to the dummy on round 1; the round-2 hit sees the dummy's
  // taken +10% as a contributing status source.
  const c = statusDoll("vt", { statusId: "vulnerable_i", durationRounds: 2, target: "target" });
  const r = simulateScenario(
    { version: 1, seed: 3, turns: 2, team: [{ characterId: "vt", rotation: ["basic", "basic"], equippedFixedKeys: [] }], dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" } },
    customRegistry({ vt: c }),
  );
  const ev2 = r.log.find((e) => e.action === "vt_basic" && e.round === 2)!;
  const vulRef = (ev2.effectSourceRefs ?? []).find((x) => x.kind === "status" && x.statusId === "vulnerable_i");
  assert.ok(vulRef, "dummy-side taken status appears as a status ref");
  // The dummy status identity is retained (vulnerable_i); the label is the actual applied
  // source stamped at application time ("Hit Lv.1") — never derived by parsing the label.
  assert.equal((vulRef as { label: string }).label, "Hit Lv.1");
  assert.ok(ev2.effectSources?.includes("Hit Lv.1"), "display label unchanged and aligned");
});

test("structured refs: target passive (DummyConfig) → target-kind ref without invented ids", () => {
  const plain = makeAlly("tp", 1000); // no passive contributions itself
  const r = simulateScenario(
    {
      version: 1, seed: 7, turns: 1,
      team: [{ characterId: "tp", rotation: ["basic"], equippedFixedKeys: [] }],
      dummy: {
        id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none",
        passives: [{ id: "dummy_taken", name: "Dummy Taken", effects: [{ kind: "conditional_damage_modifier", scope: "taken", mode: "additive", value: 0.1, when: "target.noCover" }] }],
      },
    },
    customRegistry({ tp: plain }),
  );
  const ev = r.log[0]!;
  const targetRef = (ev.effectSourceRefs ?? []).find((x) => x.kind === "target");
  assert.ok(targetRef, "target passive source carries a target-kind ref");
  assert.equal((targetRef as { label: string }).label, "Target passive (DummyConfig)");
  assert.ok(!("statusId" in (targetRef as object)), "no fabricated ids on the target ref");
});

test("structured refs: multi-source support hit stays label-aligned and deduplicated like effectSources", () => {
  // QJ (Common Rail → SB I) + ally; the allied basic triggers QJ's Steady Plan Support,
  // which benefits from the SB I status AND Steady Plan's passive bonuses simultaneously.
  const ally = makeAlly("sally", 900);
  const r = simulateScenario(
    {
      version: 1, seed: 7, turns: 2,
      team: [
        { characterId: "qiongjiu", rotation: ["active1", "active1"], equippedFixedKeys: [] },
        { characterId: "sally", rotation: ["basic", "basic"], equippedFixedKeys: [] },
      ],
      dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" },
    },
    customRegistry({ sally: ally }),
  );
  const supportEv = r.log.find((e) => e.supportAttack)!;
  assert.ok(supportEv, "an allied-triggered support event exists");
  const labels = supportEv.effectSources ?? [];
  const refs = supportEv.effectSourceRefs ?? [];
  assert.ok(refs.some((x) => x.kind === "status"), "the SB I status contribution is a status ref");
  assert.ok(refs.some((x) => x.kind === "passive"), "the Steady Plan passive contribution is a passive ref");
  assert.deepEqual(refs.map((x) => x.label), labels, "one ref per label, same order");
  assert.equal(refs.length, new Set(labels).size, "deduplicated exactly like the label set");
});

test("structured refs: hits with no contributing sources omit refs (and labels)", () => {
  const plain = makeAlly("plain", 1000); // passive effects [], no statuses
  const r = simulateScenario(
    { version: 1, seed: 7, turns: 1, team: [{ characterId: "plain", rotation: ["basic"], equippedFixedKeys: [] }], dummy: { id: "d", name: "d", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" } },
    customRegistry({ plain }),
  );
  const ev = r.log[0]!;
  assert.equal(ev.effectSources, undefined, "no contributing sources → labels absent");
  assert.equal(ev.effectSourceRefs, undefined, "no contributing sources → refs absent");
});