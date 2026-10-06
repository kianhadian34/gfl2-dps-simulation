import { test } from "node:test";
import assert from "node:assert/strict";
import { createState } from "../engine/state.js";
import { QIONGJIU } from "../data/qiongjiu.js";
import { REGISTRY } from "../data/registry.js";
import { customRegistry } from "./helpers.js";
import { ATTACHMENT_STAT_DEFS } from "../data/attachments.js";
import type { AttachmentConfig, CharacterDef, DummyConfig, Scenario } from "../model/types.js";

/**
 * WEAPON ATTACHMENT STAT FOLDING (2026) — integration (vertical slice for IN-GAME VALIDATION).
 *
 * Proves the confirmed attachment configuration folds into the EXISTING panel/stat buckets — no new
 * bucket, no damage-formula change. Attachment SET EFFECTS are NOT implemented (out of scope).
 *
 * Two bases:
 *  - CONTROLLED fixture (applyDispatchStats:false + pinned base) → observes the attachment delta
 *    alone, independent of Qiongjiu's live panel (the project's fixture contract).
 *  - LIVE Qiongjiu → the real "all permanent systems" panel, for the in-game delta comparison.
 */
const dummy: DummyConfig = { id: "training_dummy", name: "Training Dummy", hp: 999999999, defense: 5000, stability: 65, weaknesses: [], phase: null, cover: "none" };

/** CONTROLLED fixture: base pinned, permanent bundle OFF, so ONLY the attachment config is added. */
function ctrl(attachments: AttachmentConfig | undefined): Scenario {
  return {
    version: 1,
    seed: 7,
    turns: 1,
    team: [{ characterId: "qiongjiu", applyDispatchStats: false, baseStatOverrides: { atk: 1000, hp: 2000, def: 500 }, rotation: ["basic"], equippedFixedKeys: [], ...(attachments !== undefined ? { attachments } : {}) }],
    dummy,
  };
}
const ctrlUnit = (attachments: AttachmentConfig | undefined) => createState(ctrl(attachments), REGISTRY, new Set()).units[0];

/** LIVE Qiongjiu (production semantics): the full permanent stack + the attachment config. */
function live(attachments: AttachmentConfig | undefined) {
  return createState(
    { version: 1, seed: 7, turns: 1, team: [{ characterId: "qiongjiu", rotation: ["basic"], equippedFixedKeys: [], ...(attachments !== undefined ? { attachments } : {}) }], dummy },
    REGISTRY,
    new Set(),
  ).units[0];
}

// CONTROLLED: each stat kind folds into the SAME bucket as the corresponding permanent source ----

test("controlled: flat attachment stats fold into the flat bucket (base + flat, no %)", () => {
  const b = ctrlUnit(undefined);
  assert.equal(b.panelAtk, 1000);
  assert.equal(b.hp, 2000);
  assert.equal(b.defStat, 500);

  // Attack + Health + Defense (all flat) → summed into the flat bucket.
  const u = ctrlUnit({ muzzle: ["attack"], sight: ["health"], foregrip: ["defense"] });
  assert.equal(u.panelAtk, 1000 + ATTACHMENT_STAT_DEFS.attack.value, "flat ATK");
  assert.equal(u.hp, 2000 + ATTACHMENT_STAT_DEFS.health.value, "flat HP");
  assert.equal(u.defStat, 500 + ATTACHMENT_STAT_DEFS.defense.value, "flat DEF");
});

test("controlled: percentage attachment stats fold into the % buckets (after the flat sum)", () => {
  const u = ctrlUnit({ muzzle: ["attackBoost"], sight: ["healthBoost"], foregrip: ["defenseBoost"] });
  assert.equal(u.panelAtk, Math.ceil(1000 * (1 + 0.114)), "ATK% via the proven Final Stat formula");
  assert.equal(u.hp, Math.ceil(2000 * (1 + 0.114)), "HP%");
  assert.equal(u.defStat, Math.ceil(500 * (1 + 0.114)), "DEF%");
});

test("controlled: flat is added BEFORE the percentage multiply (one panel path)", () => {
  // flat ATK +72 AND ATK% +11.4% → ceil((1000 + 72) × 1.114), NOT ceil(1000 × 1.114) + 72.
  const u = ctrlUnit({ muzzle: ["attack", "attackBoost"] });
  assert.equal(u.panelAtk, Math.ceil((1000 + 72) * (1 + 0.114)));
  assert.equal(u.panelAtk, 1195, "ceil(1072 × 1.114) = 1195");
});

test("controlled: Crit Rate and Crit DMG fold into the existing panel crit stats (additive)", () => {
  const b = ctrlUnit(undefined);
  assert.equal(b.critRate, QIONGJIU.base.critRate);
  assert.equal(b.critDmg, QIONGJIU.base.critDmg);
  const u = ctrlUnit({ muzzle: ["critDamage"], sight: ["critRate"] });
  assert.equal(u.critRate, QIONGJIU.base.critRate + 0.15, "Crit Rate +15% additive on the panel");
  assert.equal(u.critDmg, QIONGJIU.base.critDmg + 0.15, "Crit DMG +15% additive on the panel");
});

// Empty slots + multi-slot aggregation -------------------------------------------------------

