import { assetRenderSpec } from "../../../shared/assets.js";
import type { AssetRefResult } from "../../../shared/assets.js";

/**
 * AssetThumb — the ONLY renderer component that turns an asset ref into pixels.
 * Pure presentation: it consumes a resolver result (built from a stable engine id) and
 * renders exactly what `assetRenderSpec` decides — supplied image, generic fallback tile,
 * or explicit missing state. No paths are hardcoded here; no engine imports.
 *
 * IMPORTANT: the prop is named `asset`, NEVER `ref` — `ref` is a RESERVED React prop that is
 * stripped from a function component's props, which would make the resolver result undefined
 * and crash `assetRenderSpec` on `.status` (the 2026 regression). The React contract test
 * in ui/test/asset-thumb.test.tsx pins this.
 *
 * `fit` controls how the artwork fills its box: `cover` (default) crops to fill — fine for
 * square art (Fixed Keys, portrait, small key icons); `contain` shows the ENTIRE image with
 * its natural aspect ratio (no crop, no stretch) — pass this for wide/tall artwork such as
 * weapon images (see the weapon slot/picker).
 */
export function AssetThumb(props: { asset: AssetRefResult; alt: string; size?: number; fit?: "cover" | "contain"; width?: number; height?: number }): JSX.Element {
  const { asset, alt, size = 26, fit = "cover", width, height } = props;
  const spec = assetRenderSpec(asset);
  const style = { width: width ?? size, height: height ?? size, objectFit: fit } as const;
  if (spec.mode === "img") {
    return <img className="asset-thumb" src={spec.src} alt={alt} title={alt} style={style} loading="lazy" />;
  }
  if (spec.mode === "fallback") {
    const initial = (alt.trim().charAt(0) || "?").toUpperCase();
    return (
      <span className="asset-thumb asset-placeholder" style={style} aria-label={alt} title={alt}>
        {initial}
      </span>
    );
  }
  return (
    <span className="asset-thumb asset-missing" style={style} aria-label={`${alt}: asset missing`} title={`${alt}: asset missing`}>
      ?
    </span>
  );
}