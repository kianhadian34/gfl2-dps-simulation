# Renderer Assets — Developer Guide (2026)

English-only project documentation. This document defines the **asset infrastructure only**.
No UI component renders images yet; future UI tasks consume the mapping described here, one
area at a time.

## 1. Where assets live

Physical files live under the **renderer public root**, which electron-vite serves at the root
path (its `publicDir` default is `ui/src/renderer/public`):

```
ui/src/renderer/public/assets/
```

A file at `ui/src/renderer/public/assets/weapons/jinshizou/…` is served at
`/assets/weapons/jinshizou/…`. Do NOT reference assets outside this tree.

## 2. Directory structure and ownership

Ownership is the core rule: **character-owned** assets live under a character directory;
**global** assets (Common Keys, Weapons) live in their own top-level directories and are
addressable WITHOUT a character id.

```
assets/
├── characters/
│   └── qiongjiu/
│       ├── portrait/            qiongjiu.png            (character portrait / artwork)
│       ├── fixed-keys/          qiongjiu_fk1_concentration.png … qiongjiu_fk6_steadiness.png
│       ├── affinity-keys/       qiongjiu_affinity_warm_as_jade.png
│       ├── expansion-keys/      qiongjiu_exp_ruined_gem.png
│       └── skills/              qiongjiu_basic.png, qiongjiu_common_rail.png,
│                                qiongjiu_guide_to_victory.png, qiongjiu_pressing_momentum.png,
│                                qiongjiu_support.png, qiongjiu_steady_plan.png
├── common-keys/                 (GLOBAL — never under a character)
│   └── qiongjiu_common_strategic_negotiation/…
├── weapons/                     (GLOBAL — never under a character)
│   └── jinshizou/…
├── elements/                    (GLOBAL — Phase/Element icons; delivered 2026, wired via elementAsset)
│   ├── physical/physical.webp   (Physical / phase-less — engine represents this as element === null)
│   ├── burn/burn.webp
│   ├── hydro/hydro.webp
│   ├── corrosion/corrosion.webp
│   ├── electric/electric.webp
│   ├── freeze/freeze.webp
│   └── omni/omni.webp           (all elements — presentation-only id)
├── ammo/                        (GLOBAL — Ammo Type icons; delivered 2026, wired via ammoAsset)
│   ├── heavy_ammo/heavy_ammo.webp
│   ├── medium_ammo/medium_ammo.webp
│   ├── light_ammo/light_ammo.webp
│   ├── shotgun_ammo/shotgun_ammo.webp
│   └── melee/melee.webp
└── remolder-categories/         (GLOBAL — Pattern Remolder category icons; delivered 2026, wired via remolderCategoryAsset)
    ├── bulwark/bulwark.webp
    ├── vanguard/vanguard.webp
    ├── support/support.webp
    └── sentinel/sentinel.webp
```

Wrong placements (do NOT do these):
- `characters/qiongjiu/weapons/…` — a weapon asset must be addressable by anyone who equips it.
- `characters/qiongjiu/common-keys/…` — a Common Key asset must not depend on an equipping character.

Future global categories (statuses, buffs, …) belong in their own top-level
directories under `assets/`; the current architecture does not prevent adding them later.
Do not create empty directories for not-yet-needed categories. **Notes (2026): `elements/` and
`ammo/` are WIRED global categories — the 7 Phase/Element icons resolve via `elementAsset()` and
the 5 Ammo Type icons via `ammoAsset()`; both are consumed by the Setup screen (Phase weaknesses /
Ammo weaknesses sections — see §3).** **`remolder-categories/` is a WIRED global category (2026):
the 4 Remolder category icons resolve via `remolderCategoryAsset()` and are consumed by the Setup
screen's Pattern Remolder section (category group headers + the category-totals row). Its ids are
1:1 with the engine `RemolderCategory` (`bulwark | vanguard | support | sentinel`). See the manifest
`assets/remolder-categories/README.md`.**

## 3. Naming convention

- The **canonical identifier is the existing engine entity ID** — never rename engine IDs for
  filenames, never add display aliases in the mapping.
- A filename may carry a readable suffix after the stable engine id (e.g.
  `qiongjiu_fk1_concentration.png`), but the engine id must remain recognizable.
- Player-facing display names and asset filenames are separate concepts: display names keep
  coming from the authoritative UI-facing data (`sim:listCharacters` etc.), not from filenames.
- Extensions: use any standard web format (png/jpg/webp/avif). The MAPPING never hardcodes an
  extension — the stable id-anchored path is the contract; actual files are tracked in
  `SUPPLIED_ASSET_PATHS` (see §6).

Known engine ids (kept in sync with `src/data/*`):

| Category | Engine ids |
|---|---|
| Character | `qiongjiu` |
| Fixed Keys | `qiongjiu_fk1_concentration` … `qiongjiu_fk6_steadiness` |
| Common Key | `qiongjiu_common_strategic_negotiation` |
| Affinity Key | `qiongjiu_affinity_warm_as_jade` |
| Expansion Key | `qiongjiu_exp_ruined_gem` |
| Skills | `qiongjiu_basic` · `qiongjiu_common_rail` · `qiongjiu_guide_to_victory` · `qiongjiu_pressing_momentum` · `qiongjiu_support` · `qiongjiu_steady_plan` |
| Weapon | `jinshizou` (player-facing name: **Golden Melody** — the id is internal only) |
| Elements (delivered + wired) | `physical` · `burn` · `hydro` · `corrosion` · `electric` · `freeze` · `omni` (engine `Element` = `burn`/`hydro`/`freeze`/`electric`/`corrosion`; `physical`/`omni` are presentation-only ids) |
| Ammo Types (delivered + wired) | `heavy_ammo` · `medium_ammo` · `light_ammo` · `shotgun_ammo` · `melee` (engine `AmmoType`, 1:1 ids) |

