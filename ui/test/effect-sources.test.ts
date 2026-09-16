import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EffectSourceRef } from "../src/shared/effect-source-ref.js";
import { effectSourceRefs, parseEffectSource, effectSourceRefKey, resolveEffectSource } from "../src/shared/presenters.js";
import type { EffectSourceInfoView, EffectSourceRefView, LogEventView } from "../src/shared/engine-types.js";

/**
 * EFFECT-SOURCE TOOLTIPS (2026): the interactive chip resolves structured `effectSourceRefs`
 * against the effect-source definition catalog (built in main from the engine registry) and
 * shows the REAL player-facing description plus level / fortification from the ref.
 * Unresolved refs fall back to the display label — never fabricated, never internal notes.
 */

// Authoritative fixture mirroring what main's buildEffectSourceCatalog produces for QJ.
const DEFS: Record<string, EffectSourceInfoView> = {
  "passive:qiongjiu:qiongjiu_steady_plan": {
    name: "Steady Plan",
    description: "Grants +1 Confectance on each damage event. Damage +10% against No-Cover targets. Support Attack (90% ATK) triggers after an allied single-target hit, up to 3 per round.",
  },
  "status:support_boost_i": { name: "Support Boost I", description: "Support Action damage +15%. Damage against Exposed targets +10%." },
  "ability:qiongjiu:qiongjiu_common_rail": { name: "Common Rail", description: "Deal 150% ATK Burn damage. Applies Support Boost I to self." },
  "ability:qiongjiu:qiongjiu_basic": { name: "Fuse", description: "Deal 80% ATK damage. Medium Ammo." },
  target: { name: "Target passive (DummyConfig)" },
};

test("effectSources: Steady Plan structured ref → real player-facing description + level from the ref", () => {
  const ref: EffectSourceRefView = { kind: "passive", characterId: "qiongjiu", passiveId: "qiongjiu_steady_plan", level: 1, label: "Steady Plan Lv.1" };
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Steady Plan Lv.1", ref, defs: DEFS }));
  assert.match(html, /<b>Steady Plan<\/b>/);
  assert.match(html, /Grants \+1 Confectance on each damage event/);
  assert.match(html, /Level: 1/);
  assert.equal(html.includes("Fortification"), false, "no V row when the ref has none");
  // Interaction + accessibility intact:
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="button"/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /aria-label="effect source Steady Plan Lv\.1"/);
  // No internal documentation:
  for (const banned of ["VALIDATED", "note", "validation-checklist", "research.md", "contributed damage modifiers"]) {
    assert.equal(html.includes(banned), false, `tooltip must not contain ${banned}`);
  }
});

test("effectSources: fortification variant shows level + V from the structured ref", () => {
  const ref: EffectSourceRefView = { kind: "passive", characterId: "qiongjiu", passiveId: "qiongjiu_steady_plan", level: 3, v: 6, label: "Steady Plan Lv.3 (V6)" };
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Steady Plan Lv.3 (V6)", ref, defs: DEFS }));
  assert.match(html, /Level: 3/);
  assert.match(html, /Fortification: V6/);
  assert.match(html, /Grants \+1 Confectance on each damage event/);
});

test("effectSources: status source resolves through the structured statusId to the existing playerDescription", () => {
  const ref: EffectSourceRefView = { kind: "status", statusId: "support_boost_i", label: "Common Rail Lv.1" };
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Common Rail Lv.1", ref, defs: DEFS }));
  assert.match(html, /<b>Support Boost I<\/b>/);
  assert.match(html, /Support Action damage \+15%\. Damage against Exposed targets \+10%\./);
  assert.equal(html.includes("Level:"), false, "no fabricated level for a status ref");
});

test("effectSources: ability source resolves to the ability description", () => {
  const ref: EffectSourceRefView = { kind: "ability", characterId: "qiongjiu", abilityId: "qiongjiu_basic", slot: "basic", level: 1, label: "Fuse Lv.1" };
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Fuse Lv.1", ref, defs: DEFS }));
  assert.match(html, /<b>Fuse<\/b>/);
  assert.match(html, /Deal 80% ATK damage/);
  assert.match(html, /Level: 1/);
});

