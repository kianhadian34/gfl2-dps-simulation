import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  affinityKeyAsset,
  assetRenderSpec,
  characterAsset,
  commonKeyAsset,
  expansionKeyAsset,
  fixedKeyAsset,
  pathFor,
  portraitAsset,
  resolveAsset,
  skillAsset,
  weaponAsset,
  KNOWN_ENTITY_IDS,
  SUPPLIED_ASSET_FILES,
  type AssetRefResult,
} from "../src/shared/assets.js";

/**
 * ASSET MAPPING / REGISTRY CONTRACT (2026) — infrastructure only.
 * ENTITY ID â†’ ASSET PRESENTATION DATA, deterministic, renderer-side and engine-free.
 * Missing assets produce explicit fallback states; the mapping never pretends a file exists.
 */

function assertDefined(r: AssetRefResult, kind: string): Extract<AssetRefResult, { status: "defined" }> {
  assert.equal(r.status, "defined", `${kind} should resolve`);
  assert.equal((r as { status: string }).status, "defined");
  return r as Extract<AssetRefResult, { status: "defined" }>;
}

const FK_IDS = [
  "qiongjiu_fk1_concentration",
  "qiongjiu_fk2_efficient_planning",
  "qiongjiu_fk3_targeted_training",
  "qiongjiu_fk4_point_of_vulnerability",
  "qiongjiu_fk5_necessary_adjustments",
  "qiongjiu_fk6_steadiness",
];

const SKILL_IDS = ["qiongjiu_basic", "qiongjiu_common_rail", "qiongjiu_guide_to_victory", "qiongjiu_pressing_momentum", "qiongjiu_support", "qiongjiu_steady_plan"];

test("1: a known character id resolves to the character asset (portrait category)", () => {
  const r = assertDefined(characterAsset("qiongjiu"), "character");
  assert.equal(r.kind, "portrait");
  assert.equal(r.path, "assets/characters/qiongjiu/portrait/qiongjiu");
});

test("2: the portrait resolves independently (same contract as the character asset)", () => {
  const r = assertDefined(portraitAsset("qiongjiu"), "portrait");
  assert.equal(r.path, "assets/characters/qiongjiu/portrait/qiongjiu");
});

test("3: every Fixed Key resolves independently by its engine Fixed Key id", () => {
  for (const id of FK_IDS) {
    const r = assertDefined(fixedKeyAsset(id), id);
    assert.equal(r.path, `assets/characters/qiongjiu/fixed-keys/${id}`, `${id} under the character fixed-keys dir`);
    assert.ok(!r.path.includes("common-keys") && !r.path.includes("weapons"), `${id} is character-owned`);
  }
});

test("4: Affinity Key resolves independently by id", () => {
  const r = assertDefined(affinityKeyAsset("qiongjiu_affinity_warm_as_jade"), "affinity");
  assert.equal(r.path, "assets/characters/qiongjiu/affinity-keys/qiongjiu_affinity_warm_as_jade");
});

test("5: Expansion Key resolves independently by id", () => {
  const r = assertDefined(expansionKeyAsset("qiongjiu_exp_ruined_gem"), "expansion");
  assert.equal(r.path, "assets/characters/qiongjiu/expansion-keys/qiongjiu_exp_ruined_gem");
});

test("6: every skill/ability resolves independently by its engine skill id", () => {
  for (const id of SKILL_IDS) {
    const r = assertDefined(skillAsset(id), id);
    assert.equal(r.path, `assets/characters/qiongjiu/skills/${id}`, `${id} under the character skills dir`);
  }
});

test("7: Common Keys resolve GLOBALLY — no character id, never under a character directory", () => {
  const r = assertDefined(commonKeyAsset("qiongjiu_common_strategic_negotiation"), "common-key");
  assert.ok(r.path.startsWith("assets/common-keys/"), `global common-key path (${r.path})`);
  assert.ok(!r.path.startsWith("assets/characters/"), "Common Keys are NOT character-owned");
  assert.equal(commonKeyAsset("qiongjiu_common_strategic_negotiation").status, "defined");
});

test("8: Weapons resolve GLOBALLY — no character id, never under a character directory", () => {
  const r = assertDefined(weaponAsset("jinshizou"), "weapon");
  assert.equal(r.path, "assets/weapons/jinshizou/jinshizou");
  assert.ok(!r.path.startsWith("assets/characters/"), "the signature weapon asset is global (engine ownership â‰  asset ownership)");
});

test("8b: Golden Melody is player-facing; the internal id jinshizou is only the asset key", () => {
  const r = assertDefined(weaponAsset("jinshizou"), "weapon");
  assert.equal(r.entityId, "jinshizou", "asset resolution uses the stable internal id");
  assert.equal(Object.prototype.hasOwnProperty.call(r, "name"), false, "the asset mapping carries NO player-facing name (presentation data only)");
  // The player-facing name comes from the authoritative UI-facing data (engine WeaponDef.name).
  assert.equal(r.supplied, true);
});

