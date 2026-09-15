/**
 * DISPLAY formatting (presentation-only). The engine values are never modified or rounded
 * before they reach the engine — this applies at the UI boundary only.
 *
 * Rule: a numeric value displays with AT MOST two decimal places, without forced trailing
 * zeroes (12 → "12", 1.2 → "1.2", 12.1123 → "12.11").
 */

export function fmt(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value === undefined || value === null ? "—" : String(value);
  }
  // Round to 2 decimals first — this also kills floating-point artifacts
  // (12.999999999 → 13, 1.1000000000000001 → 1.1) before stringification.
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return String(rounded);
}