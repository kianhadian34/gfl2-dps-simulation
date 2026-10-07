import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeaponViews, buildCommonKeyViews, buildCommonKeySelectableStats, buildCharacterMetaView, effectCopyWithCalibration, commonKeyStatLines, commonKeyEffectLine, affinityKeyStatLines, expansionKeyEffectLine, affinityLevelStatLines, affinityLevels, affinityLevelFlatLines } from "../src/shared/lists.js";

/**
 * ENGINE-SOURCED LIST CONTRACT (2026 — plumbing; no UI controls yet).
 *
 * `ui/src/shared/lists.ts` is ENGINE-FREE: it shapes plain engine-shaped data into the IPC
 * view payloads (built in Electron main from src/data/weapons.ts, src/data/common-keys.ts
 * and the character registry). These tests pin the mapping and — via the engine dist build —
 * prove the UI-facing lists match the real registry (identical ids/names/numbers).
 */

test("unit: buildWeaponViews maps engine weapon shapes into ascending calibration numbers + effect values", () => {
  const views = buildWeaponViews([
    { id: "w1", name: "Weapon One", rarity: "elite", atkLvl60: 369, subStats: [{ stat: "pctAtk", value: 0.15 }], ownerCharacterId: "qiongjiu", calibrations: { 2: { damageDealt: 0.1 }, 1: {}, 6: { damageDealt: 0.2, charging: { perStackValue: 0.2, maxStacks: 4, stacksPerGain: 2 } } } },
    { id: "w2", name: "Weapon Two", rarity: "rare", atkLvl60: 120 }, // no calibrations / no owner / no substats
  ]);
  assert.deepEqual(views[0], {
    id: "w1",
    name: "Weapon One",
    rarity: "elite",
    atkLvl60: 369,
    subStats: [{ stat: "pctAtk", value: 0.15 }],
    ownerCharacterId: "qiongjiu",
    calibrations: [1, 2, 6],
    calibrationEffects: { 1: {}, 2: { damageDealt: 0.1 }, 6: { damageDealt: 0.2, charging: { perStackValue: 0.2, maxStacks: 4, stacksPerGain: 2 } } },
  });
  assert.deepEqual(views[1], { id: "w2", name: "Weapon Two", rarity: "rare", atkLvl60: 120, subStats: [], calibrations: [], calibrationEffects: {} }, "absent owner/calibrations/substats stay empty");
});

test("unit: commonKeyStatLines/EffectLine render the granted stats and the additional effect (data-driven, nothing invented)", () => {
  const res = buildCommonKeyViews(
    [
      {
        id: "qiongjiu_common_strategic_negotiation",
        name: "Strategic Negotiation",
        characterScope: "qiongjiu",
        // 2026 corrected model: slot #0 fixed (Crit Rate); slots #1/#2 player-selectable.
        stats: [{ kind: "critRate", value: 0.05 }, { value: 0.05 }, { value: 0.05 }],
        secondaryEffect: { description: "Increase damage dealt outside of the unit's own turn by 7%.", stats: { outOfTurnDmg: 0.07 } },
      },
      { id: "generic_epic", name: "Generic Epic", stats: [{ kind: "atkPct", value: 0.06 }, { kind: "critRate", value: 0.03 }, { kind: "critDmg", value: 0.03 }], fixedStatCount: 3, secondaryEffect: { description: "Boosts Phase damage by 5%." } },
      { id: "bare", name: "Bare Key" },
    ],
    3,
  );
  const [sn, epic, bare] = res.items;
  assert.deepEqual(
    sn.stats,
    [{ kind: "critRate", value: 0.05 }, { value: 0.05 }, { value: 0.05 }],
    "stat slots deep-copied from the engine data",
  );
  assert.deepEqual(
    commonKeyStatLines(sn),
    [
      { text: "Crit Rate +5.0%", state: "fixed" },
      { text: "(selectable) choose a stat +5.0%", state: "empty" },
      { text: "(selectable) choose a stat +5.0%", state: "empty" },
    ],
    "fixed slot #0 shown with its kind; unchosen selectable slots shown open",
  );
  // With the player's chosen kinds, the selectable lines reflect them (tagged `chosen`), in slot order.
  assert.deepEqual(
    commonKeyStatLines(sn, ["critDmg", "hpPct"]),
    [
      { text: "Crit Rate +5.0%", state: "fixed" },
      { text: "Crit DMG +5.0%", state: "chosen" },
      { text: "Health Boost +5.0%", state: "chosen" },
    ],
    "chosen kinds replace the open placeholder (one per selectable slot, in order)",
  );
  // A partial choice fills only as many selectable lines as were chosen; the rest stay open.
  assert.deepEqual(
    commonKeyStatLines(sn, ["atkPct"]).map((l) => l.state),
    ["fixed", "chosen", "empty"],
    "one choice → first selectable line chosen, second still open",
  );
  assert.equal(commonKeyEffectLine(sn), "Increase damage dealt outside of the unit's own turn by 7%.", "the secondary-effect description is the additional effect");
  assert.deepEqual(commonKeyStatLines(epic), [
    { text: "Attack Boost +6.0%", state: "fixed" },
    { text: "Crit Rate +3.0%", state: "fixed" },
    { text: "Crit DMG +3.0%", state: "fixed" },
  ]);
  assert.equal(commonKeyEffectLine(epic), "Boosts Phase damage by 5%.", "recorded secondary effect preferred over stats");
  assert.deepEqual(commonKeyStatLines(bare), []);
  assert.equal(commonKeyEffectLine(bare), undefined, "no stats/effect → nothing emitted");
});

