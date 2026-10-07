import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ammoAsset, assetRenderSpec } from "../src/shared/assets.js";
import { AMMO_WEAKNESSES } from "../src/shared/setup.js";

/**
 * AMMO WEAKNESSES — ammo-type icons (2026) — presentation contract.
 *
 * Each Ammo weakness option in the Setup screen renders its Ammo Type icon next to the label,
 * resolved through the shared `ammoAsset` registry (GLOBAL; no character id, never a hardcoded
 * path). All 5 engine `AmmoType` values have a supplied icon.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("ammo weaknesses: each option renders its ammo icon via ammoAsset (no hardcoded path)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("<AssetThumb asset={ammoAsset("), "the ammo weaknesses rows use the ammo resolver");
  assert.ok(s.includes("{AMMO_WEAKNESSES.map("), "still driven by the AMMO_WEAKNESSES option list");
  assert.ok(!s.includes("/assets/ammo/"), "no hardcoded ammo asset path in the renderer");
});

test("ammo weaknesses: every option's ammo tag resolves to a SUPPLIED icon", () => {
  for (const a of AMMO_WEAKNESSES) {
    const ref = ammoAsset(a.tag);
    assert.equal(ref.status, "defined", `${a.label} (${a.tag}) resolves`);
    const spec = assetRenderSpec(ref);
    assert.equal(spec.mode, "img", `${a.label} renders a real image`);
    assert.ok((spec as { src: string }).src.includes(`/assets/ammo/${a.tag}/`), `${a.label} src points at the ammo file`);
  }
});

test("ammo weaknesses: the icon is rendered inline (small badge) tight to the label", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(/<AssetThumb asset=\{ammoAsset\([^}]*\)\} alt=\{a\.label\} size=\{\d+\} \/>/.test(s), "ammo AssetThumb carries an explicit small size");
  assert.ok(s.includes('<fieldset className="ammo-weaknesses">'), "the ammo-weakness fieldset carries a scoping class");
  assert.ok(/\.ammo-weaknesses label\.inline \{ gap: \d+px; \}/.test(css), "the ammo-weakness label gap is overridden");
  assert.ok(/\.ammo-weaknesses \.asset-thumb \{ margin-right: 0; \}/.test(css), "the ammo icon right margin is removed");
});
