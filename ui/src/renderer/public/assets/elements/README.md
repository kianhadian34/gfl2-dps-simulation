# Phase / Element icons — delivered drop zone (2026)

The game's Phase/Element icons have been **delivered** (7 files, see below). They are **NOT yet
wired** into `ui/src/shared/assets.ts` (there is no `element` AssetKind/resolver yet), so nothing
consumes them — this directory holds the delivered artwork + the STRUCTURE/NAMING contract.

See `ui/docs/assets.md` §2/§3 for the global-category convention this mirrors.

## Where each icon lives

One subdirectory per element id; the image file is named exactly the id
(mirrors the global weapons convention `assets/<category>/<id>/<id>.<ext>`):

```
assets/elements/<elementId>/<elementId>.webp
```

## Delivered files (7)

| Path | Element | Notes |
|---|---|---|
| `assets/elements/physical/physical.webp` | Physical / phase-less | engine represents physical as `element === null`; `physical` is a presentation-side id. Source art is a rounded-square badge (50×50); the others are 52×52 circle badges |
| `assets/elements/burn/burn.webp` | Burn | engine `Element` |
| `assets/elements/hydro/hydro.webp` | Hydro | engine `Element` |
| `assets/elements/corrosion/corrosion.webp` | Corrosion | engine `Element` |
| `assets/elements/electric/electric.webp` | Electric | engine `Element` |
| `assets/elements/freeze/freeze.webp` | Freeze | engine `Element` |
| `assets/elements/omni/omni.webp` | Omni (all elements) | presentation-side id (no engine `Element` value) |

Engine `Element` union today (`src/model/types.ts`):
`burn | hydro | freeze | electric | corrosion`. `physical` and `omni` are PRESENTATION-side
ids only — they are not engine `Element` values.

## Notes

- Format: **lossless WebP** (8-bit RGBA, transparency preserved), matching the existing supplied
  assets' `.webp`. The originally delivered PNGs were converted 1:1 (pixels unchanged).
- When these icons are approved for use, a follow-up task adds an `element` kind +
  `elementAsset()` to `ui/src/shared/assets.ts` and lists the files in `SUPPLIED_ASSET_FILES`.

