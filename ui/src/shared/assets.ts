/**
 * RENDERER-SIDE ASSET MAPPING / REGISTRY (2026) — presentation-only infrastructure.
 *
 * Contract: ENTITY ID → ASSET PRESENTATION DATA.
 *
 * - Deterministic: the SAME (kind, entityId) always resolves to the SAME path.
 * - Engine-free: no engine imports here; the renderer stays engine-free. IDs are the
 *   stable engine IDs that already arrive through the UI-facing contracts; the known-ID
 *   sets below are a PRESENTATION-side inventory kept in sync with the engine data
 *   (src/data/*.ts). No mechanics, effects, stat math or engine definitions are duplicated.
 * - Ownership: character-owned assets live under `characters/<charId>/…`; GLOBAL assets
 *   (common keys, weapons) live under their own top-level directories and resolve WITHOUT
 *   a character id.
 * - Missing assets: `resolveAsset` returns `{ status: "unknown" }` for ids outside the
 *   known inventory, and `{ status: "defined", supplied: false }` while no physical image
 *   file is present (see SUPPLIED_ASSET_FILES). Consumers render a generic fallback for
 *   non-supplied assets and show an explicit missing state for unknown ids — never a
 *   broken `<img>` with an invented path.
 *
 * The build serves `ui/src/renderer/public/**` at the root path (electron-vite renderer
 * publicDir default) — i.e. `assets/…` URLs resolve to `ui/src/renderer/public/assets/…`.
 * See ui/docs/assets.md.
 */

export type AssetKind =
  | "portrait"
  | "fixed-key"
  | "common-key"
  | "affinity-key"
  | "expansion-key"
  | "skill"
  | "weapon";

export type AssetEntityId = string;

/** Presentation-side inventory of KNOWN entity ids (kept in sync with src/data/* — see ui/docs/assets.md). */
export const KNOWN_ENTITY_IDS: Record<AssetKind, ReadonlySet<AssetEntityId>> = {
  portrait: new Set(["qiongjiu"]),
  "fixed-key": new Set([
    "qiongjiu_fk1_concentration",
    "qiongjiu_fk2_efficient_planning",
    "qiongjiu_fk3_targeted_training",
    "qiongjiu_fk4_point_of_vulnerability",
    "qiongjiu_fk5_necessary_adjustments",
    "qiongjiu_fk6_steadiness",
  ]),
  "common-key": new Set(["qiongjiu_common_strategic_negotiation"]),
  "affinity-key": new Set(["qiongjiu_affinity_warm_as_jade"]),
  "expansion-key": new Set(["qiongjiu_exp_ruined_gem"]),
  skill: new Set([
    "qiongjiu_basic",
    "qiongjiu_common_rail",
    "qiongjiu_guide_to_victory",
    "qiongjiu_pressing_momentum",
    "qiongjiu_support",
    "qiongjiu_steady_plan",
  ]),
  weapon: new Set(["jinshizou"]),
};

/**
 * SINGLE SOURCE OF TRUTH for the ACTUALLY-SUPPLIED image files (2026): maps
 * `${kind}:${entityId}` → the real file path (relative to the public root, WITH extension).
 * Filled manually when artwork is placed under ui/src/renderer/public/assets (see
 * ui/docs/assets.md). The resolver reports `supplied: true` and the concrete `file` ONLY for
 * entries listed here — the system never assumes a file exists because a directory does.
 * Filenames may carry readable suffixes or hashes; the canonical entity id stays the key.
 */
export const SUPPLIED_ASSET_FILES: Readonly<Record<string, string>> = {
  "portrait:qiongjiu": "assets/characters/qiongjiu/portrait/qiongjiu-avatar.webp",
  "fixed-key:qiongjiu_fk1_concentration": "assets/characters/qiongjiu/fixed-keys/qiongjiu-fixedkey1-concentration.webp",
  "fixed-key:qiongjiu_fk2_efficient_planning": "assets/characters/qiongjiu/fixed-keys/qiongjiu-fixedkey2-efficient-planning.webp",
  "fixed-key:qiongjiu_fk3_targeted_training": "assets/characters/qiongjiu/fixed-keys/qiongjiu-fixedkey3-targeted-training.webp",
  "fixed-key:qiongjiu_fk4_point_of_vulnerability": "assets/characters/qiongjiu/fixed-keys/qiongjiu-fixedkey4-point-of-vulnerability.webp",
  "fixed-key:qiongjiu_fk5_necessary_adjustments": "assets/characters/qiongjiu/fixed-keys/qiongjiu-fixedkey5-necessary-adjustments.webp",
  "fixed-key:qiongjiu_fk6_steadiness": "assets/characters/qiongjiu/fixed-keys/qiongjiu-fixedkey6-steadiness.webp",
  "affinity-key:qiongjiu_affinity_warm_as_jade": "assets/characters/qiongjiu/affinity-keys/qiongjiu-affinitykey-warm-as-jade.webp",
  "expansion-key:qiongjiu_exp_ruined_gem": "assets/characters/qiongjiu/expansion-keys/qiongjiu-expansionkey-ruined-gem.webp",
  "skill:qiongjiu_basic": "assets/characters/qiongjiu/skills/qiongjiu-basic-fuse.webp",
  "skill:qiongjiu_steady_plan": "assets/characters/qiongjiu/skills/qiongjiu-passive-steady-plan.webp",
  "skill:qiongjiu_common_rail": "assets/characters/qiongjiu/skills/qiongjiu-sk1-common-rail.webp",
  "skill:qiongjiu_guide_to_victory": "assets/characters/qiongjiu/skills/qiongjiu-sk2-guide-to-victory.webp",
  "skill:qiongjiu_pressing_momentum": "assets/characters/qiongjiu/skills/qiongjiu-ultimate-pressing-the-momentum.webp",
  "common-key:qiongjiu_common_strategic_negotiation":
    "assets/common-keys/qiongjiu_common_strategic_negotiation/qiongjiu-common-key-strategic-negotiation.webp",
  "weapon:jinshizou": "assets/weapons/jinshizou/64111d2dacf250a428ca4639dece164e.webp",
};

