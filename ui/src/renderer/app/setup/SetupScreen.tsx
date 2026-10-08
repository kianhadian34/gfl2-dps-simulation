import { useEffect, useState } from "react";
import { useSession } from "../../../shared/use-sim.js";
import {
  buildScenario,
  equipmentErrors,
  equipmentOf,
  seedDebugBaseStats,
  mergeFreshCharacters,
  setAffinityKey,
  setCalibration,
  setDebugBaseStat,
  setDebugEnabled,
  setExpansionKey,
  setWeapon,
  setCommonKeyAt,
  toggleCommonKeyStatChoice,
  setApexComponentAt,
  setApexEnhancement,
  MAX_APEX_COMPONENTS_UI,
  setAffinityLevel,
  setRoundOrder,
  toggleFixedKey,
  toggleAttachmentStat,
  setActiveAttachmentSet,
  addRotationSlot,
  moveRotationSlot,
  removeRotationSlotAt,
  clearRotation,
  PHASE_WEAKNESSES,
  AMMO_WEAKNESSES,
  ROTATION_SLOTS,
  MAX_FIXED_KEYS,
  MAX_COMMON_KEYS_UI,
  DEBUG_STAT_KEYS,
  DEFAULT_AFFINITY_LEVEL,
  type RotationSlot,
  type SetupState,
} from "../../../shared/setup.js";
import type { ScenarioView, WeaponView, CommonKeyView, CommonKeyListResult, CommonKeyStatOptionView, CharacterMetaView, AffinityKeyView, ExpansionKeyView, AttachmentCatalogView, ApexCatalogView, ApexComponentView, RotationSkillView } from "../../../shared/engine-types.js";
import { fixedKeyLabel, effectCopyWithCalibration, commonKeyStatLines, commonKeyEffectLine, affinityKeyStatLines, affinityLevels, affinityLevelFlatLines, expansionKeyEffectLine, affinityLevelStatLines, rotationAbilityDescription } from "../../../shared/lists.js";
import { portraitAsset, fixedKeyAsset, commonKeyAsset, affinityKeyAsset, expansionKeyAsset, weaponAsset, skillAsset, elementAsset, ammoAsset } from "../../../shared/assets.js";
import { AssetThumb } from "./AssetThumb.js";

/**
 * Golden Melody detail copy — authoritative in-game REFERENCE strings (2026). The numerals
 * match the engine WeaponDef data 1:1 (src/data/weapons.ts calibrations: dealt 10/10/15/20/20/20,
 * support 10/15/15/15/20/20, gains 1/1/1/1/2/2, stacks 2/2/3/3/4/4; trait full-HP 1 turn;
 * imprint ELID 2.5% / no-Cover 2.5%). These are reference-provided player-facing texts, NOT
 * engine fields — no mechanics are invented (presentation only).
 */
const WEAPON_DETAIL_COPY = {
  effect:
    "Increase damage dealt by {dmgs}. When gaining buffs, increase damage dealt by the next Support Action by {stacks} for {gains} time(s), stacking up to {maxes} times.",
  trait: "If the user has full HP at the end of the action, she gains a random buff, lasting for 1 turn.",
  imprint:
    "Increase damage dealt to ELIDs by 2.5%. If the target is not protected by Cover, increase it by an additional 2.5%.",
};

/**
 * SIMULATION SETUP — choose the target (dummy), pick characters from the engine registry,
 * configure the fixed rotation and MVP settings, then Start Simulation.
 */

