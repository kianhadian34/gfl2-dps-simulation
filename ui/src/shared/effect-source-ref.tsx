/**
 * Interactive EFFECT-SOURCE reference (presentation-only).
 *
 * Mirrors the existing status-chip interaction (hover + keyboard focus). When a structured
 * `effectSourceRef` is present it is resolved against the effect-source definition catalog
 * (built in main from the engine registry) and the tooltip shows the REAL player-facing
 * description (engine `playerDescription`) plus the level / fortification from the ref.
 * When the ref is absent or cannot be resolved, the tooltip falls back to the display label
 * (with level/V parsed from it) — never fabricated content, never internal documentation.
 */
import { parseEffectSource, resolveEffectSource } from "./presenters.js";
import type { EffectSourceInfoView, EffectSourceRefView } from "./engine-types.js";

export function EffectSourceRef(props: {
  label: string;
  sourceRef?: EffectSourceRefView;
  defs?: Record<string, EffectSourceInfoView>;
}): JSX.Element {
  const resolved = resolveEffectSource(props.sourceRef, props.defs);
  const parsed = parseEffectSource(props.label);
  const name = resolved?.name ?? parsed.name;
  // Level/V come ONLY from the STRUCTURED ref when one exists (never parse labels as a
  // substitute when structured data is available). Label-parse is used solely as the fallback
  // for events that predate structured refs (no ref at all).
  // NOTE: the prop is deliberately NOT named `ref` — `ref` is React-reserved and React strips
  // it from function-component props, which silently broke structured resolution at runtime.
  const hasRef = props.sourceRef !== undefined;
  const level = hasRef && props.sourceRef ? ("level" in props.sourceRef ? props.sourceRef.level : undefined) : parsed.level;
  const v = hasRef && props.sourceRef ? ("v" in props.sourceRef ? props.sourceRef.v : undefined) : parsed.fortification;
  return (
    <span className="status-chip effect-source-chip" tabIndex={0} role="button" aria-label={`effect source ${props.label}`}>
      {props.label}
      <span className="tooltip" role="tooltip">
        <b>{name}</b>
        {resolved?.description && <span className="tooltip-row tooltip-desc">{resolved.description}</span>}
        {level !== undefined && <span className="tooltip-row">Level: {level}</span>}
        {v !== undefined && <span className="tooltip-row">Fortification: V{v}</span>}
      </span>
    </span>
  );
}