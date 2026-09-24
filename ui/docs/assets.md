# Renderer Assets â€” Developer Guide (2026)

English-only project documentation. This document defines the **asset infrastructure only**.
No UI component renders images yet; future UI tasks consume the mapping described here, one
area at a time.

## 1. Where assets live

Physical files live under the **renderer public root**, which electron-vite serves at the root
path (its `publicDir` default is `ui/src/renderer/public`):

```
ui/src/renderer/public/assets/
```

A file at `ui/src/renderer/public/assets/weapons/jinshizou/â€¦` is served at
`/assets/weapons/jinshizou/â€¦`. Do NOT reference assets outside this tree.

## 2. Directory structure and ownership

Ownership is the core rule: **character-owned** assets live under a character directory;
**global** assets (Common Keys, Weapons) live in their own top-level directories and are
addressable WITHOUT a character id.

```
assets/
â”œâ”€â”€ characters/
â”‚   â””â”€â”€ qiongjiu/
â”‚       â”œâ”€â”€ portrait/            qiongjiu.png            (character portrait / artwork)
â”‚       â”œâ”€â”€ fixed-keys/          qiongjiu_fk1_concentration.png â€¦ qiongjiu_fk6_steadiness.png
â”‚       â”œâ”€â”€ affinity-keys/       qiongjiu_affinity_warm_as_jade.png
â”‚       â”œâ”€â”€ expansion-keys/      qiongjiu_exp_ruined_gem.png
â”‚       â””â”€â”€ skills/              qiongjiu_basic.png, qiongjiu_common_rail.png,
â”‚                                qiongjiu_guide_to_victory.png, qiongjiu_pressing_momentum.png,
â”‚                                qiongjiu_support.png, qiongjiu_steady_plan.png
â”œâ”€â”€ common-keys/                 (GLOBAL â€” never under a character)
â”‚   â””â”€â”€ qiongjiu_common_strategic_negotiation/â€¦ 
â””â”€â”€ weapons/                     (GLOBAL â€” never under a character)
    â””â”€â”€ jinshizou/â€¦
```

Wrong placements (do NOT do these):
- `characters/qiongjiu/weapons/â€¦` â€” a weapon asset must be addressable by anyone who equips it.
- `characters/qiongjiu/common-keys/â€¦` â€” a Common Key asset must not depend on an equipping character.

Future global categories (statuses, buffs, ammo, elements, â€¦) belong in their own top-level
directories under `assets/`; the current architecture does not prevent adding them later.
Do not create empty directories for not-yet-needed categories.

## 3. Naming convention

- The **canonical identifier is the existing engine entity ID** â€” never rename engine IDs for
  filenames, never add display aliases in the mapping.
- A filename may carry a readable suffix after the stable engine id (e.g.
  `qiongjiu_fk1_concentration.png`), but the engine id must remain recognizable.
- Player-facing display names and asset filenames are separate concepts: display names keep
  coming from the authoritative UI-facing data (`sim:listCharacters` etc.), not from filenames.
- Extensions: use any standard web format (png/jpg/webp/avif). The MAPPING never hardcodes an
  extension â€” the stable id-anchored path is the contract; actual files are tracked in
  `SUPPLIED_ASSET_PATHS` (see Â§6).

Known engine ids (kept in sync with `src/data/*`):

| Category | Engine ids |
|---|---|
| Character | `qiongjiu` |
| Fixed Keys | `qiongjiu_fk1_concentration` â€¦ `qiongjiu_fk6_steadiness` |
| Common Key | `qiongjiu_common_strategic_negotiation` |
| Affinity Key | `qiongjiu_affinity_warm_as_jade` |
| Expansion Key | `qiongjiu_exp_ruined_gem` |
| Skills | `qiongjiu_basic` Â· `qiongjiu_common_rail` Â· `qiongjiu_guide_to_victory` Â· `qiongjiu_pressing_momentum` Â· `qiongjiu_support` Â· `qiongjiu_steady_plan` |
| Weapon | `jinshizou` (player-facing name: **Golden Melody** — the id is internal only) |

## 4. The asset mapping / registry

`ui/src/shared/assets.ts` is the single, engine-free registry. It maps
**ENTITY ID â†’ ASSET PRESENTATION DATA** and does NOT duplicate mechanics, effects, stat math
or engine definitions.

API (request by engine id â€” never by hardcoded path):

```ts
characterAsset(characterId)     // alias: portraitAsset(characterId)
fixedKeyAsset(fixedKeyId)
commonKeyAsset(commonKeyId)     // global â€” no character id
affinityKeyAsset(affinityKeyId)
expansionKeyAsset(expansionKeyId)
skillAsset(skillId)
weaponAsset(weaponId)           // global â€” no character id
```

Every resolver returns `{ status, kind, entityId, path, supplied }` (or `status: "unknown"`):

- `path` is the deterministic public URL path (no extension), e.g.
  `assets/weapons/jinshizou/jinshizou`.
- `supplied` is `true` only when the file is physically present AND listed in
  `SUPPLIED_ASSET_FILES`.

For a given `(kind, entityId)` the path is always the same (deterministic), and `pathFor` is
exported for callers that only need the string.

## 5. How to add a new entity's asset

**New character** (`characters/<charId>/â€¦`): add the character id to `KNOWN_ENTITY_IDS.portrait`
(kind: `"portrait"`) and, if it has owned keys/skills, to the corresponding sets and the id
tables in Â§3. Character-owned entities follow the `<charId>_â€¦` prefix convention;
`characterIdOfOwnedEntity` derives the owner from the first `_` segment.

**Fixed Key asset**: place the file at `assets/characters/<charId>/fixed-keys/<fixedKeyId>.<ext>`
and add the id to `KNOWN_ENTITY_IDS["fixed-key"]`.

**Common Key asset**: `assets/common-keys/<commonKeyId>/â€¦` (global) + the id in
`KNOWN_ENTITY_IDS["common-key"]`.

**Affinity Key asset**: `assets/characters/<charId>/affinity-keys/<affinityKeyId>.<ext>` +
`KNOWN_ENTITY_IDS["affinity-key"]`.

**Expansion Key asset**: `assets/characters/<charId>/expansion-keys/<expansionKeyId>.<ext>` +
`KNOWN_ENTITY_IDS["expansion-key"]`.

**Skill asset**: `assets/characters/<charId>/skills/<skillId>.<ext>` + `KNOWN_ENTITY_IDS.skill`.

**Weapon asset**: `assets/weapons/<weaponId>/â€¦` (global) + `KNOWN_ENTITY_IDS.weapon`.

After placing the physical file, ALSO add its exact relative path (with extension) to `SUPPLIED_ASSET_FILES` so
`supplied` becomes `true`.

## 6. Missing assets / fallback

The system never invents artwork and never pretends a file exists:

- Unknown entity id â†’ `{ status: "unknown" }`: the caller renders an explicit
  "asset missing" state (no broken `<img>`).
- Known entity, file not placed â†’ `{ status: "defined", supplied: false }`: the caller renders
  a generic fallback (e.g. an initial-letter tile or no image).
- Current state: **all 17 known assets have supplied files** (a `.webp` per entity), listed in the
  `SUPPLIED_ASSET_FILES` inventory keyed by `<kind>:<entityId>`. Assets added later simply get a
  new inventory entry when their physical file is placed.

## 7. Constraints

- The renderer stays engine-free: `assets.ts` must not import engine modules.
- No UI changes ship in this infrastructure task; actual image rendering is integrated per UI
  area in separate tasks.
- Keep `KNOWN_ENTITY_IDS` in sync with engine data changes (documented in the file header).