test("unit: affinityLevelStatLines — Lv9 data-driven lines, Lv5/none-empty (independent of the key)", () => {
  const meta = buildCharacterMetaView({
    id: "qiongjiu",
    name: "Qiongjiu",
    affinityLevelStats: { 5: {}, 9: { atkPct: 0.05, hpPct: 0.05, defPct: 0.05 } },
  });
  assert.deepEqual(meta.affinityLevelStats, { 5: {}, 9: { atkPct: 0.05, hpPct: 0.05, defPct: 0.05 } }, "deep-copied from the engine data");
  assert.deepEqual(affinityLevelStatLines(meta, 9), ["ATK +5.0%", "HP +5.0%", "DEF +5.0%"], "Lv9 → the data-driven standalone lines");
  assert.deepEqual(affinityLevelStatLines(meta, 5), [], "Lv5 → no standalone bonus");
  assert.deepEqual(affinityLevelStatLines(meta, 4), [], "unrecorded level → nothing (no interpolation)");
  assert.deepEqual(affinityLevelStatLines({ id: "x", name: "X" }, 9), [], "no affinityLevelStats → no lines");
  assert.deepEqual(affinityLevelStatLines(meta, undefined), [], "no level → no lines");
});

test("unit: affinityLevels — the CHARACTER's recorded levels, ascending, data-driven (no key, no invention)", () => {
  const meta = buildCharacterMetaView({
    id: "qiongjiu",
    name: "Qiongjiu",
    affinityLevelStats: { 9: { atkPct: 0.05, hpPct: 0.05, defPct: 0.05 }, 5: {} },
  });
  assert.deepEqual(affinityLevels(meta), [5, 9], "ascending recorded levels (independent of the Affinity Key)");
  assert.deepEqual(affinityLevels({ id: "x", name: "X" }), [], "no affinity data → no levels (no invented ladder)");
  assert.deepEqual(affinityLevels(undefined), [], "no character → no levels");
});

test("unit: affinityLevelFlatLines — CUMULATIVE flat totals through the level (Lv5 → +115/+292/+108), nothing when unrecorded", () => {
  const meta = buildCharacterMetaView({
    id: "qiongjiu",
    name: "Qiongjiu",
    affinityFlatStats: { 2: { atk: 23, hp: 82 }, 3: { hp: 93, def: 32 }, 4: { atk: 40, def: 76 }, 5: { atk: 52, hp: 117 } },
  });
  assert.deepEqual(affinityLevelFlatLines(meta, 5), ["ATK +115", "HP +292", "DEF +108"], "Lv5 sums entries 1..5 (the engine's cumulative totals)");
  assert.deepEqual(affinityLevelFlatLines(meta, 2), ["ATK +23", "HP +82"], "Lv2 → only that level's recorded stats (DEF absent → no line)");
  assert.deepEqual(affinityLevelFlatLines(meta, 4), ["ATK +63", "HP +175", "DEF +108"], "Lv4 cumulative");
  assert.deepEqual(affinityLevelFlatLines(meta, 1), [], "Lv1 → nothing recorded");
  assert.deepEqual(affinityLevelFlatLines(meta, 9), ["ATK +115", "HP +292", "DEF +108"], "Lv6–9 add nothing → same as Lv5");
  assert.deepEqual(affinityLevelFlatLines({ id: "x", name: "X" }, 5), [], "no affinity flat data → no lines");
  assert.deepEqual(affinityLevelFlatLines(meta, undefined), [], "no level → no lines");
});

