import type { UnitState } from "./state.js";

/** Event-driven Confectance resource (research §3.12): gains written in skill/passive data, cost settled after cast. */
export function gainConfectance(unit: UnitState, amount: number, max: number): void {
  if (amount <= 0) return;
  unit.confectance = Math.min(max, unit.confectance + amount);
}

export function spendConfectance(unit: UnitState, cost: number): boolean {
  if (cost <= 0) return true;
  if (unit.confectance < cost) return false;
  unit.confectance -= cost;
  return true;
}