/**
 * Owner-character prefix for character-owned entity ids. Current engine convention:
 * `<charId>_fk…`, `<charId>_affinity_…`, `<charId>_exp_…`, `<charId>_<skill…>`
 * → the character id is everything before the first `_`. Deterministic; documented in
 * ui/docs/assets.md (future ids with underscores in the character id need a review).
 */
export function characterIdOfOwnedEntity(entityId: AssetEntityId): AssetEntityId {
  const i = entityId.indexOf("_");
  return i === -1 ? entityId : entityId.slice(0, i);
}

/** Deterministic conventional path (no extension — see SUPPLIED_ASSET_PATHS). */
export function pathFor(kind: AssetKind, entityId: AssetEntityId): string {
  switch (kind) {
    case "portrait":
      return `assets/characters/${entityId}/portrait/${entityId}`;
    case "fixed-key": {
      const c = characterIdOfOwnedEntity(entityId);
      return `assets/characters/${c}/fixed-keys/${entityId}`;
    }
    case "affinity-key": {
      const c = characterIdOfOwnedEntity(entityId);
      return `assets/characters/${c}/affinity-keys/${entityId}`;
    }
    case "expansion-key": {
      const c = characterIdOfOwnedEntity(entityId);
      return `assets/characters/${c}/expansion-keys/${entityId}`;
    }
    case "skill": {
      const c = characterIdOfOwnedEntity(entityId);
      return `assets/characters/${c}/skills/${entityId}`;
    }
    case "common-key":
      // GLOBAL: never under a character directory; no character id involved.
      return `assets/common-keys/${entityId}/${entityId}`;
    case "weapon":
      // GLOBAL: signature ownership is engine data; the ASSET lives under the weapon itself.
      return `assets/weapons/${entityId}/${entityId}`;
  }
}

export interface DefinedAssetRef {
  status: "defined";
  kind: AssetKind;
  entityId: AssetEntityId;
  /** Stable URL path relative to the public root (no extension) — the conventional entity-anchored path. */
  path: string;
  /** TRUE only when a physical file for this entity is listed in SUPPLIED_ASSET_FILES. */
  supplied: boolean;
  /** The ACTUAL supplied file path (with extension) — present exactly when `supplied` is true. */
  file?: string;
}

export interface UnknownAssetRef {
  status: "unknown";
  kind: AssetKind;
  entityId: AssetEntityId;
}

export type AssetRefResult = DefinedAssetRef | UnknownAssetRef;

export function resolveAsset(kind: AssetKind, entityId: AssetEntityId): AssetRefResult {
  if (!KNOWN_ENTITY_IDS[kind].has(entityId)) {
    return { status: "unknown", kind, entityId };
  }
  const path = pathFor(kind, entityId);
  const file = SUPPLIED_ASSET_FILES[`${kind}:${entityId}`];
  return file !== undefined
    ? { status: "defined", kind, entityId, path, supplied: true, file }
    : { status: "defined", kind, entityId, path, supplied: false };
}

// Convenience resolvers by entity type (the future UI asks by ENGINE ID, never by hardcoded path).
export const portraitAsset = (characterId: AssetEntityId): AssetRefResult => resolveAsset("portrait", characterId);
export const characterAsset = portraitAsset;
export const fixedKeyAsset = (fixedKeyId: AssetEntityId): AssetRefResult => resolveAsset("fixed-key", fixedKeyId);
export const commonKeyAsset = (commonKeyId: AssetEntityId): AssetRefResult => resolveAsset("common-key", commonKeyId);
export const affinityKeyAsset = (affinityKeyId: AssetEntityId): AssetRefResult => resolveAsset("affinity-key", affinityKeyId);
export const expansionKeyAsset = (expansionKeyId: AssetEntityId): AssetRefResult => resolveAsset("expansion-key", expansionKeyId);
export const skillAsset = (skillId: AssetEntityId): AssetRefResult => resolveAsset("skill", skillId);
export const weaponAsset = (weaponId: AssetEntityId): AssetRefResult => resolveAsset("weapon", weaponId);

// ---------------------------------------------------------------------------
// RENDER SPEC (2026) — the single presentation decision for an asset ref, kept PURE
// so it is unit-testable without a browser. The component layer calls this and renders.
// ---------------------------------------------------------------------------
export type AssetRenderSpec =
  | { mode: "img"; src: string }
  | { mode: "fallback" }
  | { mode: "missing" };

/**
 * Map a resolved asset to a render instruction:
 * - supplied file → `{ mode: "img", src: "/<file>" }` (public-root URL; dev HTTP correct.
 *   Packaged file:// URL handling is a separate build decision, see ui/docs/assets.md).
 * - known but not supplied → `{ mode: "fallback" }` (generic initial-letter tile).
 * - unknown id → `{ mode: "missing" }` (explicit missing state — never a broken <img>).
 */
export function assetRenderSpec(ref: AssetRefResult): AssetRenderSpec {
  if (ref.status === "defined" && ref.supplied && ref.file !== undefined) {
    return { mode: "img", src: `/${ref.file}` };
  }
  if (ref.status === "defined") return { mode: "fallback" };
  return { mode: "missing" };
}