test("unit: affinity/expansion key lines come from the engine data (never invented)", () => {
  const meta = buildCharacterMetaView({
    id: "qiongjiu",
    name: "Qiongjiu",
    expansionKey: {
      id: "qiongjiu_exp_ruined_gem",
      name: "Ruined Gem",
      description: "Support Action damage type becomes Burn damage. Damage dealt to targets with Burn debuffs is increased by 15%.",
    },
    affinityKey: {
      id: "qiongjiu_affinity_warm_as_jade",
      name: "Warm as Jade",
      levels: { 9: { critDmg: 0.045, atk: 0.045, hp: 0.045 }, 5: { critDmg: 0.033, atk: 0.033, hp: 0.033 } },
      genericBonus: { atk: 0.03, hp: 0.03 },
    },
  });
  assert.deepEqual(
    meta.expansionKey,
    { id: "qiongjiu_exp_ruined_gem", name: "Ruined Gem", description: "Support Action damage type becomes Burn damage. Damage dealt to targets with Burn debuffs is increased by 15%." },
    "expansion description carried through",
  );
  assert.deepEqual(meta.affinityKey?.levels, { 5: { critDmg: 0.033, atk: 0.033, hp: 0.033 }, 9: { critDmg: 0.045, atk: 0.045, hp: 0.045 } }, "affinity levels deep-copied");
  assert.deepEqual(meta.affinityKey?.genericBonus, { atk: 0.03, hp: 0.03 });
  assert.deepEqual(
    affinityKeyStatLines(meta.affinityKey!),
    [
      "Lv5 · ATK +3.3%",
      "Lv5 · HP +3.3%",
      "Lv5 · Crit DMG +3.3%",
      "Lv9 · ATK +4.5%",
      "Lv9 · HP +4.5%",
      "Lv9 · Crit DMG +4.5%",
      "Foreign · ATK +3.0%",
      "Foreign · HP +3.0%",
    ],
    "preview: one stat per line, level-prefixed",
  );
  assert.deepEqual(
    affinityKeyStatLines(meta.affinityKey!, 5),
    ["ATK +3.3%", "HP +3.3%", "Crit DMG +3.3%"],
    "chosen level → ONLY that level's stats, each on its own line",
  );
  assert.deepEqual(
    affinityKeyStatLines(meta.affinityKey!, 9),
    ["ATK +4.5%", "HP +4.5%", "Crit DMG +4.5%"],
    "level 9 → only the level-9 stats, each on its own line",
  );
  assert.deepEqual(affinityKeyStatLines(meta.affinityKey!, 4), [], "unrecorded level → nothing (no interpolation)");
  assert.equal(expansionKeyEffectLine(meta.expansionKey), "Support Action damage type becomes Burn damage. Damage dealt to targets with Burn debuffs is increased by 15%.");
  assert.equal(expansionKeyEffectLine(undefined), undefined, "no expansion key → no effect line");
  assert.deepEqual(affinityKeyStatLines({ id: "x", name: "X" }), [], "no levels/generic → nothing emitted");
});

