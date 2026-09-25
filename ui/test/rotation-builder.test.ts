import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCharacterMetaView } from "../src/shared/lists.js";

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
  assert.ok(s.includes("ROTATION_SLOTS.map") && s.includes("addSlot(c.id, slot)"), "same RotationSlot set + selection behavior unchanged");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(
    css.includes(".rot-builder .rot-actions button {\n  border: 1px solid var(--border); border-radius: 4px; background: var(--bg-2);"),
    "remove/clear actions use the themed button styling (no browser default)",
  );
});

test("rotation: skill metadata passes through buildCharacterMetaView and session IPC", () => {
  const meta = buildCharacterMetaView({
    id: "qiongjiu",
    name: "Qiongjiu",
    skills: {
      basic: { id: "qiongjiu_basic", name: "Fuse" },
      active1: { id: "qiongjiu_common_rail", name: "Common Rail" },
      active2: { id: "qiongjiu_guide_to_victory", name: "Guide to Victory" },
      ultimate: { id: "qiongjiu_pressing_momentum", name: "Pressing the Momentum" },
    },
  });
  assert.deepEqual(meta.skills, {
    basic: { id: "qiongjiu_basic", name: "Fuse" },
    active1: { id: "qiongjiu_common_rail", name: "Common Rail" },
    active2: { id: "qiongjiu_guide_to_victory", name: "Guide to Victory" },
    ultimate: { id: "qiongjiu_pressing_momentum", name: "Pressing the Momentum" },
  }, "engine skill ids/names reach the renderer (ids feed skillAsset)");
  const sess = readFileSync(srcFile("../../src/main/session.ts"), "utf8");
  assert.ok(sess.includes("skills:") && sess.includes("basic: { id: def.skills.basic.id, name: def.skills.basic.name }"), "session maps the rotation abilities");
});