import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  addRotationSlot,
  clearRotation,
  DEFAULT_SETUP,
  insertRotationSlotAt,
  moveRotationSlot,
  removeRotationSlotAt,
  rotationOf,
  setRotation,
  type SetupState,
} from "../src/shared/setup.js";
import { buildCharacterMetaView } from "../src/shared/lists.js";

/**
 * ROTATION BUILDER — revamp (2026) — data helpers + presentation contract.
 *
 * The rotation is a CYCLIC PRIORITY list (src/engine/simulation.ts `pickAction`) — ORDER matters.
 * The revamp adds pure, order-preserving helpers (add / insert / remove-at / move / clear) and a
 * stacked builder (ability palette on top, numbered priority sequence below with connectors + a
 * loop indicator). These tests pin the helper semantics and the presentation contract; the ENGINE
 * stays the validator.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

function setup(): SetupState {
  return { ...DEFAULT_SETUP, characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true }], rotations: {} };
}

// ---------------------------------------------------------------------------
// PURE HELPERS — order-preserving
// ---------------------------------------------------------------------------

test("rotation helpers: rotationOf defaults to empty; setRotation stores a copy verbatim", () => {
  const s = setup();
  assert.deepEqual(rotationOf(s, "qiongjiu"), [], "no rotation → empty");
  const next = setRotation(s, "qiongjiu", ["basic", "active1"]);
  assert.deepEqual(rotationOf(next, "qiongjiu"), ["basic", "active1"]);
  // stored as a COPY — mutating the input array must not affect state
  const input: Array<"basic"> = ["basic"];
  const s2 = setRotation(s, "qiongjiu", input);
  input.push("basic");
  assert.deepEqual(rotationOf(s2, "qiongjiu"), ["basic"], "defensive copy");
});

test("rotation helpers: addRotationSlot appends to the END (priority order)", () => {
  let s = setup();
  s = addRotationSlot(s, "qiongjiu", "basic");
  s = addRotationSlot(s, "qiongjiu", "active1");
  s = addRotationSlot(s, "qiongjiu", "active1");
  assert.deepEqual(rotationOf(s, "qiongjiu"), ["basic", "active1", "active1"], "duplicates ARE allowed (rotation may repeat)");
});

test("rotation helpers: insertRotationSlotAt inserts at an index; out-of-range clamps to the end", () => {
  let s = setRotation(setup(), "qiongjiu", ["basic", "ultimate"]);
  s = insertRotationSlotAt(s, "qiongjiu", 1, "active1");
  assert.deepEqual(rotationOf(s, "qiongjiu"), ["basic", "active1", "ultimate"], "inserted in the middle");
  s = insertRotationSlotAt(s, "qiongjiu", 99, "active2");
  assert.deepEqual(rotationOf(s, "qiongjiu"), ["basic", "active1", "ultimate", "active2"], "past the end → appended");
  s = insertRotationSlotAt(s, "qiongjiu", -5, "active2");
  assert.deepEqual(rotationOf(s, "qiongjiu")[0], "active2", "negative index clamps to the front");
});

test("rotation helpers: removeRotationSlotAt removes one step; out-of-range is a no-op", () => {
  const s = setRotation(setup(), "qiongjiu", ["basic", "active1", "active2"]);
  assert.deepEqual(rotationOf(removeRotationSlotAt(s, "qiongjiu", 1), "qiongjiu"), ["basic", "active2"]);
  assert.equal(removeRotationSlotAt(s, "qiongjiu", 9), s, "out-of-range → same state object");
  assert.equal(removeRotationSlotAt(s, "qiongjiu", -1), s, "negative → same state object");
});

test("rotation helpers: moveRotationSlot reorders by drag/drop; invalid moves are no-ops", () => {
  const s = setRotation(setup(), "qiongjiu", ["basic", "active1", "active2", "ultimate"]);
  assert.deepEqual(rotationOf(moveRotationSlot(s, "qiongjiu", 0, 2), "qiongjiu"), ["active1", "active2", "basic", "ultimate"], "move first → index 2");
  assert.deepEqual(rotationOf(moveRotationSlot(s, "qiongjiu", 3, 0), "qiongjiu"), ["ultimate", "basic", "active1", "active2"], "move last → front");
  assert.equal(moveRotationSlot(s, "qiongjiu", 1, 1), s, "same index → no-op");
  assert.equal(moveRotationSlot(s, "qiongjiu", -1, 2), s, "out-of-range from → no-op");
  assert.equal(moveRotationSlot(s, "qiongjiu", 0, 9), s, "out-of-range to → no-op");
});

test("rotation helpers: clearRotation empties the list (engine rejects an empty rotation at run)", () => {
  const s = setRotation(setup(), "qiongjiu", ["basic", "active1"]);
  assert.deepEqual(rotationOf(clearRotation(s, "qiongjiu"), "qiongjiu"), []);
});

test("rotation helpers: they never touch OTHER characters' rotations", () => {
  let s: SetupState = { ...setup(), characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true }, { id: "basic_attack_dummy", name: "Dummy", selected: true }], rotations: { basic_attack_dummy: ["basic"] } };
  s = addRotationSlot(s, "qiongjiu", "active1");
  assert.deepEqual(rotationOf(s, "basic_attack_dummy"), ["basic"], "the other character's rotation is untouched");
});

// ---------------------------------------------------------------------------
// PLUMBING — skill type / element / ammoType reach the view
// ---------------------------------------------------------------------------

test("rotation plumbing: skill type/element/ammoType pass through buildCharacterMetaView", () => {
  const meta = buildCharacterMetaView({
    id: "qiongjiu",
    name: "Qiongjiu",
    skills: {
      basic: { id: "qiongjiu_basic", name: "Fuse", type: "basic", element: null, ammoType: "medium_ammo" },
      active1: { id: "qiongjiu_common_rail", name: "Common Rail", type: "active", element: "burn", ammoType: "medium_ammo" },
    },
  });
  assert.deepEqual(meta.skills?.active1, { id: "qiongjiu_common_rail", name: "Common Rail", type: "active", element: "burn", ammoType: "medium_ammo" }, "card badges get engine type/element/ammo");
  assert.equal(meta.skills?.basic?.element, null, "phase-less (null) is carried through");
});

// ---------------------------------------------------------------------------
// PRESENTATION CONTRACT
// ---------------------------------------------------------------------------

test("rotation UI: stacked builder (abilities palette on top, priority order below)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(s.includes('className="rot-panels"'), "panel wrapper present");
  assert.ok(s.includes('className="rot-palette"') && s.includes('className="rot-sequence"'), "abilities palette + priority sequence");
  assert.ok(s.includes("Abilities <span") && s.includes("Priority order <span"), "each panel is labelled (palette vs priority order)");
  // STACKED: the palette (first child) sits ABOVE the priority sequence (single-column grid), not beside it.
  assert.ok(s.indexOf('className="rot-palette"') < s.indexOf('className="rot-sequence"'), "the palette is rendered before the sequence (top → bottom)");
  assert.ok(/\.rot-builder \.rot-panels \{[^}]*grid-template-columns: 1fr;/.test(css), "the panels stack in ONE column (priority order on the line below)");
  assert.ok(!/grid-template-columns: minmax\(0, 1fr\) minmax/.test(css), "no side-by-side two-column template remains");
});

test("rotation UI: ordered sequence shows numbered steps + connectors + a loop indicator", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(s.includes('className="rot-step-num"') && s.includes("{i + 1}"), "each step carries its 1-based order number");
  assert.ok(s.includes('className="rot-loop"'), "a loop-back indicator is rendered after the last step");
  assert.ok(css.includes(".rot-builder .rot-slot-wrap.has-connector::before"), "steps are joined by a connector");
  assert.ok(css.includes(".rot-builder .rot-loop"), "the loop indicator is styled");
});

test("rotation UI: ability cards carry a type rail, hover affordance, and element/ammo mini-badges", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(s.includes("rot-card-rail") && s.includes("is-${sk?.type ?? \"basic\"}"), "the type rail reflects the engine skill type");
  assert.ok(css.includes(".rot-builder .rot-card-rail.is-active"), "type rail colors per skill type");
  assert.ok(s.includes("<RotationSkillMeta sk={sk} />"), "cards render the element/ammo badge component");
  assert.ok(s.includes("elementAsset(elementId)") && s.includes("ammoAsset(sk.ammoType)"), "badges resolve through the shared registries (no hardcoded paths)");
});

test("rotation UI: drag-and-drop reorder flows through the pure moveRotationSlot helper", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("onDragStart=") && s.includes("onDrop=") && s.includes("draggable"), "steps are draggable");
  assert.ok(s.includes("moveRotationSlot(props.setup, c.id, dragIndex.from, i)"), "drop reorders via the tested helper");
  assert.ok(s.includes("removeRotationSlotAt(props.setup, c.id, i)"), "per-step remove uses the tested helper");
});

test("rotation UI: remove/clear still flow through the pure helpers (behavior preserved)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("addRotationSlot(props.setup, id, slot)"), "palette click appends via the helper");
  assert.ok(s.includes("removeRotationSlotAt(props.setup, c.id, rotation.length - 1)"), "− remove pops the last step");
  assert.ok(s.includes("clearRotation(props.setup, c.id)"), "clear empties the rotation");
});
