import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildScenario, DEFAULT_SETUP, MAX_FORTIFICATION_LEVEL, setFortificationLevel, type SetupState } from "../src/shared/setup.js";
import { saveSetup, loadSetup, SETUP_STORAGE_KEY } from "../src/shared/persist.js";

/**
 * FORTIFICATION (V) UI (2026) — run-global config, independent of Affinity/keys.
 * Default V0; V1–V6 selectable; the value is persisted and carried into
 * Scenario.configOverrides.fortificationLevel VERBATIM (V0 explicitly as 0).
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

function setupWith(overrides: Partial<SetupState> = {}): SetupState {
  return { ...DEFAULT_SETUP, characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true }], rotations: { qiongjiu: ["basic"] }, ...overrides };
}

test("fortification: default state is V0 and MAX_FORTIFICATION_LEVEL is 6", () => {
  assert.equal(DEFAULT_SETUP.fortificationLevel, 0, "V0 default (all abilities Level 1/baseline)");
  assert.equal(MAX_FORTIFICATION_LEVEL, 6, "UI exposes V0–V6 (QJ map covers V1–V6)");
});

test("fortification: selecting V1–V6 updates state; invalid values are a no-op", () => {
  let s = setupWith();
  for (const v of [1, 3, 6]) {
    s = setFortificationLevel(s, v);
    assert.equal(s.fortificationLevel, v, `V${v} selected`);
  }
  s = setFortificationLevel(s, 0);
  assert.equal(s.fortificationLevel, 0, "back to V0");
  const before = s.fortificationLevel;
  assert.equal(setFortificationLevel(s, 7).fortificationLevel, before, "V7 rejected (no map entries beyond V6)");
  assert.equal(setFortificationLevel(s, -1).fortificationLevel, before, "negative rejected");
  assert.equal(setFortificationLevel(s, 2.5).fortificationLevel, before, "non-integer rejected");
});

test("fortification: carried VERBATIM into scenario configOverrides — V0 explicitly as 0", () => {
  const sc0 = buildScenario(setupWith());
  assert.deepEqual(sc0.configOverrides, { fortificationLevel: 0 }, "default V0 reached the scenario as the number 0");
  const sc6 = buildScenario(setFortificationLevel(setupWith(), 6));
  assert.deepEqual(sc6.configOverrides, { fortificationLevel: 6 }, "V6 carried unchanged");
});

test("fortification: persistence round-trip keeps the value", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
  const setup = setupWith({ fortificationLevel: 4 });
  saveSetup(storage, setup);
  assert.ok(map.has(SETUP_STORAGE_KEY));
  assert.equal(loadSetup(storage)?.fortificationLevel, 4, "V4 restored from persisted setup");
});

test("fortification: UI selector is per-character, on top of the Fixed Keys section (V0–V6, current value obvious, no ability effects hardcoded)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("Fortification") && s.includes("[0, 1, 2, 3, 4, 5, 6].map"), "V0–V6 pills rendered");
  assert.ok(s.includes("affinity-level-pill") && s.includes("props.setup.fortificationLevel === v ? \" is-selected\""), "current value highlighted via is-selected");
  assert.ok(s.includes("set({ fortificationLevel: v })"), "selection flows through the setup state");
  const fortIndex = s.indexOf("<div className=\"pills-row\">\n                        <span className=\"pills-label\">Fortification");
  const fkIndex = s.indexOf("Fixed Keys ({equ.equippedFixedKeys");
  assert.ok(fortIndex !== -1 && fkIndex !== -1 && fortIndex < fkIndex, "Fortification renders INSIDE the character equipment area, above the Fixed Keys fieldset");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(css.includes(".pills-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 12px 0 14px; }"), "fortification row is spaced from the lines above/below");
  assert.ok(!s.includes("Steady Plan") && !s.includes("fortificationMap"), "no character-specific ability effects in the UI — value only");
});