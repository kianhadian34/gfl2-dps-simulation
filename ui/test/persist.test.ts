import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SETUP_STORAGE_KEY, loadSetup, saveSetup, clearSetup, type SetupPersistence } from "../src/shared/persist.js";
import { DEFAULT_SETUP, mergeFreshCharacters, type SetupState } from "../src/shared/setup.js";

/**
 * SETUP PERSISTENCE (2026) — cache the user's equipment/rotation so a simulation run doesn't
 * force re-entering everything: the setup is restored on app start and saved on every change.
 * Storage is injected → these tests run in node with an in-memory store.
 */

function memoryStorage(): SetupPersistence & { _map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    _map: map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const srcFile = (rel: string): string => join(dirname(fileURLToPath(import.meta.url)), rel);

test("persist: loaded setup == saved setup (round-trip)", () => {
  const storage = memoryStorage();
  const setup: SetupState = {
    ...DEFAULT_SETUP,
    turns: 9,
    seed: 42,
    characters: [
      { id: "qiongjiu", name: "Qiongjiu", selected: true, equipment: { weaponId: "jinshizou", calibrationLevel: 3 } },
      { id: "other", name: "Other", selected: false },
    ],
  };
  saveSetup(storage, setup);
  assert.ok(storage._map.has(SETUP_STORAGE_KEY), "saved under the versioned key");
  assert.deepEqual(loadSetup(storage), setup, "exact configuration restored");
});

test("persist: SetupScreen merge keeps the restored selection/equipment (no wipe on remount)", () => {
  const existing = [
    { id: "qiongjiu", name: "Qiongjiu", selected: true, mobility: 4, equipment: { weaponId: "jinshizou", calibrationLevel: 3, commonKeyIds: ["ck1"] } },
    { id: "old", name: "Old Doll", selected: true },
  ];
  const fresh = [
    { id: "qiongjiu", name: "Qiongjiu", mobility: 5 },
    { id: "brand_new", name: "New Doll" },
  ];
  const merged = mergeFreshCharacters(existing, fresh);
  assert.deepEqual(merged[0], {
    id: "qiongjiu",
    name: "Qiongjiu",
    selected: true,
    mobility: 5,
    equipment: { weaponId: "jinshizou", calibrationLevel: 3, commonKeyIds: ["ck1"] },
  }, "user's selection + equipment survive the engine-list remount");
  assert.deepEqual(merged[1], { id: "brand_new", name: "New Doll", selected: false }, "new engine characters join unselected");
});

test("persist: corrupt/mismatched payloads and missing storage → null (caller falls back to DEFAULT_SETUP)", () => {
  const storage = memoryStorage();
  assert.equal(loadSetup(storage), null, "nothing stored → null");
  storage.setItem(SETUP_STORAGE_KEY, "{not json");
  assert.equal(loadSetup(storage), null, "corrupt JSON → null");
  storage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ turns: 7, seed: 1 }));
  assert.equal(loadSetup(storage), null, "wrong shape → null");
  storage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ ...DEFAULT_SETUP, characters: [{ id: 5 }] }));
  assert.equal(loadSetup(storage), null, "invalid characters → null");
});

test("persist: clearSetup forgets the cached setup", () => {
  const storage = memoryStorage();
  saveSetup(storage, DEFAULT_SETUP);
  assert.ok(storage._map.has(SETUP_STORAGE_KEY));
  clearSetup(storage);
  assert.equal(storage._map.has(SETUP_STORAGE_KEY), false);
});

test("persist: App wires load-on-mount and save-on-change so restarts restore the configuration", () => {
  const s = readFileSync(srcFile("../../src/renderer/app/App.tsx"), "utf8");
  assert.ok(s.includes("loadSetup(window.localStorage) ?? DEFAULT_SETUP"), "startup restores the cached setup (fallback DEFAULT_SETUP)");
  assert.ok(s.includes("new SetupStore(initial)"), "the restored setup seeds the session store");
  assert.ok(s.includes("saveSetup(window.localStorage, next)") && s.includes("onChange={commitSetup}"), "every setup change is persisted");
});