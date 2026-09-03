import { readFileSync } from "node:fs";
import { REGISTRY } from "./data/registry.js";
import { simulateScenario } from "./simulate.js";
import type { Scenario } from "./model/types.js";
import type { SimulationResult } from "./model/runtime.js";

const USAGE = `Usage:
  gfl2sim simulate <scenario.json> [--log]

Prints total damage, average per round/action, per-character and per-source
breakdowns, plus warnings for every UNVERIFIED value used (docs/research.md §4).
`;

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function printResults(r: SimulationResult, withLog: boolean): void {
  console.log("Simulation Results");
  console.log("────────────────────────");
  console.log(`Seed: ${r.seed}  |  Turns: ${r.turns}`);
  console.log(`Total Damage: ${fmt(Math.round(r.totals.damage))}`);
  console.log(`Average / Round: ${fmt(Math.round(r.totals.damagePerRound))}`);
  console.log(`Average / Action: ${fmt(Math.round(r.totals.damagePerAction))}`);
  console.log(`Actions: ${r.totals.actions}`);
  console.log();
  console.log("Damage by Character");
  console.log("────────────────────────");
  for (const c of r.byCharacter) {
    console.log(`${c.id.padEnd(12)} ${fmt(Math.round(c.damage)).padStart(12)}  (${c.actions} actions)`);
  }
  console.log();
  console.log("Damage by Source");
  console.log("────────────────────────");
  for (const s of r.bySource) {
    console.log(`${s.source.padEnd(10)} ${fmt(Math.round(s.damage)).padStart(12)}  (${s.actions} actions)`);
  }
  if (r.warnings.length > 0) {
    console.log();
    console.log("Warnings (UNVERIFIED values used — see docs/research.md §4)");
    console.log("────────────────────────");
    for (const w of r.warnings) console.log(`- ${w}`);
  }
  if (withLog) {
    console.log();
    console.log("Combat Log");
    console.log("────────────────────────");
    for (const e of r.log) {
      const crit = e.critical ? " CRIT" : "";
      const sup = e.supportAttack ? " [support]" : "";
      console.log(
        `R${e.round} T${e.turn} ${e.unit}.${e.action} → ${e.target}: ${e.finalDamage} dmg${crit}${sup}` +
          (e.statusesApplied.length > 0 ? ` | +${e.statusesApplied.join(",")}` : "") +
          (e.confectance ? ` | confectance ${e.confectance.before}→${e.confectance.after}` : ""),
      );
    }
  }
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] !== "simulate") {
    console.error(USAGE);
    return 2;
  }
  const path = args[1];
  const withLog = args.includes("--log");

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    console.error(`Cannot read scenario file: ${path}`);
    console.error(String(err instanceof Error ? err.message : err));
    return 1;
  }
  let scenario: Scenario;
  try {
    scenario = JSON.parse(raw) as Scenario;
  } catch (err) {
    console.error(`Invalid JSON in ${path}: ${String(err instanceof Error ? err.message : err)}`);
    return 1;
  }
  if (scenario.version !== 1) {
    console.error(`Unsupported scenario version: ${String(scenario.version)} (expected 1)`);
    return 1;
  }

  const result = simulateScenario(scenario, REGISTRY);
  printResults(result, withLog);
  return 0;
}

function safeRun(): number {
  try {
    return main();
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

process.exitCode = safeRun();