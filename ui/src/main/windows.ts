import { BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ONE application window hosting the whole React application (Simulation Setup screen and
 * the Simulation/Debug view with three internal panels: Grid, Combat Log, Rotation).
 * No OS-level multi-windows. The session stays in this (main) process.
 *
 * Security defaults: contextIsolation + sandbox, no nodeIntegration.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !!process.env["ELECTRON_RENDERER_URL"];

function preloadPath(): string {
  // CommonJS preload (index.cjs) — required because the renderer is sandboxed
  // (ESM preloads are not applied in sandboxed renderers, which caused the blank window).
  return path.join(__dirname, "../preload/index.cjs");
}

function entryPath(): string {
  return path.join(__dirname, "../renderer/app/index.html");
}

let mainWindow: BrowserWindow | null = null;

export function createWindow(): void {
  const win = new BrowserWindow({
    title: "GFL2: Exilium DPS Simulator — Debugger",
    width: 1560,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0d1117",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // Dev diagnostics: surface renderer console/preload errors in the main-process terminal
  // so a blank or failing renderer is never silent (debug client requirement).
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[preload-error] ${preloadPath}: ${error}`);
  });
  if (isDev) {
    const base = process.env["ELECTRON_RENDERER_URL"]!;
    void win.loadURL(`${base}/app/index.html`);
  } else {
    void win.loadFile(entryPath());
  }
  mainWindow = win;
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}

export function broadcast(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}