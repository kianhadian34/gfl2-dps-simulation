import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeaponViews, buildCommonKeyViews, buildCharacterMetaView } from "../src/shared/lists.js";

/**
 * ENGINE-SOURCED LIST CONTRACT (2026 — plumbing; no UI controls yet).
 *
 * `ui/src/shared/lists.ts` is ENGINE-FREE: it shapes plain engine-shaped data into the IPC
 * view payloads (built in Electron main from src/data/weapons.ts, src/data/common-keys.ts
 * and the character registry). These tests pin the mapping and — via the engine dist build —
 * prove the UI-facing lists match the real registry (identical ids/names/numbers).
 */

test("unit: buildWeaponViews maps engine weapon shapes into ascending calibration numbers", () => {
  const views = buildWeaponViews([
    { id: "w1", name: "Weapon One", rarity: "elite", atkLvl60: 369, ownerCharacterId: "qiongjiu", calibrations: { 2: { value: 0.1 }, 1: { value: 0 }, 6: { value: 0.2 } } },
    { id: "w2", name: "Weapon Two", rarity: "rare", atkLvl60: 120 }, // no calibrations / no owner
  ]);
  assert.deepEqual(views[0], { id: "w1", name: "Weapon One", rarity: "elite", atkLvl60: 369, ownerCharacterId: "qiongjiu", calibrations: [1, 2, 6] });
  assert.deepEqual(views[1], { id: "w2", name: "Weapon Two", rarity: "rare", atkLvl60: 120, calibrations: [] }, "absent owner/calibrations stay absent");
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
        { id: "qiongjiu_fk1_concentration", name: "Concentration (凝神)", description: "Gains 3 Confectance Index at the start of battle." },
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
        { id: "qiongjiu_fk1_concentration", name: "Concentration (凝神)", number: 1, description: "Gains 3 Confectance Index at the start of battle." },
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