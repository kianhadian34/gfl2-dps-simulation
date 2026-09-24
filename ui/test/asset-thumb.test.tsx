import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetThumb } from "../src/renderer/app/setup/AssetThumb.js";
import { weaponAsset, skillAsset, resolveAsset, SUPPLIED_ASSET_FILES } from "../src/shared/assets.js";

/**
 * REGRESSION (2026): "Cannot read properties of undefined (reading 'status')" at UI startup.
 *
 * ROOT CAUSE: `AssetThumb` previously took the resolver result via the prop named `ref`.
 * In React, `ref` is a RESERVED prop — for function components it is stripped from `props`
 * (only `forwardRef` receives it separately), so `props.ref` was `undefined` at render time
 * and `assetRenderSpec(undefined).status` crashed. The resolver/inventory were never at fault.
 *
 * FIX: the prop is now `asset` (never `ref`). These tests pin both the rendering contract and
 * the exact anti-regression rule (no `ref=` call sites, no `props.ref` reads).
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("regression: the component must NOT use the reserved React prop 'ref'", () => {
  // React strips `ref` from function-component props → the resolver result would be undefined
  // and assetRenderSpec would read `.status` on it. The component must take `asset` instead.
  const src = readFileSync(srcFile("../../src/renderer/app/setup/AssetThumb.tsx"), "utf8");
  assert.ok(src.includes("{ asset: AssetRefResult"), "props carry the asset via the non-reserved name");
  assert.ok(!src.includes("props.ref"), "never reads props.ref");
  assert.ok(!src.includes("ref: AssetRefResult"), "the props type never declares `ref`");
});

test("regression: no call site passes the resolver result through `ref=`", () => {
  const screen = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(!screen.includes("<AssetThumb ref="), "all AssetThumb call sites use asset= (a ref= call would strip the prop and crash)");
});

test("supplied asset renders the real .webp <img> (no crash, real path)", () => {
  const html = renderToStaticMarkup(<AssetThumb asset={weaponAsset("jinshizou")} alt="Golden Melody" size={22} />);
  const expected = SUPPLIED_ASSET_FILES["weapon:jinshizou"];
  assert.ok(html.includes(expected), `src is the actual supplied weapon file (got: ${html.slice(0, 120)})`);
  assert.ok(html.includes('class="asset-thumb"'));
});

test("known-but-unsupplied asset renders the generic fallback (no <img>, no crash)", () => {
  const html = renderToStaticMarkup(<AssetThumb asset={skillAsset("qiongjiu_support")} alt="Support" size={22} />);
  assert.ok(html.includes("asset-placeholder"), "fallback tile rendered");
  assert.ok(!html.includes("<img"), "no broken image path");
});

test("unknown entity renders the explicit missing state (no <img>, no crash)", () => {
  const html = renderToStaticMarkup(<AssetThumb asset={resolveAsset("weapon", "definitely_not_a_weapon")} alt="Mystery" size={22} />);
  assert.ok(html.includes("asset-missing"), "explicit missing state rendered");
  assert.ok(!html.includes("<img"), "never a broken <img>");
});