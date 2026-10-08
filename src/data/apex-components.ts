import type { ApexComponentDef } from "../model/types.js";

/**
 * APEX COMPONENTS (2026) — data for the Apex Chassis (a Heavy Ordnance Corps subsystem).
 *
 * SCOPE (user-directed 2026): we adapt ONLY the Apex Chassis, and only the single component we
 * have AUTHORITATIVE data for. No numbers are invented for the other 6 types or for Tiers I/II/IV.
 *
 * SOURCE (authoritative): an in-game screenshot of the player's own Tier III component
 * "Elevation - Firepower Reconstruction":
 *   Attack Boost +2.5% · Health Boost +2.5% · Defense Boost +2.5% · All-Element Boost +75
 *   Secondary: "Firepower Reconstruction III" (Lv.1) —
 *     "Damage dealt by AR Dolls is increased by 5%.
 *      If an attack exploits a weakness, damage dealt is increased by 7%."
 *
 * ENHANCEMENT (guide, 2026): duplicate Apex Components combine up to 5 times. Tier III stats range
 * 2.5%→3.0% (+0.1% per enhancement) and 75→100 (+5 per enhancement) for All-Element Boost; Tier IV
 * ranges 2.5%→3.5% (+0.2%) and 150→200 (+10). So the recorded component is Enhance 1..6, with the
 * per-enhancement increments below. The increment table is SOURCE-stated for Tier III/IV.
 *
 * NOT MODELED (recorded here so nothing is silently assumed):
 *  - All-Element Boost has NO damage effect in this engine: it only acts through the RESMult
 *    formula (enemy RES / RESPierce / RESShred / Venomfire), which is NOT modeled (see docs).
 *  - The other 6 Apex types (Lightweight Protocol / Blitz Stratagem / Hyperdimensional Vision /
 *    Zero Distance Contact / Omnidirectional Strike / Rain of Lead) and their tiers: no data.
 *  - The Polyphase-Tile clause that appears on Tier IV components: no engine model.
 *  - Acquisition / inventory / drop rates: out of scope.
 */
export const APEX_COMPONENTS: ApexComponentDef[] = [
  {
    id: "apex_firepower_reconstruction_iii",
    name: "Elevation - Firepower Reconstruction",
    type: "ar",
    tier: 3,
    maxEnhancement: 6,
    stats: { atkPct: 0.025, hpPct: 0.025, defPct: 0.025, allElementBoost: 75 },
    statIncrement: { atkPct: 0.001, hpPct: 0.001, defPct: 0.001, allElementBoost: 5 },
    secondaryEffect: {
      name: "Firepower Reconstruction III",
      weaponTypeTerm: { weaponType: "ar", value: 0.05 },
      weaknessExploitValue: 0.07,
    },
    verified: true,
  },
];
