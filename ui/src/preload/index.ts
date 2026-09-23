import { contextBridge, ipcRenderer } from "electron";
import type { ScenarioView, SessionView, WeaponView, CommonKeyListResult, CharacterMetaView } from "../shared/engine-types.js";

/**
 * Narrow, typed preload API exposed as window.sim.
 * contextIsolation + sandbox keep the renderer from touching Node/Electron directly.
 */
const api = {
  getSession: (): Promise<SessionView | null> => ipcRenderer.invoke("sim:getSession"),
  listCharacters: (): Promise<CharacterMetaView[]> => ipcRenderer.invoke("sim:listCharacters"),
  /** Engine-sourced weapon list (src/data/weapons.ts) — no renderer-side weapon definitions. */
  listWeapons: (): Promise<WeaponView[]> => ipcRenderer.invoke("sim:listWeapons"),
  /** Engine-sourced Common Key list + the engine-enforced 3-slot maximum. */
  listCommonKeys: (): Promise<CommonKeyListResult> => ipcRenderer.invoke("sim:listCommonKeys"),
  run: (scenario: ScenarioView): Promise<SessionView> => ipcRenderer.invoke("sim:run", scenario),
  openScenario: (): Promise<SessionView | null> => ipcRenderer.invoke("dialog:openScenario"),
  onSessionUpdate: (cb: (session: SessionView) => void): void => {
    ipcRenderer.on("session:update", (_event, session: SessionView) => cb(session));
  },
};

contextBridge.exposeInMainWorld("sim", api);

export type SimApi = typeof api;