/** Affinity Key presentation (same card style as Common Keys): artwork, name, per-level stats. */
function AffinityKeyBadge({ k, size, level }: { k: AffinityKeyView; size: number; level?: number }) {
  const lines = affinityKeyStatLines(k, level);
  const tip = [k.name, ...lines].join("\n");
  return (
    <span className="common-key-badge" title={tip}>
      <AssetThumb asset={affinityKeyAsset(k.id)} alt={k.name} size={size} />
      <span className="common-key-badge-text">
        <span className="common-key-name">{k.name}</span>
        {lines.map((ln) => (
          <span key={ln} className="common-key-stat">
            {ln}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Expansion Key presentation (same card style): artwork, name, its authoritative effect text.
 *  Tooltips can be long, so the visible effect line is clamped and the FULL tooltip is available
 *  on hover (title) — the card layout stays compact. */
function ExpansionKeyBadge({ k, size }: { k: ExpansionKeyView; size: number }) {
  const effect = expansionKeyEffectLine(k);
  const tip = effect !== undefined ? [k.name, effect].join("\n") : k.name;
  return (
    <span className="common-key-badge" title={tip}>
      <AssetThumb asset={expansionKeyAsset(k.id)} alt={k.name} size={size} />
      <span className="common-key-badge-text">
        <span className="common-key-name">{k.name}</span>
        {effect ? (
          <span key={effect} className="common-key-effect">
            {effect}
          </span>
        ) : null}
      </span>
    </span>
  );
}
function CommonKeyBadge({ k, size, chosenKinds }: { k: CommonKeyView; size: number; chosenKinds?: string[] }) {
  const effect = commonKeyEffectLine(k);
  return (
    <>
      <AssetThumb asset={commonKeyAsset(k.id)} alt={k.name} size={size} />
      <span className="common-key-badge-text">
        <span className="common-key-name">{k.name}</span>
        {commonKeyStatLines(k, chosenKinds).map((ln, i) => (
          <span key={`${ln.text}-${i}`} className={`common-key-stat is-${ln.state}`}>
            {ln.text}
          </span>
        ))}
        {effect ? (
          <span key={effect} className="common-key-effect">
            {effect}
          </span>
        ) : null}
      </span>
    </>
  );
}

/** Type-rail label for a rotation card (engine skill type; Basic/Active/Ultimate/Support). */
function rotationTypeLabel(type: string | undefined): string | undefined {
  return type ? type.toUpperCase() : undefined;
}

/**
 * APEX COMPONENT badge (2026) — the Apex Chassis card: name, tier, the always-on stat lines, and
 * the secondary effect's clauses. All text comes from the engine-sourced `ApexComponentView`.
 */
function ApexComponentBadge({ k }: { k: ApexComponentView }) {
  return (
    <span className="apex-badge">
      <span className="apex-badge-name">{k.name}</span>
      <span className="apex-badge-tier muted">
        Tier {k.tier} · {k.type.toUpperCase()}
      </span>
      {k.statLines.map((ln) => (
        <span key={ln} className="common-key-stat">
          {ln}
        </span>
      ))}
      {k.secondaryEffectName ? (
        <>
          <span className="apex-badge-effect-name">{k.secondaryEffectName}</span>
          {(k.secondaryEffectLines ?? []).map((ln) => (
            <span key={ln} className="common-key-effect">
              {ln}
            </span>
          ))}
        </>
      ) : null}
    </span>
  );
}

/** Component id → type lookup from the engine-sourced catalog (for the one-per-type rule). */
function apexTypeOf(catalog: ApexCatalogView | null): (id: string) => string | undefined {
  return (id) => catalog?.items.find((c) => c.id === id)?.type;
}

/**
 * COMMON KEY STAT PICKER (2026). Rendered INSIDE the equipped key's own slot column, directly
 * under that key, so each key's selectable stat boosts are visually anchored to the key they
 * belong to (three keys → three pickers, never one detached bar). The fixed stat(s) are shown
 * read-only; the player toggles the remaining kinds from the engine pool. A kind that is already
 * the key's fixed stat, or would exceed the selectable-slot count, is disabled (no duplicates).
 */
function CommonKeyStatPicker(props: {
  k: CommonKeyView;
  options: CommonKeyStatOptionView[];
  chosen: string[];
  onToggle: (kind: string) => void;
}) {
  const fixedCount = props.k.fixedStatCount ?? 1;
  const maxChoices = (props.k.stats?.length ?? 0) - fixedCount;
  if (maxChoices <= 0) return null; // no selectable slots → nothing to pick (e.g. a fully-fixed key)
  const fixedKinds = (props.k.stats ?? []).slice(0, fixedCount).map((s) => s.kind).filter((x): x is string => x !== undefined);
  const labelFor = (kind: string) => props.options.find((o) => o.kind === kind)?.label ?? kind;
  return (
    <div className="common-key-statpick" onClick={(e) => e.stopPropagation()}>
      <span className="common-key-statpick-head">
        Stat boosts <span className="muted">({props.chosen.length}/{maxChoices})</span>
      </span>
      <span className="common-key-statpick-fixed muted">fixed: {fixedKinds.length > 0 ? fixedKinds.map(labelFor).join(", ") : "—"}</span>
      <span className="common-key-statpick-pills">
        {props.options.map((opt) => {
          const isFixed = fixedKinds.includes(opt.kind);
          const isChosen = props.chosen.includes(opt.kind);
          const full = props.chosen.length >= maxChoices && !isChosen;
          const disabled = isFixed || full;
          return (
            <button
              key={opt.kind}
              type="button"
              className={`common-key-statpill${isChosen ? " is-selected" : ""}`}
              disabled={disabled}
              title={isFixed ? "Already the key's fixed stat" : full ? "All selectable slots are filled" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                props.onToggle(opt.kind);
              }}
            >
              {opt.label} <span className="muted">+{(opt.value * 100).toFixed(1)}%</span>
            </button>
          );
        })}
      </span>
    </div>
  );
}
/**
 * Mini element + ammo badges for a rotation skill card — engine-sourced (the SAME icons the Phase/
 * Ammo weakness sections use). An ability shows a badge ONLY for the attribute it actually has:
 *  - `element` present → the phase icon (`null` = phase-less PHYSICAL attack → the `physical` icon);
 *  - `element` ABSENT → NO phase icon (the ability has no attack phase attribute — e.g. a buff-only
 *    Ultimate). Absent must NOT be rendered as if it were a physical attack.
 *  - `ammoType` present → the ammo icon; absent → none.
 * Presentation only; a skill with no attributes renders nothing.
 */
function RotationSkillMeta({ sk, size = 15 }: { sk: RotationSkillView | undefined; size?: number }) {
  if (!sk) return null;
  const hasElement = sk.element !== undefined;
  const elementId = sk.element ?? "physical"; // present null = phase-less physical attack
  const typeLabel = rotationTypeLabel(sk.type);
  const hasAny = hasElement || sk.ammoType !== undefined || typeLabel !== undefined;
  if (!hasAny) return null;
  return (
    <span className="rot-skill-meta">
      {hasElement ? <AssetThumb asset={elementAsset(elementId)} alt={sk.element ?? "physical"} size={size} /> : null}
      {sk.ammoType ? <AssetThumb asset={ammoAsset(sk.ammoType)} alt={sk.ammoType} size={size} /> : null}
      {typeLabel ? <span className="rot-type-chip">{typeLabel}</span> : null}
    </span>
  );
}

export function SetupScreen(props: {
  setup: SetupState;
  onChange: (next: SetupState) => void;
  error: string | null;
  onStart: (scenario: ScenarioView) => Promise<void>;
  onOpenScenario: () => Promise<void>;
}): JSX.Element {
  const { listCharacters, listWeapons, listCommonKeys, listAttachments, listApexComponents } = useSession();
  const [charsLoaded, setCharsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Engine-sourced equipment option lists (IPC — never duplicated in the renderer).
  const [weapons, setWeapons] = useState<WeaponView[]>([]);
  const [commonKeys, setCommonKeys] = useState<CommonKeyListResult | null>(null);
  const [attachments, setAttachments] = useState<AttachmentCatalogView | null>(null);
  const [apex, setApex] = useState<ApexCatalogView | null>(null);
  const [commonKeySlot, setCommonKeySlot] = useState<number | null>(null);
  const [apexSlot, setApexSlot] = useState<number | null>(null);
  const [affinityPickerFor, setAffinityPickerFor] = useState<string | null>(null);
  const [expansionPickerFor, setExpansionPickerFor] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, CharacterMetaView>>({});
  // Which doll's weapon picker is currently open (renderer-local presentation state only).
  const [weaponPickerFor, setWeaponPickerFor] = useState<string | null>(null);

  useEffect(() => {
    if (charsLoaded) return;
    Promise.all([listCharacters(), listWeapons(), listCommonKeys(), listAttachments(), listApexComponents()])
      .then(([chars, wl, ckl, atc, apx]) => {
        setWeapons(wl);
        setCommonKeys(ckl);
        setAttachments(atc);
        setApex(apx);
        setMeta(Object.fromEntries(chars.map((c) => [c.id, c])));
        // Seed DEBUG MODE base stats from the characters' REAL CharacterDef.base (engine-sourced).
        const baseById: Record<string, { atk: number; hp: number; def: number; stability: number; critRate: number; critDmg: number }> = {};
        for (const c of chars) if (c.base) baseById[c.id] = c.base;
        props.onChange(
          seedDebugBaseStats(
            { ...props.setup, characters: mergeFreshCharacters(props.setup.characters, chars) },
            baseById,
          ),
        );
        setCharsLoaded(true);
      })
      .catch((e: unknown) => setFormError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charsLoaded, listCharacters, listWeapons, listCommonKeys, listAttachments, listApexComponents]);

  const set = (patch: Partial<SetupState>): void => props.onChange({ ...props.setup, ...patch });

  const toggleChar = (id: string, on: boolean): void => {
    const characters = props.setup.characters.map((c: { id: string; name: string; selected: boolean }) => (c.id === id ? { ...c, selected: on } : c));
    const rotations = { ...props.setup.rotations };
    if (!on) delete rotations[id];
    props.onChange({ ...props.setup, characters, rotations });
  };

  const addSlot = (id: string, slot: RotationSlot): void => {
    props.onChange(addRotationSlot(props.setup, id, slot));
  };

  /** Rotation drag-and-drop: which slot index is being dragged, and which target index is hovered. */
  const [dragIndex, setDragIndex] = useState<{ charId: string; from: number } | null>(null);
  const [dropIndex, setDropIndex] = useState<{ charId: string; to: number } | null>(null);

  const start = async (): Promise<void> => {
    setFormError(null);
    // UI-local "obviously invalid" equipment checks (engine validation remains authoritative).
    const equipmentErrorsList = equipmentErrors(props.setup);
    if (equipmentErrorsList.length > 0) {
      setFormError(equipmentErrorsList.join(" "));
      return;
    }
    try {
      const scenario = buildScenario(props.setup);
      setBusy(true);
      await props.onStart(scenario);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app setup">
      <div className="toolbar">
        <span className="muted">GFL2: Exilium DPS Simulator — Simulation Setup</span>
        <span className="spacer" />
        <button onClick={props.onOpenScenario}>Load scenario JSON…</button>
      </div>
      <div className="content setup-grid">
        <section>
          <h2>Simulation target</h2>
          <p className="muted">Training Dummy — stationary, no cover (MVP).</p>
          {/* preventDefault: an implicit form submission (Enter in a field) must NOT reload the
              renderer — a reload silently resets the entire Setup state (this caused the
              "configured 7 turns" run to execute with the DEFAULT 2 turns). */}
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>HP <input type="number" value={props.setup.dummy.hp} onChange={(e) => set({ dummy: { ...props.setup.dummy, hp: Number(e.target.value) } })} /></label>
            <label>DEF <input type="number" value={props.setup.dummy.defense} onChange={(e) => set({ dummy: { ...props.setup.dummy, defense: Number(e.target.value) } })} /></label>
            <label>Stability <input type="number" value={props.setup.dummy.stability} onChange={(e) => set({ dummy: { ...props.setup.dummy, stability: Number(e.target.value) } })} /></label>
            <fieldset className="phase-weaknesses">
              <legend>Phase weaknesses</legend>
              {PHASE_WEAKNESSES.map((p) => {
                const id = p.elementId;
                const disabled = id === undefined;
                return (
                  <label key={p.label} className="inline" title={p.label}>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={id !== undefined && props.setup.dummy.weaknesses.includes(id)}
                      onChange={(e) => {
                        if (id === undefined) return;
                        const ws = e.target.checked ? [...props.setup.dummy.weaknesses, id] : props.setup.dummy.weaknesses.filter((w) => w !== id);
                        set({ dummy: { ...props.setup.dummy, weaknesses: ws } });
                      }}
                    />
                    <AssetThumb asset={elementAsset(id ?? p.label.toLowerCase())} alt={p.label} size={28} />
                    {p.label}
                    {disabled && <span className="muted"> (engine Element pending)</span>}
                  </label>
                );
              })}
            </fieldset>
            <fieldset className="ammo-weaknesses">
              <legend>Ammo weaknesses</legend>
              {AMMO_WEAKNESSES.map((a) => (
                <label key={a.label} className="inline">
                  <input
                    type="checkbox"
                    checked={props.setup.dummy.ammoWeaknesses.includes(a.tag)}
                    onChange={(e) => {
                      const ws = e.target.checked ? [...props.setup.dummy.ammoWeaknesses, a.tag] : props.setup.dummy.ammoWeaknesses.filter((w) => w !== a.tag);
                      set({ dummy: { ...props.setup.dummy, ammoWeaknesses: ws } });
                    }}
                  />
                  <AssetThumb asset={ammoAsset(a.tag)} alt={a.label} size={28} />
                  {a.label}
                </label>
              ))}
            </fieldset>
          </form>
        </section>

        <section>
          <h2>Characters (engine registry)</h2>
          {!charsLoaded ? (
            <p className="muted">Loading…</p>
          ) : (
            <div className="form">
              {props.setup.characters.map((c) => (
                <label key={c.id} className="inline">
                  <input type="checkbox" checked={c.selected} onChange={(e) => toggleChar(c.id, e.target.checked)} />
                  <AssetThumb asset={portraitAsset(c.id)} alt={c.name} size={28} />
                  {c.name} <span className="muted">({c.id})</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2>Rotation</h2>
          {props.setup.characters.filter((c) => c.selected).length === 0 ? (
            <p className="muted">Select at least one character to build its rotation.</p>
          ) : (
            props.setup.characters
              .filter((c) => c.selected)
              .map((c) => {
                const skillOf = (slot: RotationSlot) => meta[c.id]?.skills?.[slot];
                const rotation = props.setup.rotations[c.id] ?? [];
                const isDragFrom = dragIndex?.charId === c.id;
                const resetDrag = () => { setDragIndex(null); setDropIndex(null); };
                return (
                <div key={c.id} className="rot-builder">
                  <div className="mname">
                    <AssetThumb asset={portraitAsset(c.id)} alt={c.name} size={26} />
                    {c.name}
                    <span className="rot-count muted">{rotation.length === 0 ? "no steps" : `${rotation.length} step${rotation.length === 1 ? "" : "s"}`}</span>
                  </div>
                  <div className="rot-panels">
                    {/* LEFT — ability palette (click to append to the ordered sequence) */}
                    <div className="rot-palette">
                      <span className="rot-panel-label">
                        Abilities <span className="muted">— click to add to the order</span>
                      </span>
                      <div className="rot-cards">
                        {ROTATION_SLOTS.filter((slot) => meta[c.id]?.skills?.[slot] !== undefined).map((slot) => {
                          const sk = skillOf(slot);
                          return (
                            <button key={slot} type="button" className="rot-card" title={rotationAbilityDescription(meta[c.id] as CharacterMetaView, slot, props.setup.fortificationLevel)} onClick={() => addSlot(c.id, slot)}>
                              <span className={`rot-card-rail is-${sk?.type ?? "basic"}`} aria-hidden />
                              {sk ? (
                                <>
                                  <AssetThumb asset={skillAsset(sk.id)} alt={sk.name} size={72} />
                                  <span className="rot-card-name">{sk.name}</span>
                                  <RotationSkillMeta sk={sk} />
                                </>
                              ) : (
                                <span className="rot-card-name">{slot}</span>
                              )}
                              <span className="rot-card-add" aria-hidden>+</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {/* RIGHT — ordered sequence (priority order; drag to reorder) */}
                    <div className="rot-sequence">
                      <span className="rot-panel-label">
                        Priority order <span className="muted">— the first usable ability each turn, then loop</span>
                      </span>
                      {rotation.length === 0 ? (
                        <div className="rot-empty muted">empty — add abilities from the left</div>
                      ) : (
                        <div className="rot-slots">
                          {rotation.map((slot, i) => {
                            const sk = skillOf(slot);
                            return (
                              <div
                                key={i}
                                className={`rot-slot-wrap${i > 0 ? " has-connector" : ""}${isDragFrom && dragIndex?.from === i ? " is-dragging" : ""}${isDragFrom && dropIndex?.to === i ? " is-drop-target" : ""}`}
                                draggable
                                onDragStart={() => setDragIndex({ charId: c.id, from: i })}
                                onDragOver={(e) => { e.preventDefault(); setDropIndex({ charId: c.id, to: i }); }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (dragIndex !== null && dragIndex.charId === c.id) props.onChange(moveRotationSlot(props.setup, c.id, dragIndex.from, i));
                                  resetDrag();
                                }}
                                onDragEnd={resetDrag}
                              >
                                <span className="rot-slot-card" title={rotationAbilityDescription(meta[c.id] as CharacterMetaView, slot, props.setup.fortificationLevel)}>
                                  <span className="rot-step-num" aria-hidden>{i + 1}</span>
                                  {sk ? (
                                    <>
                                      <AssetThumb asset={skillAsset(sk.id)} alt={sk.name} size={34} />
                                      <span className="rot-slot-body">
                                        <span className="rot-slot-name">{sk.name}</span>
                                        <RotationSkillMeta sk={sk} size={13} />
                                      </span>
                                    </>
                                  ) : (
                                    slot
                                  )}
                                  <button
                                    type="button"
                                    className="rot-slot-remove"
                                    aria-label={`Remove step ${i + 1}`}
                                    title="Remove this step"
                                    onClick={(e) => { e.stopPropagation(); props.onChange(removeRotationSlotAt(props.setup, c.id, i)); }}
                                  >
                                    ×
                                  </button>
                                </span>
                              </div>
                            );
                          })}
                          <span className="rot-loop" title="After the last step, the scan loops back to the first" aria-hidden>↻</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rot-actions">
                    <button
                      type="button"
                      onClick={() => props.onChange(removeRotationSlotAt(props.setup, c.id, rotation.length - 1))}
                    >
                      − remove
                    </button>
                    <button type="button" onClick={() => props.onChange(clearRotation(props.setup, c.id))}>
                      clear
                    </button>
                  </div>
                </div>
                );
              })
          )}
        {(() => {
          const teamIds = props.setup.characters.filter((c) => c.selected).map((c) => c.id);
          return teamIds.length > 1 ? (
            <div className="round-orders">
              <p className="muted">
                Action order per round (defaults to team order). Every round lists every team unit exactly once — no skips.
              </p>
              {Array.from({ length: props.setup.turns }, (_, idx) => idx + 1).map((round) => {
                const current = props.setup.roundOrder?.[round] ?? teamIds;
                return (
                  <div key={round} className="round-order-row">
                    <span className="round-order-label">Round {round}</span>
                    {current.map((cid, pos) => (
                      <select
                        key={`${round}-${pos}`}
                        value={cid}
                        onChange={(e) => {
                          const chosen = [...current];
                          const otherPos = chosen.findIndex((x, i) => i !== pos && x === e.target.value);
                          if (otherPos >= 0) chosen[otherPos] = chosen[pos];
                          chosen[pos] = e.target.value;
                          props.onChange(setRoundOrder(props.setup, round, chosen));
                        }}
                      >
                        {teamIds.map((id) => (
                          <option key={id} value={id}>
                            {meta[id]?.name ?? id}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : null;
        })()}
        </section>

        <section>
          <h2>Doll equipment (engine-sourced options)</h2>
          {props.setup.debug.enabled && (
            <p className="muted">
              <b>DEBUG MODE</b> — every equipment selector below is OPTIONAL (no weapon, 0 keys allowed). The normal mode
              requirements apply only when Debug Mode is off.
            </p>
          )}
          {props.setup.characters.filter((c) => c.selected).length === 0 ? (
            <p className="muted">Select a character to configure its equipment.</p>
          ) : (
            props.setup.characters
              .filter((c) => c.selected)
              .map((c) => {
                const equ = equipmentOf(c);
                const m = meta[c.id];
                const weapon = equ.weaponId !== undefined ? weapons.find((w) => w.id === equ.weaponId) : undefined;
                const ownerName = weapon?.ownerCharacterId !== undefined ? meta[weapon.ownerCharacterId]?.name : undefined;
                const affinityKey = m?.affinityKey;
                const expansionKey = m?.expansionKey;
                const atkBoostPct = Math.round((weapon?.subStats.find((s) => s.stat === "pctAtk")?.value ?? 0) * 100);
                return (
                  <div key={c.id} className="rot-builder">
                    <div className="mname">
                      {c.name} <span className="muted">equipment — engine-sourced, engine-validated</span>
                    </div>

                    <div className="form">
                      <div className="pills-row">
                        <span className="pills-label">Fortification (run-wide; V0 = all abilities Lv1)</span>
                        {[0, 1, 2, 3, 4, 5, 6].map((v) => (
                          <button
                            key={v}
                            type="button"
                            className={`affinity-level-pill${props.setup.fortificationLevel === v ? " is-selected" : ""}`}
                            onClick={() => set({ fortificationLevel: v })}
                          >
                            V{v}
                          </button>
                        ))}
                      </div>
                      <fieldset>
                        <legend>
                          Fixed Keys ({equ.equippedFixedKeys?.length ?? 0}/{MAX_FIXED_KEYS}) — 0–3
                        </legend>
                        {(m?.fixedKeys ?? []).length === 0 ? (
                          <span className="muted">no Fixed Keys available for this doll</span>
                        ) : (
                          <div className="fixed-key-cards">
                            {(m?.fixedKeys ?? []).map((k) => {
                              const checked = (equ.equippedFixedKeys ?? []).includes(k.id);
                              // Presentation: "Fixed Key <N> - <Name>" (N + name are engine-sourced);
                              // tooltip = the authoritative in-game description (KeyDef.description).
                              // The FULL label is shown (e.g. "Fixed Key 1 - Concentration"), split
                              // over two card rows for readability — never a renamed/re-written name.
                              const [head = "", ...rest] = fixedKeyLabel(k).split(" - ");
                              return (
                                <label
                                  key={k.id}
                                  className={`fixed-key-card${checked ? " is-selected" : ""}`}
                                  aria-label={`${fixedKeyLabel(k)} (${checked ? "selected" : "not selected"})${k.description ? `. ${k.description}` : ""}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => props.onChange(toggleFixedKey(props.setup, c.id, k.id))}
                                  />
                                  <AssetThumb asset={fixedKeyAsset(k.id)} alt={k.name} size={110} />
                                  <span className="fixed-key-card-name">
                                    <span className="fixed-key-card-head">{head}</span>
                                    {rest.length > 0 ? <span className="fixed-key-card-rest">{rest.join(" - ")}</span> : null}
                                  </span>
                                  {k.description ? (
                                    <span className="tooltip">
                                      <span className="tooltip-row">{k.description}</span>
                                    </span>
                                  ) : null}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </fieldset>

                      <fieldset>
                        <legend>
                          Weapon <span className="muted">(exactly 1 — engine `weaponId`)</span>
                        </legend>
                        <div className="weapon-slot-section">
                        <div className="weapon-slot-wrap">
                          {equ.weaponId === undefined ? (
                            <button type="button" className="weapon-slot is-empty" onClick={() => setWeaponPickerFor(c.id)} aria-label="Select weapon">
                              <span className="weapon-slot-plus">+</span>
                              <span className="weapon-slot-label">Weapon</span>
                            </button>
                          ) : (
                            <div className="weapon-detail">
                              <button
                                type="button"
                                className="weapon-detail-open"
                                onClick={() => setWeaponPickerFor(c.id)}
                                aria-label="Change weapon (opens picker)"
                              >
                                <div className="weapon-detail-art">
                                  <AssetThumb asset={weaponAsset(equ.weaponId)} alt={weapon?.name ?? "weapon"} width={300} height={180} fit="contain" />
                                </div>
                                <div className="weapon-detail-main">
                                  <div className="weapon-detail-title">
                                    <span className="weapon-detail-name">{weapon?.name ?? "—"}</span>
                                    <span className="weapon-detail-rarity">{weapon?.rarity === "elite" ? "ELITE" : weapon?.rarity ?? ""}</span>
                                  </div>
                                  {ownerName ? <span className="weapon-detail-sig">Signature weapon of {ownerName}</span> : null}
                                  <span className="weapon-detail-stat">Attack&nbsp;&nbsp;{weapon?.atkLvl60 ?? "—"}</span>
                                  <span className="weapon-detail-stat">Attack Boost&nbsp;&nbsp;{atkBoostPct}%</span>
                                </div>
                              </button>
                              <div>
                                <label>
                                  Calibration <span className="muted">(C{weapon?.calibrations.join("/C") ?? ""})</span>
                                  <select
                                    value={equ.calibrationLevel ?? ""}
                                    onChange={(e) =>
                                      props.onChange(
                                        setCalibration(props.setup, c.id, e.target.value === "" ? undefined : Number(e.target.value)),
                                      )
                                    }
                                  >
                                    <option value="">— none —</option>
                                    {weapon?.calibrations.map((lv) => (
                                      <option key={lv} value={lv}>
                                        C{lv}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div className="weapon-detail-cols">
                                <div className="weapon-detail-col">
                                  <h4>Effect</h4>
                                  <p>
                                    {effectCopyWithCalibration(weapon, WEAPON_DETAIL_COPY.effect, equ.calibrationLevel).map((seg, i) =>
                                      seg.cal ? (
                                        <span key={i} className="cal-val">
                                          {seg.text}
                                        </span>
                                      ) : (
                                        <span key={i}>{seg.text}</span>
                                      ),
                                    )}
                                  </p>
                                </div>
                                <div className="weapon-detail-col">
                                  <h4>Trait</h4>
                                  <p>{WEAPON_DETAIL_COPY.trait}</p>
                                </div>
                                <div className="weapon-detail-col">
                                  <h4>Imprint{ownerName ? ` - ${ownerName}` : ""}</h4>
                                  <p>{WEAPON_DETAIL_COPY.imprint}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {weaponPickerFor === c.id && (
                          <div className="weapon-picker" role="dialog" aria-label="Choose weapon">
                            <div className="weapon-picker-list">
                              <button
                                type="button"
                                className="weapon-picker-card is-remove"
                                onClick={() => {
                                  props.onChange(setWeapon(props.setup, c.id, undefined, []));
                                  setWeaponPickerFor(null);
                                }}
                              >
                                <span className="weapon-slot-plus">+</span>
                                <span className="weapon-picker-name">— no weapon —</span>
                              </button>
                              {weapons.map((w) => (
                                <button
                                  key={w.id}
                                  type="button"
                                  className={`weapon-picker-card${equ.weaponId === w.id ? " is-selected" : ""}`}
                                  onClick={() => {
                                    props.onChange(setWeapon(props.setup, c.id, w.id, w.calibrations ?? []));
                                    setWeaponPickerFor(null);
                                  }}
                                >
                                  <AssetThumb asset={weaponAsset(w.id)} alt={w.name} width={200} height={120} fit="contain" />
                                  <span className="weapon-picker-name">{w.name}</span>
                                </button>
                              ))}
                            </div>
                            <button type="button" className="weapon-picker-close" onClick={() => setWeaponPickerFor(null)}>
                              Close
                            </button>
                          </div>
                        )}
                        </div>

                        <div className="attachment-section">
                          <h4 className="attachment-section-title">
                            Attachments <span className="muted">(weapon slots — engine-validated, max-stat)</span>
                          </h4>
                          {attachments ? (
                            <>
                              {attachments.slots.map((slot) => {
                                const selected = equ.attachments?.[slot.slot] ?? [];
                                return (
                                  <div key={slot.slot} className="attachment-slot-row">
                                    <span className="attachment-slot-label">
                                      {slot.label} <span className="muted">({selected.length}/{slot.maxStats})</span>
                                    </span>
                                    <span className="affinity-levels attachment-stat-pills">
                                      {slot.allowedStats.map((stat) => {
                                        const on = selected.includes(stat.kind);
                                        return (
                                          <span
                                            key={stat.kind}
                                            role="button"
                                            tabIndex={0}
                                            className={`affinity-level-pill${on ? " is-selected" : ""}`}
                                            title={`+${stat.isPct ? `${(stat.value * 100).toFixed(1)}%` : stat.value} ${stat.label}`}
                                            onClick={() => props.onChange(toggleAttachmentStat(props.setup, c.id, slot.slot, stat.kind, slot.maxStats))}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                props.onChange(toggleAttachmentStat(props.setup, c.id, slot.slot, stat.kind, slot.maxStats));
                                              }
                                            }}
                                          >
                                            {stat.label} <span className="muted">{stat.isPct ? `${(stat.value * 100).toFixed(1)}%` : `+${stat.value}`}</span>
                                          </span>
                                        );
                                      })}
                                    </span>
                                  </div>
                                );
                              })}
                              <div className="attachment-set-row">
                                <span className="attachment-slot-label">Active Attachment Set</span>
                                <select
                                  className="attachment-set-select"
                                  value={equ.activeAttachmentSet ?? ""}
                                  onChange={(e) => props.onChange(setActiveAttachmentSet(props.setup, c.id, e.target.value || undefined))}
                                >
                                  <option value="">— none —</option>
                                  {attachments.sets.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}
                                    </option>
                                  ))}
                                </select>
                                <span className="muted">separate from the slot stats above</span>
                              </div>
                            </>
                          ) : (
                            <span className="muted">loading attachments…</span>
                          )}
                        </div>
                      </fieldset>

                      <fieldset>
                        <legend>
                          Common Keys ({equ.commonKeyIds?.length ?? 0}/{MAX_COMMON_KEYS_UI}) — engine 3-slot max
                        </legend>
                        {(commonKeys?.items ?? []).length === 0 ? (
                          <span className="muted">no Common Keys available (IPC list empty)</span>
                        ) : (
                          <>
                            <div className="common-key-slots">
                              {[0, 1, 2].map((slot) => {
                                const keyId = (equ.commonKeyIds ?? [])[slot];
                                const k = keyId !== undefined ? (commonKeys?.items ?? []).find((x) => x.id === keyId) : undefined;
                                return (
                                  // Each slot is a COLUMN: the key card, then (for an equipped key with
                                  // selectable slots) its own stat picker directly underneath, so the
                                  // picker is anchored to the key it configures — 3 keys → 3 pickers.
                                  <div key={slot} className="common-key-slot-col">
                                    <button
                                      type="button"
                                      className={`common-key-slot${k ? " is-filled" : " is-empty"}`}
                                      onClick={() => setCommonKeySlot(slot)}
                                    >
                                      {k ? (
                                        <>
                                          <CommonKeyBadge k={k} size={64} chosenKinds={equ.commonKeyStatChoices?.[k.id] ?? []} />
                                          <span
                                            className="common-key-slot-remove"
                                            title="Remove"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              props.onChange(
                                                setCommonKeyAt(
                                                  props.setup,
                                                  c.id,
                                                  slot,
                                                  undefined,
                                                  commonKeys?.maxCommonKeys ?? MAX_COMMON_KEYS_UI,
                                                ),
                                              );
                                            }}
                                          >
                                            ×
                                          </span>
                                        </>
                                      ) : (
                                        <span className="common-key-slot-plus">+</span>
                                      )}
                                    </button>
                                    {k && k.stats ? (
                                      <CommonKeyStatPicker
                                        k={k}
                                        options={commonKeys?.selectableStats ?? []}
                                        chosen={equ.commonKeyStatChoices?.[k.id] ?? []}
                                        onToggle={(kind) =>
                                          props.onChange(
                                            toggleCommonKeyStatChoice(
                                              props.setup,
                                              c.id,
                                              k.id,
                                              kind,
                                              k.stats!.length - (k.fixedStatCount ?? 1),
                                            ),
                                          )
                                        }
                                      />
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                            {commonKeySlot !== null ? (
                              <div className="common-key-picker" role="dialog" aria-label="Choose Common Key">
                                <div className="common-key-picker-list">
                                  <button
                                    type="button"
                                    className="common-key-picker-card is-remove"
                                    onClick={() => {
                                      props.onChange(
                                        setCommonKeyAt(
                                          props.setup,
                                          c.id,
                                          commonKeySlot,
                                          undefined,
                                          commonKeys?.maxCommonKeys ?? MAX_COMMON_KEYS_UI,
                                        ),
                                      );
                                      setCommonKeySlot(null);
                                    }}
                                  >
                                    <span className="common-key-slot-plus">+</span>
                                    <span className="common-key-picker-name">— clear this slot —</span>
                                  </button>
                                  {(commonKeys?.items ?? []).map((k) => {
                                    const inSlot = (equ.commonKeyIds ?? [])[commonKeySlot] === k.id;
                                    const usedElsewhere = (equ.commonKeyIds ?? []).includes(k.id) && !inSlot;
                                    return (
                                      <button
                                        key={k.id}
                                        type="button"
                                        className={`common-key-picker-card${inSlot ? " is-selected" : ""}${usedElsewhere ? " is-used" : ""}`}
                                        disabled={usedElsewhere}
                                        title={usedElsewhere ? "Already equipped in another slot" : undefined}
                                        onClick={() => {
                                          props.onChange(
                                            setCommonKeyAt(
                                              props.setup,
                                              c.id,
                                              commonKeySlot,
                                              k.id,
                                              commonKeys?.maxCommonKeys ?? MAX_COMMON_KEYS_UI,
                                            ),
                                          );
                                          setCommonKeySlot(null);
                                        }}
                                      >
                                        <CommonKeyBadge k={k} size={56} />
                                        {k.characterScope ? <span className="muted"> · {k.characterScope}</span> : null}
                                      </button>
                                    );
                                  })}
                                </div>
                                <button type="button" className="common-key-picker-close" onClick={() => setCommonKeySlot(null)}>
                                  Close
                                </button>
                              </div>
                            ) : null}
                          </>
                        )}
                      </fieldset>

                      <fieldset>
                        <legend>
                          Affinity Key <span className="muted">(exactly 1 — engine `affinityKeyId`)</span>
                        </legend>
                        {affinityLevels(m).length > 0 ? (
                          <div className="affinity-levels">
                            <span className="affinity-levels-label">Affinity Level</span>
                            {affinityLevels(m).map((lv) => (
                              <span
                                key={lv}
                                role="button"
                                tabIndex={0}
                                className={`affinity-level-pill${(equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL) === lv ? " is-selected" : ""}`}
                                onClick={() => props.onChange(setAffinityLevel(props.setup, c.id, lv))}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    props.onChange(setAffinityLevel(props.setup, c.id, lv));
                                  }
                                }}
                              >
                                Level {lv}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {affinityKey ? (
                          <>
                            <div className="common-key-slots is-single">
                              <button
                                type="button"
                                className={`common-key-slot${equ.affinityKeyId ? " is-filled" : " is-empty"}`}
                                onClick={() => setAffinityPickerFor(c.id)}
                              >
                                {equ.affinityKeyId ? (
                                  <AffinityKeyBadge k={affinityKey} size={64} level={equ.affinityLevel} />
                                ) : (
                                  <span className="common-key-slot-plus">+</span>
                                )}
                              </button>
                            </div>
                            {affinityLevelStatLines(m, equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL).length + affinityLevelFlatLines(m, equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL).length > 0 ? (
                              <div className="affinity-level-bonus">
                                <span className="affinity-level-bonus-label">Character Affinity</span>
                                {[
                                  ...affinityLevelStatLines(m, equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL),
                                  ...affinityLevelFlatLines(m, equ.affinityLevel ?? DEFAULT_AFFINITY_LEVEL),
                                ].map((ln) => (
                                  <span key={ln} className="affinity-level-bonus-stat">
                                    {ln}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {affinityPickerFor === c.id ? (
                              <div className="common-key-picker" role="dialog" aria-label="Choose Affinity Key">
                                <div className="common-key-picker-list">
                                  <button
                                    type="button"
                                    className="common-key-picker-card is-remove"
                                    onClick={() => {
                                      props.onChange(setAffinityKey(props.setup, c.id, undefined));
                                      setAffinityPickerFor(null);
                                    }}
                                  >
                                    <span className="common-key-slot-plus">+</span>
                                    <span className="common-key-picker-name">— clear —</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={`common-key-picker-card${equ.affinityKeyId === affinityKey.id ? " is-selected" : ""}`}
                                    onClick={() => {
                                      props.onChange(setAffinityKey(props.setup, c.id, affinityKey.id));
                                      setAffinityPickerFor(null);
                                    }}
                                  >
                                    <AffinityKeyBadge k={affinityKey} size={56} />
                                  </button>
                                </div>
                                <button type="button" className="common-key-picker-close" onClick={() => setAffinityPickerFor(null)}>
                                  Close
                                </button>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="muted">no Affinity Key defined for this character</span>
                        )}
                      </fieldset>

                      <fieldset>
                        <legend>
                          Expansion Key <span className="muted">(engine contract: single `expansionKeyId` — 0–1)</span>
                        </legend>
                        {expansionKey ? (
                          <>
                            <div className="common-key-slots is-single">
                              <button
                                type="button"
                                className={`common-key-slot${equ.expansionKeyId ? " is-filled" : " is-empty"}`}
                                onClick={() => setExpansionPickerFor(c.id)}
                              >
                                {equ.expansionKeyId ? (
                                  <ExpansionKeyBadge k={expansionKey} size={64} />
                                ) : (
                                  <span className="common-key-slot-plus">+</span>
                                )}
                              </button>
                            </div>
                            {expansionPickerFor === c.id ? (
                              <div className="common-key-picker" role="dialog" aria-label="Choose Expansion Key">
                                <div className="common-key-picker-list">
                                  <button
                                    type="button"
                                    className="common-key-picker-card is-remove"
                                    onClick={() => {
                                      props.onChange(setExpansionKey(props.setup, c.id, undefined));
                                      setExpansionPickerFor(null);
                                    }}
                                  >
                                    <span className="common-key-slot-plus">+</span>
                                    <span className="common-key-picker-name">— clear —</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={`common-key-picker-card${equ.expansionKeyId === expansionKey.id ? " is-selected" : ""}`}
                                    onClick={() => {
                                      props.onChange(setExpansionKey(props.setup, c.id, expansionKey.id));
                                      setExpansionPickerFor(null);
                                    }}
                                  >
                                    <ExpansionKeyBadge k={expansionKey} size={56} />
                                  </button>
                                </div>
                                <button type="button" className="common-key-picker-close" onClick={() => setExpansionPickerFor(null)}>
                                  Close
                                </button>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="muted">no Expansion Key defined for this character</span>
                        )}
                      </fieldset>
                    </div>
                  </div>
                );
              })
          )}
          <p className="muted">
            The engine remains authoritative: it validates every id, the 3-slot Common Key maximum, C1–C6 calibrations, and
            calibration-without-weapon. Local caps (0–3 Keys, exactly-1 weapon/affinity once equipment is engaged) are UI-only.
          </p>
        </section>

        <section>
          <h2>Simulation settings</h2>
          {/* preventDefault — see the note on the target form: implicit submission reloads
              the renderer and discards the configured state. */}
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label>
              Turns (1–7) <input type="number" min={1} max={7} value={props.setup.turns} onChange={(e) => set({ turns: Number(e.target.value) })} />
            </label>
            <label>
              Seed <input type="number" value={props.setup.seed} onChange={(e) => set({ seed: Number(e.target.value) })} />
            </label>
            <label className="inline">
              <input type="checkbox" checked={props.setup.gridEnabled} onChange={(e) => set({ gridEnabled: e.target.checked })} />
              Enable 15×15 grid (sample layout)
            </label>
          </form>
        </section>

        <section>
          <h2>Apex Chassis <span className="muted">(Heavy Ordnance Corps — account-wide)</span></h2>
          {(apex?.items ?? []).length === 0 ? (
            <span className="muted">no Apex Components available (IPC list empty)</span>
          ) : (
            <>
              <p className="muted">
                Up to {apex?.maxComponents ?? MAX_APEX_COMPONENTS_UI} Apex Components — at most one per type. Applies to the whole
                team. The engine validates the configuration.
              </p>
              <div className="common-key-slots">
                {Array.from({ length: apex?.maxComponents ?? MAX_APEX_COMPONENTS_UI }, (_, slot) => {
                  const equippedApex = (props.setup.apexChassis ?? [])[slot];
                  const k = equippedApex !== undefined ? (apex?.items ?? []).find((x) => x.id === equippedApex.componentId) : undefined;
                  return (
                    <div key={slot} className="common-key-slot-col">
                      <button
                        type="button"
                        className={`common-key-slot${k ? " is-filled" : " is-empty"}`}
                        onClick={() => setApexSlot(slot)}
                      >
                        {k ? (
                          <>
                            <ApexComponentBadge k={k} />
                            <span
                              className="common-key-slot-remove"
                              title="Remove"
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onChange(setApexComponentAt(props.setup, slot, undefined, apexTypeOf(apex)));
                              }}
                            >
                              ×
                            </span>
                          </>
                        ) : (
                          <span className="common-key-slot-plus">+</span>
                        )}
                      </button>
                      {k && equippedApex ? (
                        <div className="apex-enhance">
                          <span className="apex-enhance-label">
                            Enhance <span className="muted">({equippedApex.enhancement}/{k.maxEnhancement})</span>
                          </span>
                          <input
                            type="range"
                            min={1}
                            max={k.maxEnhancement}
                            value={equippedApex.enhancement}
                            onChange={(e) => props.onChange(setApexEnhancement(props.setup, slot, Number(e.target.value)))}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {apexSlot !== null ? (
                <div className="common-key-picker" role="dialog" aria-label="Choose Apex Component">
                  <div className="common-key-picker-list">
                    <button
                      type="button"
                      className="common-key-picker-card is-remove"
                      onClick={() => {
                        props.onChange(setApexComponentAt(props.setup, apexSlot, undefined, apexTypeOf(apex)));
                        setApexSlot(null);
                      }}
                    >
                      <span className="common-key-slot-plus">+</span>
                      <span className="common-key-picker-name">— clear this slot —</span>
                    </button>
                    {(apex?.items ?? []).map((k) => {
                      const inSlot = (props.setup.apexChassis ?? [])[apexSlot]?.componentId === k.id;
                      const usedElsewhere = (props.setup.apexChassis ?? []).some((c, i) => i !== apexSlot && c.componentId === k.id);
                      return (
                        <button
                          key={k.id}
                          type="button"
                          className={`common-key-picker-card${inSlot ? " is-selected" : ""}${usedElsewhere ? " is-used" : ""}`}
                          disabled={usedElsewhere}
                          title={usedElsewhere ? "Already equipped in another slot" : undefined}
                          onClick={() => {
                            props.onChange(setApexComponentAt(props.setup, apexSlot, k.id, apexTypeOf(apex)));
                            setApexSlot(null);
                          }}
                        >
                          <ApexComponentBadge k={k} />
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" className="common-key-picker-close" onClick={() => setApexSlot(null)}>
                    Close
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="grid-right">
          <h2>DEBUG MODE (controlled testing)</h2>
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <label className="inline">
              <input type="checkbox" checked={props.setup.debug.enabled} onChange={(e) => props.onChange(setDebugEnabled(props.setup, e.target.checked))} />
              <b>Enable DEBUG MODE</b> <span className="muted">— skips the normal equipment requirements; base stats below replace the Doll's own</span>
            </label>
          </form>
          {props.setup.debug.enabled &&
            props.setup.characters.filter((c) => c.selected).map((c) => {
              const cfg = props.setup.debug.baseStats[c.id];
              const base = cfg?.values ?? (meta[c.id]?.base as (typeof cfg)["values"] | undefined);
              return (
                <div key={c.id} className="rot-builder">
                  <div className="mname">
                    {c.name} <span className="muted">BASE STATS OVERRIDE — replaces the Doll's own base stats (before weapon/equipment)</span>
                  </div>
                  <div className="form">
                    {DEBUG_STAT_KEYS.map((key) => {
                      const label = key === "critRate" || key === "critDmg" ? `Crit ${key === "critRate" ? "Rate" : "DMG"} (${key})` : key === "atk" ? "ATK" : key.toUpperCase();
                      return (
                        <label key={key}>
                          {label}
                          <input
                            type="number"
                            step="any"
                            min={0}
                            value={base ? String(base[key]) : ""}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isNaN(v)) return; // engine rejects invalid values; keep the field editable
                              props.onChange(setDebugBaseStat(props.setup, c.id, key, v));
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p className="muted">Only edited fields are sent as baseStatOverrides; never derive equipment-modified panel stats.</p>
                </div>
              );
            })}
        </section>
      </div>
      <div className="footer">
        {(formError || props.error) && <div className="error">{formError ?? props.error}</div>}
        <button className="primary" disabled={busy} onClick={start}>
          {busy ? "Running…" : "Start Simulation"}
        </button>
      </div>
    </div>
  );
}