/**
 * Interactive EFFECT-SOURCE reference (presentation-only).
 *
 * Mirrors the existing status-chip interaction so effect sources in the Combat Log are
 * hoverable + keyboard focusable in exactly the same way. The tooltip body shows only the
 * information ALREADY in the engine provenance label (name / level / fortification rank,
 * parsed deterministically) plus the factual role of the entry in the event. No gameplay
 * descriptions are invented, and the internal status `note`/documentation is never used.
 */
import { parseEffectSource } from "./presenters.js";

export function EffectSourceRef(props: { label: string }): JSX.Element {
  const info = parseEffectSource(props.label);
  return (
    <span className="status-chip effect-source-chip" tabIndex={0} role="button" aria-label={`effect source ${props.label}`}>
      {props.label}
      <span className="tooltip" role="tooltip">
        <b>{info.name}</b>
        {info.level !== undefined && <span className="tooltip-row">Level: {info.level}</span>}
        {info.fortification !== undefined && <span className="tooltip-row">Fortification: V{info.fortification}</span>}
        <span className="tooltip-row">Effect source — contributed damage modifiers on this hit</span>
      </span>
    </span>
  );
}