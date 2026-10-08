import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MAX_APEX_COMPONENTS_UI } from "../src/shared/setup.js";

/**
 * APEX CHASSIS — SETUP UI (2026) — presentation contract.
 *
 * The Apex Chassis is SCENARIO-LEVEL (account-wide), so it renders as its OWN top-level section
 * (not per-character). Up to `maxComponents` slots; a picker reuses the existing card pattern;
 * equipping goes through the shared `setApexComponentAt` (one-per-type enforced there), and the
 * enhancement level goes through `setApexEnhancement`. The engine remains the final validator.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("apex UI: a dedicated top-level Apex Chassis section (scenario-level, not per character)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("<h2>Apex Chassis"), "its own section heading");
  assert.ok(s.includes("Heavy Ordnance Corps — account-wide"), "labelled account-wide");
  assert.ok(s.includes("apex?.items ?? []"), "the component list comes from the engine (IPC), never hardcoded");
  assert.ok(s.includes("apex?.maxComponents ?? MAX_APEX_COMPONENTS_UI"), "engine max wired in");
  assert.ok(s.includes("Array.from({ length: apex?.maxComponents ?? MAX_APEX_COMPONENTS_UI }"), "one slot per allowed component");
});

test("apex UI: slots render a badge, a remove control, and a per-slot enhancement control", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("function ApexComponentBadge"), "a dedicated Apex badge component exists");
  assert.ok(s.includes("<ApexComponentBadge k={k} />"), "slot art uses the badge");
  assert.ok(s.includes("common-key-slot-remove"), "a filled slot can be removed");
  assert.ok(s.includes("apex-enhance") && s.includes('type="range"'), "the enhancement level is adjustable");
  assert.ok(s.includes("setApexEnhancement(props.setup, slot, Number(e.target.value))"), "enhancement flows through the shared helper");
  assert.ok(s.includes("max={k.maxEnhancement}"), "the slider is bounded by the component's max enhancement");
});

test("apex UI: the picker reuses the card pattern and goes through the shared helper", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes('role="dialog" aria-label="Choose Apex Component"'), "slot click opens the shared picker pattern");
  assert.ok(s.includes("setApexComponentAt(props.setup, apexSlot, k.id, apexTypeOf(apex))"), "selection flows through the shared helper");
  assert.ok(s.includes("setApexComponentAt(props.setup, slot, undefined, apexTypeOf(apex))"), "removal flows through the shared helper");
  assert.ok(s.includes("disabled={usedElsewhere}"), "a component already equipped elsewhere is disabled");
  assert.ok(s.includes("function apexTypeOf"), "the one-per-type rule is driven by an engine-sourced type lookup");
});

test("apex UI: MAX_APEX_COMPONENTS_UI mirrors the engine maximum (2)", () => {
  assert.equal(MAX_APEX_COMPONENTS_UI, 2, "up to 2 Apex Components");
});

test("setup UI layout: only the 3 named sections move — Simulation settings left, Apex + DEBUG right", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  // Minimal change: the grid stays a flat 2-column auto-flow (the character sections keep their
  // ORIGINAL placement); only the 3 sections the layout calls for are repositioned.
  // DOM order is the auto-flow order → Simulation settings now precedes Apex Chassis.
  const simIdx = s.indexOf("<h2>Simulation settings</h2>");
  const apexIdx = s.indexOf("<h2>Apex Chassis");
  const debugIdx = s.indexOf("<h2>DEBUG MODE");
  assert.ok(simIdx > 0 && simIdx < apexIdx && apexIdx < debugIdx, "DOM order: Simulation settings → Apex Chassis → DEBUG MODE");
  // DEBUG is pinned to the RIGHT column so it sits UNDER Apex Chassis (otherwise it would fill the
  // empty cell to the LEFT of row 4).
  assert.ok(s.includes('<section className="grid-right">'), "DEBUG MODE is pinned to the right column");
  assert.ok(!s.includes('className="setup-col"'), "no full-column wrapper restructure (minimal change)");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(/\.setup \.content\.setup-grid > \.grid-right\s*\{\s*grid-column:\s*2/.test(css), "grid-right pins to column 2");
});
