import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * AFFINITY KEY / EXPANSION KEY — SINGLE-SLOT CARD UI (2026) — presentation contract.
 *
 * Both sections follow the Common Keys card pattern: a slot (empty = centered `+`, filled =
 * badge with large artwork + name + data lines) that opens a picker dialog reusing the
 * existing `setAffinityKey` / `setExpansionKey` paths and the same slot/picker styling.
 * Nothing is invented — stats/effect text comes from the engine data via the lists helpers.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("affinity key: badge slot + picker reuse the common-key card pattern and setAffinityKey", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("function AffinityKeyBadge"), "affinity badge component present");
  assert.ok(s.includes("affinityKeyStatLines(k, level)"), "affinity badge renders the recorded per-level stats (filtered by chosen level)");
  assert.ok(s.includes("title={tip}") && s.includes("const tip = [k.name, ...lines].join(\"\\n\");"), "affinity stats available as a hover tooltip (fixed-key reference)");
  assert.ok(s.includes("className=\"common-key-badge\""), "badge wrapper allows the tooltip");
  assert.ok(s.includes("<AffinityKeyBadge k={affinityKey} size={64} level={equ.affinityLevel} />"), "slot art is the large fixed-key size");
  assert.ok(s.includes("className={`common-key-slot${equ.affinityKeyId ? \" is-filled\" : \" is-empty\"}`}"), "affinity uses the same slot classes");
  assert.ok(s.includes("onClick={() => setAffinityPickerFor(c.id)}") && s.includes("aria-label=\"Choose Affinity Key\""), "slot opens its picker");
  assert.ok(s.includes("setAffinityKey(props.setup, c.id, affinityKey.id)"), "selection through the existing setAffinityKey path");
  assert.ok(s.includes("setAffinityKey(props.setup, c.id, undefined)"), "clear through the existing path");
  assert.ok(!s.includes("e.target.value === \"\" ? undefined : e.target.value"), "legacy select forms removed");
});

test("affinity level: picker offers the exact recorded levels (data-driven), the badge filters to the chosen level, and the slot shows inline pills for the SIGNATURE key", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("affinity-level-pill"), "affinity level pills exist");
  assert.ok(s.includes("Object.keys(affinityKey.levels)"), "levels come from the engine data (never hardcoded)");
  assert.ok(s.includes("setAffinityLevel(props.setup, c.id, lv)"), "level selection flows through setAffinityLevel");
  assert.ok(s.includes("Level {lv}"), "pills label the level data-driven");
  assert.ok(s.includes("level={equ.affinityLevel}") && s.includes("affinityKeyStatLines(k, level)"), "badge/tooltip show ONLY the chosen level's stats");
  assert.ok(s.includes("equ.affinityLevel === lv ? \" is-selected\""), "chosen level highlighted");
  assert.ok(s.includes('className="affinity-levels" onClick={(e) => e.stopPropagation()}'), "level pills are ALSO rendered next to the selected key in the slot (quick change)");
  assert.ok(s.includes('role="button"') && s.includes("onKeyDown"), "slot pills are accessible inside the slot button");
  const sig = s.match(/equ\.affinityKeyId === affinityKey\.id/g) ?? [];
  assert.ok(sig.length >= 2, "the level selector appears ONLY when the signature affinity key is equipped (slot + picker)");
});

test("affinity/expansion data actually reaches the UI: session.ts IPC passes description/levels/genericBonus/affinityLevelStats", () => {
  const s = readFileSync(srcFile("../../src/main/session.ts"), "utf8");
  assert.ok(s.includes("description: def.expansionKey.description"), "expansion description is forwarded to the renderer");
  assert.ok(s.includes("levels: def.affinityKey.levels") && s.includes("genericBonus: def.affinityKey.genericBonus"), "affinity levels + generic bonus are forwarded to the renderer");
  assert.ok(s.includes("affinityLevelStats: def.affinityLevelStats"), "standalone character affinity-level stats are forwarded to the renderer");
});

test("affinity section shows the standalone CHARACTER Affinity row at Lv9 (data-driven), never at Lv5", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("affinityLevelStatLines(m, equ.affinityLevel)"), "character-level bonus lines come from the data helper");
  assert.ok(s.includes("Character Affinity"), "row is labeled as character-level (not the key)");
  assert.ok(s.includes("affinity-level-bonus"), "separate row structure (distinct from key stats)");
  assert.ok(s.includes("affinityLevelStatLines(m, equ.affinityLevel).length > 0"), "row renders only when the level has standalone stats (Lv9; Lv5 → empty → hidden)");
  // Existing key display untouched: badge + key stats still render as before.
  assert.ok(s.includes("<AffinityKeyBadge k={affinityKey} size={64} level={equ.affinityLevel} />"), "affinity key badge unchanged");
});

test("expansion key: badge slot + picker reuse the common-key card pattern and setExpansionKey", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("function ExpansionKeyBadge"), "expansion badge component present");
  assert.ok(s.includes("expansionKeyEffectLine(k)"), "expansion badge renders the authoritative effect text");
  assert.ok(s.includes("const tip = effect !== undefined ? [k.name, effect].join(\"\\n\") : k.name;"), "full key tooltip available on hover (title)");
  assert.ok(s.includes("common-key-effect"), "long tooltip text still has its display class");
  assert.ok(s.includes("<ExpansionKeyBadge k={expansionKey} size={64} />"), "slot art is the large fixed-key size");
  assert.ok(s.includes("className={`common-key-slot${equ.expansionKeyId ? \" is-filled\" : \" is-empty\"}`}"), "expansion uses the same slot classes");
  assert.ok(s.includes("onClick={() => setExpansionPickerFor(c.id)}") && s.includes("aria-label=\"Choose Expansion Key\""), "slot opens its picker");
  assert.ok(s.includes("setExpansionKey(props.setup, c.id, expansionKey.id)"), "selection through the existing setExpansionKey path");
  assert.ok(s.includes("setExpansionKey(props.setup, c.id, undefined)"), "clear through the existing path");
  assert.ok(s.includes("common-key-slots is-single"), "singleton sections use the single-slot width");
});