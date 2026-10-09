# Pattern Remolder category icons — delivered (2026)

The game shows an **icon per Pattern Remolder category**. The 4 icons are **delivered and wired**.
They resolve via `remolderCategoryAsset()` in `ui/src/shared/assets.ts` and are consumed by the
Setup screen's **Pattern Remolder** section (an icon in each category group header and in the
category-totals row).

See `ui/docs/assets.md` §2/§3 for the global-category convention this mirrors, and
`assets/elements/` / `assets/ammo/` for the analogous icon sets.

## Where each icon lives

One subdirectory per category id; the image file is named exactly the id
(mirrors the global convention `assets/<category>/<id>/<id>.<ext>`):

```
assets/remolder-categories/<categoryId>/<categoryId>.webp
```

## Delivered files (4)

| Path | Category | Notes |
|---|---|---|
| `assets/remolder-categories/bulwark/bulwark.webp` | Bulwark | blue glyph badge, 44×44 |
| `assets/remolder-categories/vanguard/vanguard.webp` | Vanguard | purple glyph badge, 44×44 |
| `assets/remolder-categories/support/support.webp` | Support | green glyph badge, 44×44 |
| `assets/remolder-categories/sentinel/sentinel.webp` | Sentinel | red glyph badge, 44×44 |

The 4 ids are **1:1 with the engine `RemolderCategory` union** (`src/model/types.ts`):

```ts
export type RemolderCategory = "bulwark" | "vanguard" | "support" | "sentinel";
```

There are **no presentation-only ids** here (unlike `elements/`, where `physical`/`omni` are
presentation-side) — every icon maps to a real engine category.

## Delivery notes

- **Source:** delivered as PNGs named `ImagoFactor_<Category>.png` (one per category directory).
  Converted **1:1 to lossless WebP** (8-bit RGBA, transparency preserved) and renamed to the
  canonical `<categoryId>.webp`. Pixels are unchanged — verified by decoding both the source PNG and
  the converted WebP to raw RGBA and comparing SHA-256 (identical for all 4).
- **Sizing:** 44×44 (the source art's native size; the element icons are 52×52 and the physical
  element badge 50×50, so these are slightly smaller and render at 16–18px in the UI).

## Wiring (done 2026)

1. Converted the delivered PNGs to lossless WebP at the paths above.
2. `ui/src/shared/assets.ts`: `AssetKind` member `"remolder-category"`; the 4 ids in
   `KNOWN_ENTITY_IDS`; a `pathFor` case; the 4 `SUPPLIED_ASSET_FILES` entries; the
   `remolderCategoryAsset(id)` convenience resolver.
3. Consumed in the Setup screen's Pattern Remolder section (category group headers + the
   category-totals row). The category ids arrive from the engine over IPC
   (`sim:listRemolderBuffs` → `RemolderCatalogView.categories`).
4. Covered by `ui/test/assets.test.ts` (tests 23–25: global resolution, unknown-id missing state,
   1:1 with the engine category union).

When these icons are changed/replaced, update the file + the `SUPPLIED_ASSET_FILES` entry (the
resolver + Setup-screen wiring already exist).
