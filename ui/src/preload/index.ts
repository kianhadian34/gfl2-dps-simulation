import { contextBridge, ipcRenderer } from "electron";
import type { ScenarioView, SessionView } from "../shared/engine-types.js";

/**
 * Narrow, typed preload API exposed as window.sim.
 * contextIsolation + sandbox keep the renderer from touching Node/Electron directly.
 */
const api = {
  getSession: (): Promise<SessionView | null> => ipcRenderer.invoke("sim:getSession"),
  listCharacters: (): Promise<Array<{ id: string; name: string; mobility?: number }>> => ipcRenderer.invoke("sim:listCharacters"),
  run: (scenario: ScenarioView): Promise<SessionView> => ipcRenderer.invoke("sim:run", scenario),
  openScenario: (): Promise<SessionView | null> => ipcRenderer.invoke("dialog:openScenario"),
  onSessionUpdate: (cb: (session: SessionView) => void): void => {
    ipcRenderer.on("session:update", (_event, session: SessionView) => cb(session));
  },
};

contextBridge.exposeInMainWorld("sim", api);

export type SimApi = typeof api;