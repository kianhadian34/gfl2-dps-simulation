import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeaponViews, buildCommonKeyViews, buildCharacterMetaView, effectCopyWithCalibration, commonKeyStatLines, commonKeyEffectLine } from "../src/shared/lists.js";

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
        stats: { atkPct: 0.05, critRate: 0.05, critDmg: 0.05, outOfTurnDmg: 0.07 },
      },
      { id: "generic_epic", name: "Generic Epic", stats: { atkPct: 0.06, critRate: 0.03, critDmg: 0.03 }, secondaryEffect: { description: "Boosts Phase damage by 5%." } },
      { id: "bare", name: "Bare Key" },
    ],
    3,
  );
  const [sn, epic, bare] = res.items;
  assert.deepEqual(
    sn.stats,
    { atkPct: 0.05, critRate: 0.05, critDmg: 0.05, outOfTurnDmg: 0.07 },
    "stats deep-copied from the engine data",
  );
  assert.deepEqual(commonKeyStatLines(sn), ["Attack Boost +5.0%", "Crit Rate +5.0%", "Crit DMG +5.0%"], "3 stats listed");
  assert.equal(commonKeyEffectLine(sn), "+7.0% damage dealt outside the unit's own turn", "out-of-turn damage shown as the additional effect");
  assert.deepEqual(commonKeyStatLines(epic), ["Attack Boost +6.0%", "Crit Rate +3.0%", "Crit DMG +3.0%"]);
  assert.equal(commonKeyEffectLine(epic), "Boosts Phase damage by 5%.", "recorded secondary effect preferred over stats");
  assert.deepEqual(commonKeyStatLines(bare), []);
  assert.equal(commonKeyEffectLine(bare), undefined, "no stats/effect → nothing emitted");
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