test("effectSources: unresolved ref falls back to the label (no fabricated description)", () => {
  // A ref whose definition is NOT in the catalog (e.g. custom/test-only character):
  const ref: EffectSourceRefView = { kind: "passive", characterId: "custom", passiveId: "custom_passive", level: 1, label: "Custom Lv.1" };
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Custom Lv.1", ref, defs: DEFS }));
  assert.match(html, /<b>Custom<\/b>/, "name from the label parse fallback");
  assert.match(html, /Level: 1/);
  assert.equal(html.includes("Grants +1 Confectance"), false, "no invented description");
  assert.equal(html.includes("VALIDATED"), false);
});

test("effectSources: target source shows its name only (data actually available)", () => {
  const ref: EffectSourceRefView = { kind: "target", label: "Target passive (DummyConfig)" };
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Target passive (DummyConfig)", ref, defs: DEFS }));
  assert.match(html, /<b>Target passive \(DummyConfig\)<\/b>/);
  assert.equal(html.includes("Level:"), false);
  assert.equal(html.includes("Damage"), false, "no fabricated gameplay text");
});

test("effectSources: refs without structured data keep the safe label-based fallback", () => {
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Steady Plan Lv.3 (V6)" })); // no ref, no defs
  assert.match(html, /<b>Steady Plan<\/b>/);
  assert.match(html, /Level: 3/);
  assert.match(html, /Fortification: V6/);
  assert.equal(html.includes("VALIDATED"), false);
});

test("effectSources: label pairing — each effectSources label has its ref at the same index", () => {
  const ev = {
    effectSources: ["Steady Plan Lv.1", "Vulnerable I"],
    effectSourceRefs: [
      { kind: "passive", characterId: "qiongjiu", passiveId: "qiongjiu_steady_plan", level: 1, label: "Steady Plan Lv.1" },
      { kind: "status", statusId: "vulnerable_i", label: "Vulnerable I" },
    ],
  } as unknown as LogEventView;
  const labels = effectSourceRefs(ev);
  assert.deepEqual(labels, ["Steady Plan Lv.1", "Vulnerable I"]);
  const refs = ev.effectSourceRefs ?? [];
  assert.equal(refs[0].label, labels[0]);
  assert.equal(refs[1].label, labels[1]);
});

test("effectSources: key + resolution helpers are deterministic against the catalog", () => {
  const passiveRef: EffectSourceRefView = { kind: "passive", characterId: "qiongjiu", passiveId: "qiongjiu_steady_plan", level: 1, label: "Steady Plan Lv.1" };
  const statusRef: EffectSourceRefView = { kind: "status", statusId: "support_boost_i", label: "Common Rail Lv.1" };
  const targetRef: EffectSourceRefView = { kind: "target", label: "Target passive (DummyConfig)" };
  assert.equal(effectSourceRefKey(passiveRef), "passive:qiongjiu:qiongjiu_steady_plan");
  assert.equal(effectSourceRefKey(statusRef), "status:support_boost_i");
  assert.equal(effectSourceRefKey(targetRef), "target");
  assert.equal(resolveEffectSource(passiveRef, DEFS)?.name, "Steady Plan");
  assert.equal(resolveEffectSource(statusRef, DEFS)?.description, "Support Action damage +15%. Damage against Exposed targets +10%.");
  assert.equal(resolveEffectSource(targetRef, DEFS)?.description, undefined, "target has no description in the catalog");
  assert.equal(resolveEffectSource(undefined, DEFS), undefined);
  assert.equal(resolveEffectSource(passiveRef, undefined), undefined);
  assert.deepEqual(parseEffectSource("Steady Plan Lv.1"), { name: "Steady Plan", level: 1 });
});

test("effectSources: unknown/blank entries stay safe and readable (no fabricated metadata)", () => {
  const ev = { effectSources: ["Steady Plan Lv.1", "", "   "] } as unknown as LogEventView;
  assert.deepEqual(effectSourceRefs(ev), ["Steady Plan Lv.1"], "blank/unresolvable labels are dropped");
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Unknown Source #7" }));
  assert.match(html, /Unknown Source #7/);
  assert.equal(html.includes("VALIDATED"), false);
});

test("effectSources: absent field resolves to no interactive refs (plain-text fallback)", () => {
  assert.deepEqual(effectSourceRefs({} as LogEventView), []);
  assert.deepEqual(effectSourceRefs({ effectSources: undefined } as LogEventView), []);
});