test("unit: effectCopyWithCalibration substitutes the calibration-dependent numbers inside Effect", () => {
  const template =
    "Increase damage dealt by {dmgs}. When gaining buffs, increase damage dealt by the next Support Action by {stacks} for {gains} time(s), stacking up to {maxes} times.";
  const gm = buildWeaponViews([
    {
      id: "jinshizou",
      name: "Golden Melody",
      rarity: "elite",
      atkLvl60: 369,
      calibrations: {
        1: { damageDealt: 0.1, charging: { perStackValue: 0.1, maxStacks: 2, stacksPerGain: 1 } },
        2: { damageDealt: 0.1, charging: { perStackValue: 0.15, maxStacks: 2, stacksPerGain: 1 } },
        3: { damageDealt: 0.15, charging: { perStackValue: 0.15, maxStacks: 3, stacksPerGain: 1 } },
        4: { damageDealt: 0.2, charging: { perStackValue: 0.15, maxStacks: 3, stacksPerGain: 1 } },
        5: { damageDealt: 0.2, charging: { perStackValue: 0.2, maxStacks: 4, stacksPerGain: 2 } },
        6: { damageDealt: 0.2, charging: { perStackValue: 0.2, maxStacks: 4, stacksPerGain: 2 } },
      },
    },
  ])[0];
  // No calibration selected → full C1–C6 slash-separated list (the authoritative values as one multi-level text).
  assert.deepEqual(
    effectCopyWithCalibration(gm, template, undefined),
    [
      { text: "Increase damage dealt by " },
      { text: "10%/10%/15%/20%/20%/20%", cal: true },
      { text: ". When gaining buffs, increase damage dealt by the next Support Action by " },
      { text: "10%/15%/15%/15%/20%/20%", cal: true },
      { text: " for " },
      { text: "1/1/1/1/2/2", cal: true },
      { text: " time(s), stacking up to " },
      { text: "2/2/3/3/4/4", cal: true },
      { text: " times." },
    ],
    "segments: only calibration-dependent runs are marked",
  );
  // C1 → only C1's values, no slashes anywhere; exactly 4 highlighted runs.
  const c1 = effectCopyWithCalibration(gm, template, 1);
  assert.equal(c1.filter((s) => s.cal).length, 4, "four calibration-dependent runs highlighted");
  const c1Joined = c1.map((s) => s.text).join("");
  assert.equal(
    c1Joined,
    "Increase damage dealt by 10%. When gaining buffs, increase damage dealt by the next Support Action by 10% for 1 time(s), stacking up to 2 times.",
  );
  assert.ok(!c1Joined.includes("/"), "no slash-separated list rendered for C1");
  // C6 → only C6's values.
  const c6 = effectCopyWithCalibration(gm, template, 6);
  assert.equal(
    c6.map((s) => s.text).join(""),
    "Increase damage dealt by 20%. When gaining buffs, increase damage dealt by the next Support Action by 20% for 2 time(s), stacking up to 4 times.",
  );
  assert.ok(!c6.map((s) => s.text).join("").includes("/"), "no slash-separated list rendered for C6");
  // No weapon → template rendered as-is (nothing invented), un-highlighted.
  assert.deepEqual(effectCopyWithCalibration(undefined, template, 1), [{ text: template }]);
});

test("unit: buildCommonKeyViews carries items + the engine 3-slot maximum", () => {
  const res = buildCommonKeyViews(
    [
      { id: "k1", name: "Character Key", characterScope: "qiongjiu" },
      { id: "k2", name: "Generic Key" },
    ],
    3,
  );
  assert.equal(res.maxCommonKeys, 3);
  assert.deepEqual(res.items, [
    { id: "k1", name: "Character Key", characterScope: "qiongjiu" },
    { id: "k2", name: "Generic Key" },
  ]);
});

test("unit: buildCommonKeySelectableStats maps the engine pool to labelled options (5.0% each)", () => {
  assert.deepEqual(
    buildCommonKeySelectableStats(["critRate", "critDmg", "hpPct", "defPct", "atkPct"]),
    [
      { kind: "critRate", label: "Crit Rate", value: 0.05 },
      { kind: "critDmg", label: "Crit DMG", value: 0.05 },
      { kind: "hpPct", label: "Health Boost", value: 0.05 },
      { kind: "defPct", label: "Defense Boost", value: 0.05 },
      { kind: "atkPct", label: "Attack Boost", value: 0.05 },
    ],
    "the five player-selectable kinds, each at 5.0%",
  );
  // The option list comes from the engine pool verbatim (empty pool → empty list, no guessing).
  assert.deepEqual(buildCommonKeySelectableStats([]), []);
  // buildCommonKeyViews carries the pool alongside the items.
  const res = buildCommonKeyViews([{ id: "k", name: "K" }], 3, ["critRate", "atkPct"]);
  assert.deepEqual(res.selectableStats.map((s) => s.kind), ["critRate", "atkPct"]);
  assert.deepEqual(buildCommonKeyViews([{ id: "k", name: "K" }], 3).selectableStats, [], "no pool supplied → no options");
});