test("empty slots / absent config contribute nothing (panel identical to no attachments)", () => {
  const b = ctrlUnit(undefined);
  for (const cfg of [undefined, {} as AttachmentConfig, { muzzle: [] } as AttachmentConfig]) {
    const u = ctrlUnit(cfg);
    assert.equal(u.panelAtk, b.panelAtk, `ATK unchanged for ${JSON.stringify(cfg)}`);
    assert.equal(u.hp, b.hp);
    assert.equal(u.defStat, b.defStat);
    assert.equal(u.critRate, b.critRate);
    assert.equal(u.critDmg, b.critDmg);
  }
});

test("multiple slots aggregate: a full 4-slot loadout sums every stat into its bucket", () => {
  const u = ctrlUnit({
    muzzle: ["attack", "attackBoost", "critRate", "critDamage"],
    sight: ["attack", "health", "defense"],
    foregrip: ["attackBoost", "healthBoost", "defenseBoost"],
    underbarrel: ["attack", "health"],
  });
  // Flat: ATK 72×3 (muzzle+sight+underbarrel), HP 162×2 (sight+underbarrel), DEF 48 (sight).
  const flatAtk = 72 * 3;
  const flatHp = 162 * 2;
  const flatDef = 48;
  // %: ATK 11.4%×2 (muzzle+foregrip), HP 11.4% (foregrip), DEF 11.4% (foregrip).
  const pctAtk = 0.114 * 2;
  const pctHp = 0.114;
  const pctDef = 0.114;
  assert.equal(u.panelAtk, Math.ceil((1000 + flatAtk) * (1 + pctAtk)));
  assert.equal(u.hp, Math.ceil((2000 + flatHp) * (1 + pctHp)));
  assert.equal(u.defStat, Math.ceil((500 + flatDef) * (1 + pctDef)));
  assert.equal(u.critRate, QIONGJIU.base.critRate + 0.15);
  assert.equal(u.critDmg, QIONGJIU.base.critDmg + 0.15);
});

// Controlled fixture gating: applyDispatchStats:false excludes attachments -------------------

test("attachments are EXPLICIT EQUIPMENT (not fixture-gated): a controlled fixture observes them; absent = no effect", () => {
  // Unlike the permanent global sources (Dispatch/Remolder/NH/Affinity), attachments are explicit
  // equipment like `weaponId`/`commonKeyIds` — a controlled fixture that SETS them observes them,
  // and a fixture that omits them is unaffected (so no existing math fixture changes).
  const on = ctrlUnit({ muzzle: ["attack", "attackBoost"], sight: ["critRate"] });
  assert.equal(on.panelAtk, Math.ceil((1000 + 72) * (1 + 0.114)), "fixture observes its attachment config");
  assert.equal(on.critRate, QIONGJIU.base.critRate + 0.15, "fixture observes attachment crit rate");

  const off = ctrlUnit(undefined);
  assert.equal(off.panelAtk, 1000, "absent attachments → the existing fixture base is unchanged");
  assert.equal(off.critRate, QIONGJIU.base.critRate);
});

// Live Qiongjiu: the real panel delta (for the in-game comparison) ----------------------------

test("live Qiongjiu: attachment stats fold onto the live permanent panel (in-game delta)", () => {
  const b = live(undefined);
  assert.equal(b.panelAtk, 1939, "baseline live panel (unchanged by this feature)");
  assert.equal(b.hp, 4162);
  assert.equal(b.defStat, 1315);

  // A single Muzzle flat Attack (+72) is added to the live flat basis, then × the live ATK%.
  const u = live({ muzzle: ["attack"] });
  // live flat ATK basis = 802 + 231 + 245 + 196 + 115 = 1589; +72 = 1661; × 1.22 → ceil.
  assert.equal(u.panelAtk, Math.ceil((1589 + 72) * 1.22), "ceil((1589 + 72) × 1.22)");
  assert.equal(u.panelAtk - b.panelAtk, 88, "the +72 flat ATK delta through the live 1.22 multiplier");

  // Attack Boost (%) adds into the live ATK% bucket (1.22 → 1.334).
  const p = live({ muzzle: ["attackBoost"] });
  assert.equal(p.panelAtk, Math.ceil(1589 * (1.22 + 0.114)), "ATK% joins the live percentage bucket");
});

// Invalid configuration is rejected at the scenario boundary ---------------------------------

test("invalid attachment configuration is rejected at createState (per-slot max / uniqueness / Muzzle-only critDamage)", () => {
  const reg = customRegistry({});
  const bad = (attachments: AttachmentConfig, msg: RegExp) => {
    assert.throws(
      () => createState(ctrl(attachments), reg, new Set()),
      (e: Error) => msg.test(e.message),
      `expected rejection matching ${msg}`,
    );
  };
  bad({ sight: ["critDamage"] } as AttachmentConfig, /critDamage.*not allowed/);
  bad({ muzzle: ["attack", "attackBoost", "health", "healthBoost", "critDamage"] } as AttachmentConfig, /too many stats/);
  bad({ sight: ["attack", "attack"] } as AttachmentConfig, /duplicate stat kind/);
});

// Crit DMG contributes to the existing critDmg bucket (explicit) ------------------------------

test("Crit Damage contributes to the existing critDmg bucket (feeds 1 + critDmg, no new bucket)", () => {
  const b = live(undefined);
  const u = live({ muzzle: ["critDamage"] });
  // The panel critDmg is exactly the baseline + the attachment value (0.15) — the existing crit
  // chain derives 1 + critDmg, so nothing attachment-specific is introduced.
  assert.equal(u.critDmg, b.critDmg + 0.15, "critDmg +15% on the panel (existing bucket)");
});
