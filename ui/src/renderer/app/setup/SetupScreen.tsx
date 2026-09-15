import { useEffect, useState } from "react";
import { useSession } from "../../../shared/use-sim.js";
import { buildScenario, PHASE_WEAKNESSES, AMMO_WEAKNESSES, ROTATION_SLOTS, type RotationSlot, type SetupState } from "../../../shared/setup.js";
import type { ScenarioView } from "../../../shared/engine-types.js";

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
  const { listCharacters } = useSession();
  const [charsLoaded, setCharsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (charsLoaded) return;
    listCharacters()
      .then((list) => {
        props.onChange({ ...props.setup, characters: list.map((c) => ({ id: c.id, name: c.name, selected: false })) });
        setCharsLoaded(true);
      })
      .catch((e: unknown) => setFormError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charsLoaded, listCharacters]);

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