test("unit: buildCharacterMetaView maps optional member/key metadata", () => {
  assert.deepEqual(
    buildCharacterMetaView({
      id: "qiongjiu",
      name: "Qiongjiu",
      mobility: 5,
      fixedKeys: [
        { id: "qiongjiu_fk1_concentration", name: "Concentration", description: "Gains 3 Confectance Index at the start of battle." },
        { id: "qiongjiu_fk3_targeted_training", name: "Targeted Training", description: "While in Support Mode, applies Defense Down II to the target for 1 turn before the allied unit's attack." },
      ],
      expansionKey: { id: "qiongjiu_ruined_gem", name: "Ruined Gem" },
      affinityKey: { id: "qiongjiu_warm_as_jade", name: "Warm as Jade" },
    }),
    {
      id: "qiongjiu",
      name: "Qiongjiu",
      mobility: 5,
      fixedKeys: [
        { id: "qiongjiu_fk1_concentration", name: "Concentration", number: 1, description: "Gains 3 Confectance Index at the start of battle." },
        { id: "qiongjiu_fk3_targeted_training", name: "Targeted Training", number: 3, description: "While in Support Mode, applies Defense Down II to the target for 1 turn before the allied unit's attack." },
      ],
      expansionKey: { id: "qiongjiu_ruined_gem", name: "Ruined Gem" },
      affinityKey: { id: "qiongjiu_warm_as_jade", name: "Warm as Jade" },
    },
  );
  assert.deepEqual(buildCharacterMetaView({ id: "x", name: "X" }), { id: "x", name: "X" }, "all optional fields absent → minimal view");
});

test("e2e: UI-facing weapon list matches the ENGINE registry (Golden Melody selectable, calibrations 1–6)", async () => {
  const w = await import(new URL("../../../dist/data/weapons.js", import.meta.url).href);
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY as {
    getWeapon: (id: string) => { name: string; atkLvl60: number; calibrations?: Record<number, unknown> } | undefined;
  };
  const views = buildWeaponViews((w as { WEAPONS: unknown[] }).WEAPONS as Parameters<typeof buildWeaponViews>[0]);
  const gm = views.find((v) => v.id === "jinshizou");
  assert.ok(gm, "Golden Melody is listable from the engine data (selectable for Qiongjiu)");
  assert.equal(gm.name, REGISTRY.getWeapon("jinshizou")?.name, "name matches the registry");
  assert.equal(gm.atkLvl60, REGISTRY.getWeapon("jinshizou")?.atkLvl60, "max-level ATK from the registry");
  assert.deepEqual(gm.calibrations, [1, 2, 3, 4, 5, 6], "C1–C6 calibration levels, engine-sourced, ascending");
  assert.equal(gm.ownerCharacterId, "qiongjiu", "signature owner surfaced from the engine data");
  for (const v of views) {
    assert.equal(REGISTRY.getWeapon(v.id)?.name, v.name, `weapon view ${v.id} matches the registry`);
  }
});

test("e2e: UI-facing Common Key list matches the ENGINE registry and the 3-slot maximum", async () => {
  const ck = await import(new URL("../../../dist/data/common-keys.js", import.meta.url).href);
  const st = await import(new URL("../../../dist/engine/state.js", import.meta.url).href);
  const reg = await import(new URL("../../../dist/data/registry.js", import.meta.url).href);
  const REGISTRY = (reg as { REGISTRY: unknown }).REGISTRY as { getCommonKey: (id: string) => { name: string } | undefined };
  const max = (st as { MAX_COMMON_KEYS: number }).MAX_COMMON_KEYS;
  const res = buildCommonKeyViews((ck as { COMMON_KEYS: unknown[] }).COMMON_KEYS as Parameters<typeof buildCommonKeyViews>[0], max);
  assert.equal(res.maxCommonKeys, 3, "engine 3 Common Key Slots maximum");
  assert.ok(res.items.some((k) => k.id === "qiongjiu_common_strategic_negotiation"), "Strategic Negotiation (Qiongjiu's common key) is listable");
  for (const k of res.items) {
    assert.equal(REGISTRY.getCommonKey(k.id)?.name, k.name, `common key view ${k.id} matches the registry`);
  }
});