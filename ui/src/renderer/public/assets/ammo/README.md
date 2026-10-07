# Ammo Type icons — delivered drop zone (2026)

The game's Ammo Type icons have been **delivered** (5 files, see below). They are **NOT yet wired**
into `ui/src/shared/assets.ts` (there is no `ammo` AssetKind/resolver yet), so nothing consumes
them — this directory holds the delivered artwork + the STRUCTURE/NAMING contract.

See `ui/docs/assets.md` §2/§3 for the global-category convention this mirrors, and
`assets/elements/` for the analogous (already-delivered + wired) element icons.

## Where each icon lives

One subdirectory per ammo id; the image file is named exactly the id
(mirrors the global weapons convention `assets/<category>/<id>/<id>.<ext>`):

```
assets/ammo/<ammoId>/<ammoId>.webp
```

## Delivered files (5)

| Path | Ammo Type | Notes |
|---|---|---|
| `assets/ammo/heavy_ammo/heavy_ammo.webp` | Heavy Ammo | engine `AmmoType` |
| `assets/ammo/medium_ammo/medium_ammo.webp` | Medium Ammo | engine `AmmoType` |
| `assets/ammo/light_ammo/light_ammo.webp` | Light Ammo | engine `AmmoType` |
| `assets/ammo/shotgun_ammo/shotgun_ammo.webp` | Shotgun Ammo | engine `AmmoType` |
| `assets/ammo/melee/melee.webp` | Melee | engine `AmmoType` |

Engine `AmmoType` union today (`src/model/types.ts`):
`heavy_ammo | medium_ammo | light_ammo | shotgun_ammo | melee` — the ids are 1:1 with the engine
(no presentation-only ids here, unlike `physical`/`omni` for elements).

## Notes

- Format: **lossless WebP** (8-bit RGBA, transparency preserved), matching the existing supplied
  assets. The originally delivered PNGs were converted 1:1 (pixels unchanged).
- When these icons are approved for use, a follow-up task adds an `ammo` kind + `ammoAsset()` to
  `ui/src/shared/assets.ts` and lists the files in `SUPPLIED_ASSET_FILES` (then uses them where the
  Ammo Type is shown — starting with the Setup screen's Ammo weaknesses section).

