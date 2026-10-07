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
  assert.ok(s.includes("<CommonKeyBadge k={k} size={64} chosenKinds={equ.commonKeyStatChoices?.[k.id] ?? []} />"), "the equipped slot badge shows the player's chosen stat kinds");
  assert.ok(s.includes("<CommonKeyBadge k={k} size={56} />"), "picker card art is large too (no choices yet — browse view)");
  assert.ok(s.includes("commonKeyStatLines(k, chosenKinds)") && s.includes("commonKeyEffectLine(k)"), "badge renders the key's stats (choice-aware) + additional effect");
  assert.ok(s.includes("common-key-stat is-${ln.state}"), "chosen/empty stat lines get a per-state class");
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

test("common keys: chosen stat lines are styled with a distinct colour in the stylesheet", () => {
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(css.includes(".common-key-stat.is-chosen"), "a chosen-stat class exists in the stylesheet");
  assert.ok(/\.common-key-stat\.is-chosen\s*\{[^}]*color:\s*var\(--buff\)/.test(css), "chosen stats use the buff colour (distinct from the muted fixed stat)");
});

test("common keys: per-key stat picker is anchored inside each equipped key's own slot column", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("function CommonKeyStatPicker"), "a dedicated per-key stat-picker component exists");
  assert.ok(s.includes("common-key-slot-col"), "each slot is a COLUMN so the picker can sit under its key");
  assert.ok(s.includes("<CommonKeyStatPicker"), "the picker is rendered inside the slot column (not one detached bar)");
  assert.ok(!s.includes("(equ.commonKeyIds ?? []).map((keyId, slotIdx)"), "no separate full-width picker loop below the slots row");
  assert.ok(s.includes("const fixedCount = props.k.fixedStatCount ?? 1") && s.includes("const maxChoices = (props.k.stats?.length ?? 0) - fixedCount"), "selectable-slot count derived from the key's own slot data + fixedStatCount");
  assert.ok(s.includes("common-key-statpick") && s.includes("common-key-statpick-head"), "picker has its own presentation classes");
  assert.ok(s.includes("options={commonKeys?.selectableStats ?? []}"), "the option pool comes from the engine (IPC), never hardcoded in the renderer");
  assert.ok(s.includes("chosen={equ.commonKeyStatChoices?.[k.id] ?? []}"), "the key's current choices are read per key id");
  assert.ok(s.includes("onToggle={(kind) =>") && s.includes("toggleCommonKeyStatChoice("), "pills flow through the shared toggle helper");
  assert.ok(s.includes("common-key-statpill") && s.includes("{opt.label}"), "each selectable kind is a labelled pill");
  assert.ok(s.includes("isFixed") && s.includes("full") && s.includes("disabled={disabled}"), "the fixed stat and a full slot set disable the pill");
  assert.ok(s.includes("fixed: {fixedKinds.length > 0 ? fixedKinds.map(labelFor).join(\", \") : \"—\"}"), "the key's fixed stat is shown to the player (labelled)");
});
