import { app } from "electron";
import { createWindow, broadcast, getWindow } from "./windows.js";
import { registerSimHandlers } from "./session.js";

/**
 * Electron main — owns the single simulation session and the ONE application window
 * (Simulation Setup → Simulation/Debug view with the Grid, Combat Log and Rotation panels).
 * Renderers are presentation-only; the engine under src/ stays untouched.
 */
app.whenReady().then(() => {
  registerSimHandlers();
  createWindow();
  app.on("activate", () => {
    if (!getWindow()) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

export { broadcast, getWindow };