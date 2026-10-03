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

test("affinity level: a CHARACTER-scoped selector (separate from the key) offers the recorded levels (data-driven), defaults to Lv5, and the badge filters to the chosen level", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("affinity-level-pill"), "affinity level pills exist");
  // Levels come from the CHARACTER's affinity data — independent of the equipped Affinity Key.
  assert.ok(s.includes("affinityLevels(m)"), "levels come from the character-data helper (never hardcoded)");
  assert.ok(!s.includes("Object.keys(affinityKey.levels)"), "levels no longer derive from the Affinity Key's levels");
  assert.ok(s.includes("setAffinityLevel(props.setup, c.id, lv)"), "level selection flows through setAffinityLevel");
  assert.ok(s.includes("Level {lv}"), "pills label the level data-driven");
  assert.ok(s.includes("level={equ.affinityLevel}") && s.includes("affinityKeyStatLines(k, level)"), "badge/tooltip show ONLY the chosen level's stats");
  // Default Lv.5 shows selected when nothing is stored (engine default), and the row lives on its own,
  // above the key slot — NOT gated on the signature key any more.
  assert.ok(s.includes('(equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL) === lv ? " is-selected"'), "chosen level highlighted (defaults to Lv5)");
  assert.ok(s.includes('className="affinity-levels"') && s.includes("affinityLevels(m).length > 0"), "a dedicated affinity-levels row renders from character data");
  assert.ok(s.includes('role="button"') && s.includes("onKeyDown"), "level pills are accessible");
});

test("affinity/expansion data actually reaches the UI: session.ts IPC passes description/levels/genericBonus/affinityLevelStats", () => {
  const s = readFileSync(srcFile("../../src/main/session.ts"), "utf8");
  assert.ok(s.includes("description: def.expansionKey.description"), "expansion description is forwarded to the renderer");
  assert.ok(s.includes("levels: def.affinityKey.levels") && s.includes("genericBonus: def.affinityKey.genericBonus"), "affinity levels + generic bonus are forwarded to the renderer");
  assert.ok(s.includes("affinityLevelStats: def.affinityLevelStats"), "standalone character affinity-level stats are forwarded to the renderer");
  assert.ok(s.includes("affinityFlatStats: def.affinityFlatStats"), "standalone character affinity-level FLAT stats are forwarded to the renderer");
});

test("affinity section shows the standalone CHARACTER Affinity row at every recorded level (data-driven): Lv5 → cumulative FLAT lines, Lv9 → +5% lines AND the flats", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("affinityLevelStatLines(m, equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL)"), "character-level % lines come from the data helper at the effective level (default Lv5)");
  assert.ok(s.includes("affinityLevelFlatLines(m, equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL)"), "character-level FLAT lines come from the data helper (cumulative through the level)");
  assert.ok(s.includes("Character Affinity"), "row is labeled as character-level (not the key)");
  assert.ok(s.includes("affinity-level-bonus"), "separate row structure (distinct from key stats)");
  // The row renders whenever the level HAS a contribution — Lv5 now qualifies via its flat totals.
  assert.ok(
    s.includes("affinityLevelStatLines(m, equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL).length + affinityLevelFlatLines(m, equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL).length > 0"),
    "row renders whenever the level grants a % or flat contribution (Lv5 flats included)",
  );
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