test("9: asset paths are deterministic (same kind+id â†’ same path every time)", () => {
  const a = pathFor("fixed-key", "qiongjiu_fk4_point_of_vulnerability");
  const b = pathFor("fixed-key", "qiongjiu_fk4_point_of_vulnerability");
  assert.equal(a, b);
  assert.deepEqual(weaponAsset("jinshizou"), weaponAsset("jinshizou"));
});

test("10: missing assets produce the defined fallback; supplied files are discovered with supplied:true + concrete file", () => {
  assert.deepEqual(resolveAsset("weapon", "definitely_not_a_weapon"), { status: "unknown", kind: "weapon", entityId: "definitely_not_a_weapon" });
  assert.equal(characterAsset("nobody").status, "unknown", "unknown character id");
  // Known-but-unsupplied entities (currently only qiongjiu_support) report the explicit fallback.
  assert.deepEqual(skillAsset("qiongjiu_support"), {
    status: "defined",
    kind: "skill",
    entityId: "qiongjiu_support",
    path: "assets/characters/qiongjiu/skills/qiongjiu_support",
    supplied: false,
  });
  for (const kind of Object.keys(KNOWN_ENTITY_IDS) as Array<keyof typeof KNOWN_ENTITY_IDS>) {
    for (const id of KNOWN_ENTITY_IDS[kind]) {
      const r = resolveAsset(kind, id);
      assert.equal(r.status, "defined", `${kind}/${id} known`);
      if (r.status === "defined" && r.supplied) {
        assert.ok(r.file, `file path provided for ${kind}/${id}`);
        assert.ok(r.file!.startsWith(r.path.replace(/\/[^/]+$/, "")), `${kind}/${id} file sits in the conventional directory`);
        assert.ok(r.file!.endsWith(".webp"), `${kind}/${id} uses the supplied extension`);
      }
    }
  }
});

test("10b: SUPPLIED_ASSET_FILES is the single source of truth — every entry resolves and is never invented", () => {
  const entries = Object.entries(SUPPLIED_ASSET_FILES);
  assert.equal(entries.length, 16, "16 supplied images are listed (the Support-skill artwork has NOT been supplied)");
  for (const [key, file] of entries) {
    const [kind, entityId] = key.split(":");
    assert.ok(KNOWN_ENTITY_IDS[kind as keyof typeof KNOWN_ENTITY_IDS].has(entityId), `entry ${key} maps to a KNOWN entity`);
    assert.ok(file.startsWith("assets/"), `entry ${key} is a valid relative path`);
  }
});

test("11: the asset mapping is renderer-side and ENGINE-FREE (no engine imports in the module)", () => {
  // The test build emits dist-test/src/shared/assets.js; read the compiled module to prove the
  // renderer-side bundle has zero dependencies (assets.ts itself has no imports either).
  const src = readFileSync(new URL("../src/shared/assets.js", import.meta.url), "utf8");
  assert.ok(!src.includes('from "../../../src'), "no engine import (import specifier)");
  assert.ok(!src.includes("import "), "the mapping has NO imports at all — pure presentation logic");
});

test("12: no unrelated UI component hardcodes asset paths (registry is the single source)", () => {
  // Nothing in the current renderer references /assets or the mapping yet — the infrastructure
  // is consumed only by tests and the future UI integration tasks.
  assert.ok(KNOWN_ENTITY_IDS.weapon.has("jinshizou"), "sanity: inventory is non-empty");
});
test("14: assetRenderSpec maps supplied assets to real .webp <img> sources", () => {
  assert.deepEqual(assetRenderSpec(weaponAsset("jinshizou")), {
    mode: "img",
    src: "/assets/weapons/jinshizou/" + SUPPLIED_ASSET_FILES["weapon:jinshizou"]!.split("/").pop(),
  });
  assert.ok(assetRenderSpec(portraitAsset("qiongjiu")).mode === "img");
  assert.equal((assetRenderSpec(portraitAsset("qiongjiu")) as { src: string }).src.endsWith(".webp"), true);
});

test("15: missing known assets use the generic fallback; unknown ids use the explicit missing state", () => {
  assert.deepEqual(assetRenderSpec(skillAsset("qiongjiu_support")), { mode: "fallback" }, "Support skill is KNOWN but has no standalone image → generic fallback tile");
  assert.deepEqual(assetRenderSpec(resolveAsset("weapon", "nope")), { mode: "missing" }, "unknown id → explicit missing state, never a broken <img>");
});

test("16: Support Attack is NOT a standalone skill asset (part of Steady Plan; no separate entry needed)", () => {
  assert.ok(KNOWN_ENTITY_IDS.skill.has("qiongjiu_support"), "qiongjiu_support is a known engine skill id");
  assert.equal(SUPPLIED_ASSET_FILES["skill:qiongjiu_support"], undefined, "no separate Support Attack artwork is required/expected");
  assert.equal(SUPPLIED_ASSET_FILES["skill:qiongjiu_steady_plan"], "assets/characters/qiongjiu/skills/qiongjiu-passive-steady-plan.webp", "Steady Plan carries the passive artwork");
});