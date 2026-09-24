import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { commonKeyAsset } from "../src/shared/assets.js";
import { MAX_COMMON_KEYS_UI } from "../src/shared/setup.js";

/**
 * COMMON KEYS — 3-SLOT SELECTION (2026) — presentation contract.
 *
 * Exactly 3 rectangular slots side by side; empty slots show a centered `+` and open the
 * key picker; filled slots render the key icon/name and offer remove-in-place; the picker
 * reuses the existing Common Keys list + `setCommonKeyAt` (single data system, engine 3-slot
 * cap preserved). The section label keeps its engine-3-slot note.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("common keys: 3 empty slots with + open the picker; label keeps the engine note", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("Common Keys ({equ.commonKeyIds?.length ?? 0}/{MAX_COMMON_KEYS_UI}) — engine 3-slot max"), "section label preserved");
  assert.ok(s.includes("<div className=\"common-key-slots\">") && s.includes("[0, 1, 2].map"), "exactly 3 slots rendered side by side");
  assert.ok(s.includes("className={`common-key-slot${k ? \" is-filled\" : \" is-empty\"}`}"), "empty vs filled slot states");
  assert.ok(s.includes("common-key-slot-plus") && s.includes("+"), "empty slot shows a centered +");
  assert.ok(s.includes("onClick={() => setCommonKeySlot(slot)}"), "clicking a slot opens the key selection UI");
});

test("common keys: filled slots show the fixed-key-style badge — big art, name, 3 stats, additional effect", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("function CommonKeyBadge"), "shared badge component present");
  assert.ok(s.includes("<CommonKeyBadge k={k} size={64} />"), "slot art is the same large presentation as the fixed keys");
  assert.ok(s.includes("<CommonKeyBadge k={k} size={56} />"), "picker card art is large too");
  assert.ok(s.includes("commonKeyStatLines(k)") && s.includes("commonKeyEffectLine(k)"), "badge renders the key's stats + additional effect");
  assert.ok(s.includes("common-key-stat") && s.includes("common-key-effect"), "stats/effect have their own presentation classes");
  assert.ok(s.includes("common-key-slot-remove"), "a selected key can be removed from its slot");
  assert.ok(s.includes("setCommonKeyAt("), "selection flows through the existing key helpers (slot-aware)");
  assert.ok(s.includes("commonKeySlot !== null") && s.includes("role=\"dialog\" aria-label=\"Choose Common Key\""), "slot click opens the shared key picker");
  assert.ok(s.includes("(commonKeys?.items ?? []).map((k)"), "picker reuses the existing Common Keys list (no second data system)");
  assert.ok(s.includes("disabled={usedElsewhere}"), "a key already equipped in another slot is disabled (no cross-slot duplicates)");
  assert.ok(s.includes("commonKeys?.maxCommonKeys ?? MAX_COMMON_KEYS_UI"), "engine 3-slot cap wired into every change");
  assert.ok(!s.includes("toggleCommonKey("), "slot UI no longer uses the toggle list");
});

test("common keys: 3-slot UI constant matches the shared/engine cap reference", () => {
  assert.equal(MAX_COMMON_KEYS_UI, 3, "UI slot count mirrors the engine 3 Common Key Slots");
});