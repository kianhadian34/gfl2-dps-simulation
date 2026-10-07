import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { elementAsset, assetRenderSpec } from "../src/shared/assets.js";
import { PHASE_WEAKNESSES } from "../src/shared/setup.js";

/**
 * PHASE WEAKNESSES — element icons (2026) — presentation contract.
 *
 * Each Phase weakness option in the Setup screen renders its Element icon next to the label,
 * resolved through the shared `elementAsset` registry (GLOBAL; no character id, never a
 * hardcoded path). The 5 engine Elements each have a supplied icon.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("phase weaknesses: each option renders its element icon via elementAsset (no hardcoded path)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("<AssetThumb asset={elementAsset("), "the phase weaknesses rows use the element resolver");
  assert.ok(s.includes("{PHASE_WEAKNESSES.map("), "still driven by the PHASE_WEAKNESSES option list");
  assert.ok(!s.includes("/assets/elements/"), "no hardcoded element asset path in the renderer");
});

test("phase weaknesses: every option's element id resolves to a SUPPLIED icon", () => {
  for (const p of PHASE_WEAKNESSES) {
    const ref = elementAsset(p.elementId);
    assert.equal(ref.status, "defined", `${p.label} (${p.elementId}) resolves`);
    const spec = assetRenderSpec(ref);
    assert.equal(spec.mode, "img", `${p.label} renders a real image`);
    assert.ok((spec as { src: string }).src.includes(`/assets/elements/${p.elementId}/`), `${p.label} src points at the element file`);
  }
});

test("phase weaknesses: the icon is rendered inline (small badge) next to the label", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  // A small inline badge, distinct from the large artwork sizes (34/64/72/110/300).
  assert.ok(/<AssetThumb asset=\{elementAsset\([^}]*\)\} alt=\{p\.label\} size=\{\d+\} \/>/.test(s), "element AssetThumb carries an explicit small size");
});

test("phase weaknesses: element icons sit TIGHT to the label (the default flex gap is overridden)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(s.includes('<fieldset className="phase-weaknesses">'), "the phase-weakness fieldset carries a scoping class");
  // The form's default `label { gap: 8px }` reads as a large gap beside the icon (+ the
  // icons' baked-in padding), so the phase-weakness row overrides it and drops the icon margin.
  assert.ok(/\.phase-weaknesses label\.inline[,\s][^{]*\{[^}]*gap: \d+px/.test(css), "the phase-weakness label gap is overridden");
  assert.ok(/\.phase-weaknesses \.asset-thumb[,\s][^{]*\{[^}]*margin-right: 0/.test(css), "the element icon right margin is removed");
});
