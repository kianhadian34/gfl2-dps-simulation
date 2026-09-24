import { useEffect, useState } from "react";
import { useSession } from "../../../shared/use-sim.js";
import {
  buildScenario,
  equipmentErrors,
  equipmentOf,
  seedDebugBaseStats,
  setAffinityKey,
  setCalibration,
  setDebugBaseStat,
  setDebugEnabled,
  setExpansionKey,
  setWeapon,
  toggleCommonKey,
  toggleFixedKey,
  PHASE_WEAKNESSES,
  AMMO_WEAKNESSES,
  ROTATION_SLOTS,
  MAX_FIXED_KEYS,
  MAX_COMMON_KEYS_UI,
  DEBUG_STAT_KEYS,
  type RotationSlot,
  type SetupState,
} from "../../../shared/setup.js";
import type { ScenarioView, WeaponView, CommonKeyListResult, CharacterMetaView } from "../../../shared/engine-types.js";
import { fixedKeyLabel } from "../../../shared/lists.js";

/**
 * SIMULATION SETUP — choose the target (dummy), pick characters from the engine registry,
 * configure the fixed rotation and MVP settings, then Start Simulation.
 */
export function SetupScreen(props: {
  setup: SetupState;
  onChange: (next: SetupState) => void;
  error: string | null;
  onStart: (scenario: ScenarioView) => Promise<void>;
  onOpenScenario: () => Promise<void>;
}): JSX.Element {
  const { listCharacters, listWeapons, listCommonKeys } = useSession();
  const [charsLoaded, setCharsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Engine-sourced equipment option lists (IPC — never duplicated in the renderer).
  const [weapons, setWeapons] = useState<WeaponView[]>([]);
  const [commonKeys, setCommonKeys] = useState<CommonKeyListResult | null>(null);
  const [meta, setMeta] = useState<Record<string, CharacterMetaView>>({});

  useEffect(() => {
    if (charsLoaded) return;
    Promise.all([listCharacters(), listWeapons(), listCommonKeys()])
      .then(([chars, wl, ckl]) => {
        setWeapons(wl);
        setCommonKeys(ckl);
        setMeta(Object.fromEntries(chars.map((c) => [c.id, c])));
        // Seed DEBUG MODE base stats from the characters' REAL CharacterDef.base (engine-sourced).
        const baseById: Record<string, { atk: number; hp: number; def: number; stability: number; critRate: number; critDmg: number }> = {};
        for (const c of chars) if (c.base) baseById[c.id] = c.base;
        props.onChange(
          seedDebugBaseStats(
            { ...props.setup, characters: chars.map((c) => ({ id: c.id, name: c.name, selected: false, ...(c.mobility !== undefined ? { mobility: c.mobility } : {}) })) },
            baseById,
          ),
        );
        setCharsLoaded(true);
      })
      .catch((e: unknown) => setFormError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charsLoaded, listCharacters, listWeapons, listCommonKeys]);

  const set = (patch: Partial<SetupState>): void => props.onChange({ ...props.setup, ...patch });

  const toggleChar = (id: string, on: boolean): void => {
    const characters = props.setup.characters.map((c: { id: string; name: string; selected: boolean }) => (c.id === id ? { ...c, selected: on } : c));
    const rotations = { ...props.setup.rotations };
    if (!on) delete rotations[id];
    props.onChange({ ...props.setup, characters, rotations });
  };

  const addSlot = (id: string, slot: RotationSlot): void => {
    const cur = props.setup.rotations[id] ?? [];
    props.onChange({ ...props.setup, rotations: { ...props.setup.rotations, [id]: [...cur, slot] } });
  };

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
            <fieldset>
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
                    {p.label}
                    {disabled && <span className="muted"> (engine Element pending)</span>}
                  </label>
                );
              })}
            </fieldset>
            <fieldset>
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
              .map((c) => (
                <div key={c.id} className="rot-builder">
                  <div className="mname">{c.name}</div>
                  <div className="slots">
                    {(props.setup.rotations[c.id] ?? []).map((slot, i) => (
                      <span key={i} className="badge">
                        {slot}
                      </span>
                    ))}
                  </div>
                  <div className="slot-buttons">
                    {ROTATION_SLOTS.map((slot) => (
                      <button key={slot} type="button" onClick={() => addSlot(c.id, slot)}>
                        + {slot}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => set({ rotations: { ...props.setup.rotations, [c.id]: (props.setup.rotations[c.id] ?? []).slice(0, -1) } })}
                    >
                      − remove
                    </button>
                    <button type="button" onClick={() => set({ rotations: { ...props.setup.rotations, [c.id]: [] } })}>
                      clear
                    </button>
                  </div>
                </div>
              ))
          )}
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
                const calibrations = weapon?.calibrations ?? [];
                return (
                  <div key={c.id} className="rot-builder">
                    <div className="mname">
                      {c.name} <span className="muted">equipment — engine-sourced, engine-validated</span>
                    </div>

                    <div className="form">
                      <fieldset>
                        <legend>
                          Fixed Keys ({equ.equippedFixedKeys?.length ?? 0}/{MAX_FIXED_KEYS}) — 0–3
                        </legend>
                        {(m?.fixedKeys ?? []).length === 0 ? (
                          <span className="muted">no Fixed Keys available for this doll</span>
                        ) : (
                          (m?.fixedKeys ?? []).map((k) => (
                            // Presentation: "Fixed Key <N> - <Name>" (N + description are engine-sourced);
                            // tooltip = the authoritative in-game description (KeyDef.description).
                            <label key={k.id} className="inline fixed-key-toggle" aria-label={`${fixedKeyLabel(k)}${k.description ? `. ${k.description}` : ""}`}>
                              <input
                                type="checkbox"
                                checked={(equ.equippedFixedKeys ?? []).includes(k.id)}
                                onChange={() => props.onChange(toggleFixedKey(props.setup, c.id, k.id))}
                              />
                              {fixedKeyLabel(k)}
                              {k.description ? (
                                <span className="tooltip">
                                  <b>{fixedKeyLabel(k)}</b>
                                  <span className="tooltip-row">{k.description}</span>
                                </span>
                              ) : null}
                            </label>
                          ))
                        )}
                      </fieldset>

                      <label>
                        Weapon <span className="muted">(exactly 1; empty = engine-valid no-weapon legacy)</span>
                        <select
                          value={equ.weaponId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value === "" ? undefined : e.target.value;
                            const w = id !== undefined ? weapons.find((x) => x.id === id) : undefined;
                            props.onChange(setWeapon(props.setup, c.id, id, w?.calibrations ?? []));
                          }}
                        >
                          <option value="">— no weapon —</option>
                          {weapons.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} ({w.id})
                            </option>
                          ))}
                        </select>
                      </label>

                      {calibrations.length > 0 ? (
                        <label>
                          Calibration <span className="muted">(C{calibrations.join("/C")})</span>
                          <select
                            value={equ.calibrationLevel ?? ""}
                            onChange={(e) =>
                              props.onChange(
                                setCalibration(props.setup, c.id, e.target.value === "" ? undefined : Number(e.target.value)),
                              )
                            }
                          >
                            <option value="">— none —</option>
                            {calibrations.map((lv) => (
                              <option key={lv} value={lv}>
                                C{lv}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span className="muted">no calibration option for this weapon</span>
                      )}

                      <fieldset>
                        <legend>
                          Common Keys ({equ.commonKeyIds?.length ?? 0}/{MAX_COMMON_KEYS_UI}) — engine 3-slot max
                        </legend>
                        {(commonKeys?.items ?? []).length === 0 ? (
                          <span className="muted">no Common Keys available (IPC list empty)</span>
                        ) : (
                          (commonKeys?.items ?? []).map((k) => (
                            <label key={k.id} className="inline" title={k.name}>
                              <input
                                type="checkbox"
                                checked={(equ.commonKeyIds ?? []).includes(k.id)}
                                onChange={() => props.onChange(toggleCommonKey(props.setup, c.id, k.id, commonKeys?.maxCommonKeys ?? MAX_COMMON_KEYS_UI))}
                              />
                              {k.name}
                              {k.characterScope ? <span className="muted"> · {k.characterScope}</span> : null}
                            </label>
                          ))
                        )}
                      </fieldset>

                      <label>
                        Affinity Key <span className="muted">(exactly 1 — engine `affinityKeyId`)</span>
                        <select
                          value={equ.affinityKeyId ?? ""}
                          onChange={(e) => props.onChange(setAffinityKey(props.setup, c.id, e.target.value === "" ? undefined : e.target.value))}
                        >
                          <option value="">— none —</option>
                          {m?.affinityKey ? (
                            <option value={m.affinityKey.id}>
                              {m.affinityKey.name} ({m.affinityKey.id})
                            </option>
                          ) : null}
                        </select>
                      </label>

                      <label>
                        Expansion Key <span className="muted">(engine contract: single `expansionKeyId` — 0–1)</span>
                        <select
                          value={equ.expansionKeyId ?? ""}
                          onChange={(e) => props.onChange(setExpansionKey(props.setup, c.id, e.target.value === "" ? undefined : e.target.value))}
                        >
                          <option value="">— none —</option>
                          {m?.expansionKey ? (
                            <option value={m.expansionKey.id}>
                              {m.expansionKey.name} ({m.expansionKey.id})
                            </option>
                          ) : null}
                        </select>
                      </label>
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