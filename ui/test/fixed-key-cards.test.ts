import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fixedKeyAsset, assetRenderSpec, SUPPLIED_ASSET_FILES, KNOWN_ENTITY_IDS } from "../src/shared/assets.js";

/**
 * FIXED KEY CARD GRID (2026) — presentation contract.
 *
 * The Fixed Keys section renders one selectable CARD per key: large artwork via the existing
 * AssetThumb/fixedKeyAsset resolver, the authoritative "Fixed Key N - Name" text underneath,
 * selected/unselected states, keyboard-accessible checkbox inside the label, and the existing
 * descriptions/tooltips. Selection still flows through `toggleFixedKey` (3-key cap unchanged);
 * the engine/KeyDef/resolver/IDs are untouched.
 */

const FK_IDS = [
  "qiongjiu_fk1_concentration",
  "qiongjiu_fk2_efficient_planning",
  "qiongjiu_fk3_targeted_training",
  "qiongjiu_fk4_point_of_vulnerability",
  "qiongjiu_fk5_necessary_adjustments",
  "qiongjiu_fk6_steadiness",
];

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("all 6 Fixed Keys resolve through fixedKeyAsset(k.id) to the actual supplied webp artwork (img mode)", () => {
  for (const id of FK_IDS) {
    const ref = fixedKeyAsset(id);
    assert.equal(ref.status, "defined", `${id} known`);
    const spec = assetRenderSpec(ref);
    assert.equal(spec.mode, "img", `${id} artwork is supplied → image mode`);
    if (spec.mode === "img") {
      assert.equal(spec.src.slice(1), SUPPLIED_ASSET_FILES[`fixed-key:${id}`], `${id} uses its real supplied file`);
      assert.ok(spec.src.endsWith(".webp"), `${id} uses .webp`);
    }
  }
  assert.equal(FK_IDS.length, KNOWN_ENTITY_IDS["fixed-key"].size, "exactly the 6 known Fixed Keys");
});

test("the card grid is in place and uses the resolver — no hardcoded asset paths, names not hardcoded", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes('className="fixed-key-cards"'), "card grid container");
  assert.ok(s.includes("fixedKeyAsset(k.id)"), "artwork resolved via the existing resolver (no hardcoded path)");
  assert.ok(s.includes('<input\n                                    type="checkbox"'), "real checkbox retained inside each card (keyboard accessible)");
  assert.ok(s.includes("toggleFixedKey(props.setup, c.id, k.id)"), "selection still flows through toggleFixedKey (3-key cap preserved)");
  assert.ok(s.includes("fixedKeyLabel(k)"), "authoritative label text used");
  assert.ok(!s.includes('src="/assets'), "no hardcoded asset URL in the component");
  for (const name of ["Concentration", "Efficient Planning", "Targeted Training", "Point of Vulnerability", "Necessary Adjustments", "Steadiness"]) {
    assert.ok(!s.includes(`"${name}"`), `key name "${name}" is NOT hardcoded in the component (comes from the engine data)`);
  }
});

test("selected/unselected state applies the is-selected class; unknowns still follow the resolver contract", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes('`fixed-key-card${checked ? " is-selected" : ""}`'), "selected state class");
  assert.ok(s.includes('checked={checked}'), "checked state bound to the equipment selection");
  // Unsupplied/unknown still honored by AssetThumb (mode contract, not duplicated here).
  assert.deepEqual(assetRenderSpec(fixedKeyAsset("qiongjiu_fk1_concentration")).mode, "img");
  assert.equal(fixedKeyAsset("definitely_not_a_key").status, "unknown");
});