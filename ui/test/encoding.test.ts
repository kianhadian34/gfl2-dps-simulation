import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * UI ENCODING REGRESSION (2026) — mojibake in the renderer sources.
 *
 * ROOT CAUSE: `SetupScreen.tsx` (and `assets.test.ts`) had been rewritten through a
 * PowerShell Get-Content/Set-Content round-trip that decoded the UTF-8 file as the system
 * ANSI codepage, re-encoding the text as literal mojibake — the em dash (UTF-8 `E2 80 94`)
 * became three Latin-1/CP1252 characters, and the multiplication sign similarly degraded.
 * `index.html` was verified to be CORRECT UTF-8 (`U+2014`); its apparent garble was a
 * console-only artifact (the repository tooling console does not decode UTF-8).
 *
 * FIX: the affected sources were restored to valid UTF-8 punctuation (no runtime workaround).
 * These tests pin the representative strings and reject any future mojibake token.
 */

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);
const MOJIBAKE = /\u00E2\u20AC|\u00C3[\u2014\u00D7]/;

test("encoding: representative UI strings are correct UTF-8 in SetupScreen.tsx", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.ok(s.includes("GFL2: Exilium DPS Simulator \u2014 Simulation Setup"), "em dash — in the toolbar");
  assert.ok(s.includes("Training Dummy \u2014 stationary, no cover (MVP)."), "em dash — in the target hint");
  assert.ok(s.includes("Load scenario JSON\u2026"), "ellipsis …");
  assert.ok(s.includes("Turns (1\u20137)"), "en dash – range");
  assert.ok(s.includes("Enable 15\u00D715 grid"), "multiplication sign ×");
  assert.ok(s.includes("\u2014 skips the normal equipment requirements"), "em dash — in the DEBUG MODE hint");
});

test("encoding: no mojibake tokens remain in the renderer sources", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/setup/SetupScreen.tsx"), "utf8");
  assert.equal(MOJIBAKE.test(s), false, "SetupScreen.tsx is clean UTF-8");
  const html = readFileSync(srcFile("../../src/renderer/app/index.html"), "utf8");
  assert.ok(html.includes("GFL2: Exilium DPS Simulator \u2014 Debugger"), "index.html title kept its real em dash");
  assert.equal(MOJIBAKE.test(html), false, "index.html is clean UTF-8");
});

test("encoding: the asset test sources are also clean UTF-8 (no mojibake in test fixtures/comments)", () => {
  const t = readFileSync(srcFile("../../test/assets.test.ts"), "utf8");
  assert.equal(MOJIBAKE.test(t), false);
});