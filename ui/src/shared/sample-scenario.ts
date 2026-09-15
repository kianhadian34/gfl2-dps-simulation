import type { ScenarioView } from "./engine-types.js";

/**
 * Bundled sample scenario (a valid engine scenario) so the three windows open populated.
 * Only registered characters may appear (the engine registry is authoritative); this
 * sample uses Qiongjiu alone. Developer scaffolding for the debug client — the engine
 * contract is untouched.
 */
export const sampleScenario: ScenarioView = {
  version: 1,
  seed: 7,
  turns: 2,
  team: [{ characterId: "qiongjiu", rotation: ["basic", "basic"], equippedFixedKeys: [] }],
  dummy: {
    id: "training_dummy",
    name: "Training Dummy",
    hp: 999999999,
    defense: 5000,
    stability: 6,
    weaknesses: ["burn"],
    phase: null,
    cover: "none",
  },
  grid: {
    size: 15,
    units: [{ unitId: "qiongjiu", coord: { x: 4, y: 7 } }],
    boss: { center: { x: 7, y: 7 }, footprintSide: 3 },
    highTiles: [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    ladders: [{ ground: { x: 1, y: 3 }, high: { x: 1, y: 2 } }],
    blockedTiles: [{ coord: { x: 6, y: 2 } }, { coord: { x: 7, y: 2 } }, { coord: { x: 8, y: 2 } }],
    moves: [{ unitId: "qiongjiu", round: 1, to: { x: 5, y: 7 } }, { unitId: "qiongjiu", round: 2, to: { x: 5, y: 6 } }],
  },
};