import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCharacterMetaView, rotationAbilityDescription, passiveDescription } from "../src/shared/lists.js";

/**
 * ROTATION BUILDER (2026) — presentation contract.
 *
 * Each selected character row shows its avatar next to the name; rotation slots and the add-slot
 * buttons show the ability's artwork + real name (engine `CharacterDef.skills` metadata via the
 * shared `skillAsset` resolver — the art lives in the supplied assets). Slot semantics, add/remove/
 * clear behavior, and the RotationSlot set stay unchanged.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("rotation: avatar next to the character name in the builder row", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes('className="mname"') && s.includes("portraitAsset(c.id)"), "avatar rendered next to the name");
  assert.ok(s.includes('<AssetThumb asset={portraitAsset(c.id)} alt={c.name} size={26} />'), "avatar sized like the character selector");
});

test("rotation: slots and add-buttons use BIG ability artwork with the name underneath (fixed-key card style)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("skillOf(slot)") && s.includes('meta[c.id]?.skills?.[slot]'), "skill metadata resolved from the engine data per slot");
  assert.ok(s.includes('className="rot-card"') && s.includes("size={72}"), "choice cards show a big ability picture");
  assert.ok(s.includes('<span className="rot-card-name">{sk.name}</span>'), "ability name sits underneath the picture");
  assert.ok(s.includes("rot-slot-card") && s.includes("size={34}"), "selected rotation slots also show art + name (card style)");
  assert.ok(
    s.includes('title={rotationAbilityDescription(meta[c.id] as CharacterMetaView, slot, props.setup.fortificationLevel)}'),
    "both surfaces resolve the level-aware description for the selected fortification",
  );
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(
    css.includes(".rot-builder .rot-card img,\n.rot-builder .rot-slot-card img { pointer-events: none; }"),
    "artwork doesn't swallow the hover target — the titled card receives hover for the tooltip",
  );
  assert.ok(s.includes("ROTATION_SLOTS.map") && s.includes("addSlot(c.id, slot)"), "same RotationSlot set + selection behavior unchanged");
  const cssActions = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(
    cssActions.includes(".rot-builder .rot-actions button {\n  border: 1px solid var(--border); border-radius: 4px; background: var(--bg-2);"),
    "remove/clear actions use the themed button styling (no browser default)",
  );
});

test("rotation: ability tooltips are level-aware (exact in-game text at the effective level for the selected fortification)", () => {
  const meta = buildCharacterMetaView({
    id: "qiongjiu",
    name: "Qiongjiu",
    fortificationMap: [
      { v: 1, ability: "active1", toLevel: 2 },
      { v: 2, ability: "active2", toLevel: 2 },
      { v: 3, ability: "passive", toLevel: 2 },
      { v: 4, ability: "ultimate", toLevel: 2 },
      { v: 5, ability: "ultimate", toLevel: 3 },
      { v: 6, ability: "passive", toLevel: 3 },
    ],
    skills: {
      basic: { id: "qiongjiu_basic", name: "Fuse", description: "Fuse Lv1 description", descriptions: {} },
      active1: {
        id: "qiongjiu_common_rail",
        name: "Common Rail",
        description: "CR Lv1",
        descriptions: { 2: "CR exact Lv2 tooltip text." },
      },
      active2: {
        id: "qiongjiu_guide_to_victory",
        name: "Guide to Victory",
        description: "GtV Lv1",
        descriptions: { 2: "GtV exact Lv2 tooltip text." },
      },
      ultimate: {
        id: "qiongjiu_pressing_momentum",
        name: "Pressing the Momentum",
        description: "PtM Lv1",
        descriptions: { 2: "PtM exact Lv2 tooltip text.", 3: "PtM exact Lv3 tooltip text." },
      },
    },
    passive: {
      playerDescription: "SP Lv1",
      levelDescriptions: { 2: "SP exact Lv2 tooltip text.", 3: "SP exact Lv3 tooltip text." },
    },
  });
  // V-matrix: effective level drives the exact per-level description.
  assert.equal(rotationAbilityDescription(meta, "active1", 0), "CR Lv1", "V0 → Common Rail Lv1 description");
  assert.equal(rotationAbilityDescription(meta, "active1", 1), "CR exact Lv2 tooltip text.", "V1 → Common Rail exact Lv2");
  assert.equal(rotationAbilityDescription(meta, "active2", 2), "GtV exact Lv2 tooltip text.", "V2 → Guide to Victory exact Lv2");
  assert.equal(passiveDescription(meta, 3), "SP exact Lv2 tooltip text.", "V3 → Steady Plan exact Lv2");
  assert.equal(rotationAbilityDescription(meta, "ultimate", 4), "PtM exact Lv2 tooltip text.", "V4 → Pressing the Momentum exact Lv2");
  assert.equal(rotationAbilityDescription(meta, "ultimate", 5), "PtM exact Lv3 tooltip text.", "V5 → Pressing the Momentum exact Lv3");
  assert.equal(passiveDescription(meta, 6), "SP exact Lv3 tooltip text.", "V6 → Steady Plan exact Lv3");
  assert.equal(rotationAbilityDescription(meta, "ultimate", 6), "PtM exact Lv3 tooltip text.", "V6 → Pressing the Momentum exact Lv3");
  // Fuse/basic stays its Lv1 description at every Fortification level.
  for (const v of [0, 1, 6]) assert.equal(rotationAbilityDescription(meta, "basic", v), "Fuse Lv1 description", `basic stays Lv1 at V${v}`);
  // No mapping → stays Lv1 (top-level description).
  const noMap = buildCharacterMetaView({ id: "x", name: "X", skills: { active1: { id: "a", name: "A", description: "A Lv1 text" } } });
  assert.equal(rotationAbilityDescription(noMap, "active1", 6), "A Lv1 text", "no fortificationMap → Lv1 fallback");
  // Fallbacks: missing finer layers resolve to top-level description, then name.
  const noDesc = buildCharacterMetaView({ id: "y", name: "Y", skills: { active1: { id: "b", name: "B", description: "B top-level" } } });
  assert.equal(rotationAbilityDescription(noDesc, "active1", 9), "B top-level", "skill-level fallback → top-level description");
  assert.equal(rotationAbilityDescription(buildCharacterMetaView({ id: "z", name: "Z" }), "active1", 1), "active1", "no skill metadata → slot id");
  assert.equal(passiveDescription(buildCharacterMetaView({ id: "w", name: "W", passive: { playerDescription: "W passive" } }), 9), "W passive", "passive-level fallback → top-level playerDescription");
});

test("rotation: skill metadata passes through buildCharacterMetaView and session IPC", () => {
  const meta = buildCharacterMetaView({
    id: "qiongjiu",
    name: "Qiongjiu",
    skills: {
      basic: { id: "qiongjiu_basic", name: "Fuse", description: "Deals damage to a single target." },
      active1: { id: "qiongjiu_common_rail", name: "Common Rail", description: "Burns a single target." },
      active2: { id: "qiongjiu_guide_to_victory", name: "Guide to Victory", description: "Aimed shot." },
      ultimate: { id: "qiongjiu_pressing_momentum", name: "Pressing the Momentum", description: "Massive burn damage." },
    },
  });
  assert.deepEqual(meta.skills, {
    basic: { id: "qiongjiu_basic", name: "Fuse", description: "Deals damage to a single target." },
    active1: { id: "qiongjiu_common_rail", name: "Common Rail", description: "Burns a single target." },
    active2: { id: "qiongjiu_guide_to_victory", name: "Guide to Victory", description: "Aimed shot." },
    ultimate: { id: "qiongjiu_pressing_momentum", name: "Pressing the Momentum", description: "Massive burn damage." },
  }, "engine skill ids/names/tooltips reach the renderer");
  const sess = readFileSync(srcFile("../../src/main/session.ts"), "utf8");
  assert.ok(sess.includes("description: def.skills.basic.playerDescription"), "session forwards the ability tooltip");
});