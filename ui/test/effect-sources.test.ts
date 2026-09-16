import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EffectSourceRef } from "../src/shared/effect-source-ref.js";
import { effectSourceRefs, parseEffectSource } from "../src/shared/presenters.js";
import type { LogEventView } from "../src/shared/engine-types.js";

/**
 * EFFECT-SOURCE tooltips (2026): the interactive reference is unchanged; the tooltip body now
 * shows the ACTUAL information already present in the engine provenance label (name / level /
 * fortification rank — deterministic split) plus the entry's factual role on the hit.
 * No invented gameplay text, no internal `note`/documentation.
 */

test("effectSources: a passive label tooltip shows the parsed name + level", () => {
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Steady Plan Lv.1" }));
  assert.match(html, /<b>Steady Plan<\/b>/);
  assert.match(html, /Level: 1/);
  assert.equal(html.includes("Fortification"), false, "no fortification row when the label has none");
  // Interaction unchanged (hoverable + keyboard focusable + accessible):
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="button"/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /aria-label="effect source Steady Plan Lv\.1"/);
  // Player-facing only — no internal documentation/notes:
  for (const banned of ["VALIDATED", "note", "validation-checklist", "research.md"]) {
    assert.equal(html.includes(banned), false, `tooltip must not contain ${banned}`);
  }
});

test("effectSources: a fortification-suffixed label tooltip shows the variant rank", () => {
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Steady Plan Lv.3 (V6)" }));
  assert.match(html, /<b>Steady Plan<\/b>/);
  assert.match(html, /Level: 3/);
  assert.match(html, /Fortification: V6/);
});

test("effectSources: ability-origin labels parse the same way (Common Rail Lv.1)", () => {
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Common Rail Lv.1" }));
  assert.match(html, /<b>Common Rail<\/b>/);
  assert.match(html, /Level: 1/);
  assert.match(html, /class="status-chip effect-source-chip"/);
});

test("effectSources: labels without the Lv.N grammar stay readable and show no invented fields", () => {
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Target passive (DummyConfig)" }));
  assert.match(html, /<b>Target passive \(DummyConfig\)<\/b>/);
  assert.equal(html.includes("Level:"), false, "no fabricated level");
  assert.equal(html.includes("Fortification"), false, "no fabricated fortification");
  assert.match(html, /Effect source/);
});

test("effectSources: parseEffectSource is a deterministic split of the available label", () => {
  assert.deepEqual(parseEffectSource("Steady Plan Lv.1"), { name: "Steady Plan", level: 1 });
  assert.deepEqual(parseEffectSource("Steady Plan Lv.3 (V6)"), { name: "Steady Plan", level: 3, fortification: 6 });
  assert.deepEqual(parseEffectSource("Target passive (DummyConfig)"), { name: "Target passive (DummyConfig)" });
  assert.deepEqual(parseEffectSource("attacker passive"), { name: "attacker passive" });
});

test("effectSources: unknown/blank entries stay safe and readable (no fabricated metadata)", () => {
  const ev = {
    effectSources: ["Steady Plan Lv.1", "", "   "],
  } as unknown as LogEventView;
  const refs = effectSourceRefs(ev);
  assert.deepEqual(refs, ["Steady Plan Lv.1"], "blank/unresolvable labels are dropped");
  // A raw label that reaches the chip is always rendered as its own text — never invented:
  const html = renderToStaticMarkup(EffectSourceRef({ label: "Unknown Source #7" }));
  assert.match(html, /Unknown Source #7/);
});

test("effectSources: absent field resolves to no interactive refs (plain-text fallback)", () => {
  assert.deepEqual(effectSourceRefs({} as LogEventView), []);
  assert.deepEqual(effectSourceRefs({ effectSources: undefined } as LogEventView), []);
});