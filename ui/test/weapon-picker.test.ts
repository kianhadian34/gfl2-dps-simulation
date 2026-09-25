import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { weaponAsset, assetRenderSpec, SUPPLIED_ASSET_FILES } from "../src/shared/assets.js";
import { setWeapon, type SetupState } from "../src/shared/setup.js";

/**
 * WEAPON SLOT / DETAIL PANEL (2026) — presentation contract.
 *
 * Empty → the `+` slot; selected → a full weapon-information panel matching the in-game
 * reference (large artwork, name + ELITE badge, signature, Attack / Attack Boost, and the
 * Effect / Trait / Imprint columns). Selection flows through the existing `setWeapon` path;
 * the resolver architecture is untouched; `jinshizou` is never shown.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("empty state: the + slot remains, clicks open the picker, unknown ids stay missing", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes('className="weapon-slot is-empty"'), "empty-slot class");
  assert.ok(s.includes('className="weapon-slot-plus">+'), "centered + in the empty state");
  assert.ok(s.includes("equ.weaponId === undefined"), "empty state = the existing no-weapon condition");
  assert.equal(weaponAsset("definitely_not_a_weapon").status, "unknown");
  assert.deepEqual(assetRenderSpec(weaponAsset("definitely_not_a_weapon")), { mode: "missing" });
});

test("picker: opens the visual weapon choices (dialog + cards + remove option)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("weaponPickerFor"), "renderer-local open state");
  assert.ok(s.includes('role="dialog"'), "picker is a dialog");
  assert.ok(s.includes("weapons.map((w) =>"), "available weapons listed as cards");
  assert.ok(s.includes("weapon-picker-card is-remove"), "the remove/no-weapon option exists");
});

test("selected state: the full weapon DETAIL panel is used (large contain artwork, name, badge, stats)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes('className="weapon-detail"'), "detail panel container");
  assert.ok(s.includes("weaponAsset(equ.weaponId)"), "artwork resolved by the internal id");
  assert.ok(s.includes('width={300} height={180} fit="contain"'), "large contain artwork (no crop / no stretch)");
  assert.ok(s.includes('className="weapon-detail-name"'), "name block");
  assert.ok(s.includes('"ELITE"'), "ELITE badge for rarity elite");
  assert.ok(s.includes("weapon?.atkLvl60"), "Attack from atkLvl60 (369)");
  assert.ok(s.includes("atkBoostPct"), "Attack Boost percent driven from subStats (pctAtk 15%)");
  assert.ok(s.includes("Signature weapon of"), "signature character line");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  assert.ok(css.includes(".weapon-detail-cols") && css.includes(".weapon-detail-col"), "three information columns");
  assert.ok(css.includes("border-left: 1px solid var(--border)"), "vertical separators between columns");
});

test("Golden Melody: artwork resolves via weaponAsset('jinshizou'); only the player-facing name is shown", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("weapon?.name"), "name from authoritative view data");
  assert.ok(!s.includes('"jinshizou"'), "internal id never a source literal");
  const spec = assetRenderSpec(weaponAsset("jinshizou"));
  assert.equal(spec.mode, "img");
  if (spec.mode === "img") assert.equal(spec.src.slice(1), SUPPLIED_ASSET_FILES["weapon:jinshizou"], "supplied .webp used");
});

test("reference copy: Effect / Trait / Imprint texts are preserved verbatim (reference-authoritative)", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("<h4>Effect</h4>") && s.includes("<h4>Trait</h4>") && s.includes("Imprint"), "three column headings");
  assert.ok(s.includes("Increase damage dealt by {dmgs}."), "Effect wording preserved (calibration-dependent values as data tokens)");
  assert.ok(s.includes("stacking up to {maxes} times."), "Effect stacking wording preserved");
  assert.ok(s.includes("she gains a random buff, lasting for 1 turn."), "Trait text preserved");
  assert.ok(s.includes("Increase damage dealt to ELIDs by 2.5%."), "Imprint text preserved");
});

test("selection & removal keep the existing setWeapon path; calibration is INSIDE the card, Effect is calibration-aware, no summary", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("setWeapon(props.setup, c.id, w.id, w.calibrations ?? [])"), "selecting a weapon → existing weaponId path");
  assert.ok(s.includes("setWeapon(props.setup, c.id, undefined, [])"), "removing → existing no-weapon state");
  assert.ok(s.includes('Calibration <span className="muted">(C{weapon?.calibrations.join("/C")'), "calibration selector lives inside the weapon card");
  assert.ok(s.includes("effectCopyWithCalibration(weapon, WEAPON_DETAIL_COPY.effect, equ.calibrationLevel)"), "Effect text renders the selected calibration's values");
  assert.ok(s.includes('className="cal-val"'), "calibration-dependent numbers are highlighted with .cal-val");
  assert.ok(!s.includes("weapon-detail-cal-line") && !s.includes("weapon-detail-calibration"), "no calibration summary UI remains");
  assert.ok(!s.includes("calibrationEffectLines"), "no calibration summary helper remains");
  assert.ok(!s.includes("10%/10%/15%/20%/20%/20%"), "slash-separated C1–C6 values are not hard-coded in the source — they come from the data");
  let st: SetupState = { ...({ turns: 7, seed: 7, fortificationLevel: 0, dummy: { hp: 1, defense: 1, stability: 1, weaknesses: [], ammoWeaknesses: [] }, characters: [{ id: "qiongjiu", name: "Qiongjiu", selected: true }], rotations: { qiongjiu: ["basic"] }, gridEnabled: false, debug: { enabled: false, baseStats: {} } } as SetupState) };
  st = setWeapon(st, "qiongjiu", "jinshizou", [1, 2, 3, 4, 5, 6]);
  assert.equal(st.characters[0].equipment?.weaponId, "jinshizou");
  st = setWeapon(st, "qiongjiu", undefined, []);
  assert.equal(st.characters[0].equipment?.weaponId, undefined, "no-weapon state restored");
});

test("picker cards still give the wide weapon artwork a large contain box; slot CSS only for the empty state", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes('width={200} height={120} fit="contain"'), "picker cards render the art in a large 200x120 contain box");
  const css = readFileSync(srcFile("../../src/renderer/styles.css"), "utf8");
  const slotBlock = css.slice(css.indexOf(".weapon-slot {"), css.indexOf(".weapon-slot:hover"));
  assert.ok(/width: 260px/.test(slotBlock), "empty-slot container width preserved");
  const cardBlock = css.slice(css.indexOf(".weapon-picker-card {"), css.indexOf(".weapon-picker-card:hover"));
  assert.ok(/width: 220px/.test(cardBlock), "picker cards widened to 220px");
});

test("weapon: section uses the same fieldset wrapper structure as the other equipment sections", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  const fk = s.indexOf("<fieldset>");
  assert.ok(fk !== -1 && s.indexOf('Weapon <span className="muted">(exactly 1 — engine `weaponId`)</span>') > fk, "dedicated WEAPON legend inside a fieldset");
  assert.ok(s.includes('<div className="weapon-slot-section">'), "existing weapon slot section kept inside the wrapper");
  const wpStart = s.indexOf("weapon-slot-section");
  const wpClose = s.indexOf("</fieldset>", wpStart);
  const affLegend = s.indexOf("Affinity Key", wpStart);
  assert.ok(wpClose !== -1 && affLegend > wpClose, "weapon wrapper closes before the next section");
});

test("WeaponView exposes subStats (Attack Boost) from authoritative engine data", async () => {
  const { buildWeaponViews } = await import("../src/shared/lists.js");
  const w = await import(new URL("../../../dist/data/weapons.js", import.meta.url).href);
  const views = buildWeaponViews((w as { WEAPONS: unknown[] }).WEAPONS as Parameters<typeof buildWeaponViews>[0]);
  const gm = views.find((v) => v.id === "jinshizou")!;
  assert.deepEqual(gm.subStats, [{ stat: "pctAtk", value: 0.15 }], "Attack Boost 15% comes from WeaponDef.subStats");
});