## 4. The asset mapping / registry

`ui/src/shared/assets.ts` is the single, engine-free registry. It maps
**ENTITY ID → ASSET PRESENTATION DATA** and does NOT duplicate mechanics, effects, stat math
or engine definitions.

API (request by engine id — never by hardcoded path):

```ts
characterAsset(characterId)     // alias: portraitAsset(characterId)
fixedKeyAsset(fixedKeyId)
commonKeyAsset(commonKeyId)     // global — no character id
affinityKeyAsset(affinityKeyId)
expansionKeyAsset(expansionKeyId)
skillAsset(skillId)
weaponAsset(weaponId)           // global — no character id
elementAsset(elementId)         // global — engine Element or the presentation ids `physical`/`omni`
ammoAsset(ammoId)               // global — engine AmmoType (1:1)
remolderCategoryAsset(categoryId) // global — engine RemolderCategory (1:1)
```

Every resolver returns `{ status, kind, entityId, path, supplied }` (or `status: "unknown"`):

- `path` is the deterministic public URL path (no extension), e.g.
  `assets/weapons/jinshizou/jinshizou`.
- `supplied` is `true` only when the file is physically present AND listed in
  `SUPPLIED_ASSET_FILES`.

For a given `(kind, entityId)` the path is always the same (deterministic), and `pathFor` is
exported for callers that only need the string.

## 5. How to add a new entity's asset

**New character** (`characters/<charId>/…`): add the character id to `KNOWN_ENTITY_IDS.portrait`
(kind: `"portrait"`) and, if it has owned keys/skills, to the corresponding sets and the id
tables in §3. Character-owned entities follow the `<charId>_…` prefix convention;
`characterIdOfOwnedEntity` derives the owner from the first `_` segment.

**Fixed Key asset**: place the file at `assets/characters/<charId>/fixed-keys/<fixedKeyId>.<ext>`
and add the id to `KNOWN_ENTITY_IDS["fixed-key"]`.

**Common Key asset**: `assets/common-keys/<commonKeyId>/…` (global) + the id in
`KNOWN_ENTITY_IDS["common-key"]`.

**Affinity Key asset**: `assets/characters/<charId>/affinity-keys/<affinityKeyId>.<ext>` +
`KNOWN_ENTITY_IDS["affinity-key"]`.

**Expansion Key asset**: `assets/characters/<charId>/expansion-keys/<expansionKeyId>.<ext>` +
`KNOWN_ENTITY_IDS["expansion-key"]`.

**Skill asset**: `assets/characters/<charId>/skills/<skillId>.<ext>` + `KNOWN_ENTITY_IDS.skill`.

**Weapon asset**: `assets/weapons/<weaponId>/…` (global) + `KNOWN_ENTITY_IDS.weapon`.

After placing the physical file, ALSO add its exact relative path (with extension) to `SUPPLIED_ASSET_FILES` so
`supplied` becomes `true`.

**Element asset (delivered + wired 2026):** path `assets/elements/<elementId>/<elementId>.webp`
(one file per element id; all 7 delivered — see the manifest `assets/elements/README.md`).
Resolved by `elementAsset(elementId)`; consumed by the Setup screen's **Phase weaknesses** section
(an icon next to each element). `physical` and `omni` are presentation-side ids; the engine
`Element` union is `burn | hydro | freeze | electric | corrosion`.

**Ammo Type asset (delivered + wired 2026):** path `assets/ammo/<ammoId>/<ammoId>.webp`
(one file per ammo id; all 5 delivered — see the manifest `assets/ammo/README.md`). Resolved by
`ammoAsset(ammoId)`; consumed by the Setup screen's **Ammo weaknesses** section (an icon next to
each ammo type). The 5 ids are 1:1 with the engine `AmmoType`
(`heavy_ammo | medium_ammo | light_ammo | shotgun_ammo | melee`).

**Pattern Remolder category asset (delivered + wired 2026):** path
`assets/remolder-categories/<categoryId>/<categoryId>.webp` (one file per category id; all 4
delivered — see the manifest `assets/remolder-categories/README.md`). Resolved by
`remolderCategoryAsset(categoryId)`; consumed by the Setup screen's **Pattern Remolder** section
(an icon in each category group header and in the category-totals row). The 4 ids are 1:1 with the
engine `RemolderCategory` union (`bulwark | vanguard | support | sentinel`) — no presentation-only
ids.

## 6. Missing assets / fallback

The system never invents artwork and never pretends a file exists:

- Unknown entity id → `{ status: "unknown" }`: the caller renders an explicit
  "asset missing" state (no broken `<img>`).
- Known entity, file not placed → `{ status: "defined", supplied: false }`: the caller renders
  a generic fallback (e.g. an initial-letter tile or no image).
- Current state: **33 known entities; 32 have supplied files** (a `.webp` per entity — all but
  `qiongjiu_support`), listed in the
  `SUPPLIED_ASSET_FILES` inventory keyed by `<kind>:<entityId>`. Assets added later simply get a
  new inventory entry when their physical file is placed.

## 7. Constraints

- The renderer stays engine-free: `assets.ts` must not import engine modules.
- No UI changes ship in this infrastructure task; actual image rendering is integrated per UI
  area in separate tasks.
- Keep `KNOWN_ENTITY_IDS` in sync with engine data changes (documented in the file header).