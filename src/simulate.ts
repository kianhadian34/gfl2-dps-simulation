import type { Scenario } from "./model/types.js";
import type { SimulationResult } from "./model/runtime.js";
import type { Registry } from "./data/registry.js";
import { REGISTRY } from "./data/registry.js";
import { simulate as runSimulation } from "./engine/simulation.js";

/**
 * Simulation API facade (docs/architecture.md §2): scenario in, results out.
 * Holds no game knowledge of its own.
 */
export function simulateScenario(scenario: Scenario, registry: Registry = REGISTRY): SimulationResult {
  return runSimulation(scenario, registry);
}

export type { Scenario, CharacterDef, SkillDef, StatusDef, DummyConfig, ConfigOverrides } from "./model/types.js";
export type { SimulationResult, LogEvent } from "./model/runtime.js";