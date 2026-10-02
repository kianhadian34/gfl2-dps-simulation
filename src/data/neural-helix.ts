/**
 * NEURAL HELIX (2026) — GLOBAL bonus module.
 *
 * Neural Helix is an INDEPENDENT system: it is NOT Affinity and has NO levels. Every character has
 * ONE static `CharacterDef.neuralHelixStats` (character-specific flat ATK/HP/DEF + ATK%/HP%/DEF%),
 * plus this UNIVERSAL percentage bonus that is identical for every character.
 *
 * The universal bonus is a plain DATA CONSTANT (not per-character data): it is added to each
 * character's Neural Helix percentage contribution and then folded into the EXISTING percentage
 * buckets — no Neural-Helix-specific multiplier, no second multiplication, no special ordering.
 */
export const NEURAL_HELIX_GLOBAL_PCT = 0.12;
