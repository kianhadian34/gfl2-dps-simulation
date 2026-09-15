import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

/**
 * electron-vite configuration for the single-window developer/debugging client.
 *
 *  - Main bundles the REAL engine sources from ../src (single copy, source-mapped).
 *  - PRELOAD is emitted as CommonJS (`index.cjs`): the renderer runs sandboxed
 *    (sandbox: true), and Electron requires a CommonJS preload in sandboxed
 *    renderers — ESM preloads (.mjs) are silently not applied, which left the
 *    preload API undefined and the renderer blank. This is the fix for that bug.
 *  - Renderer: one app entry (Setup screen + Grid/Combat Log/Rotation debug view).
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { sourcemap: true },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          app: "src/renderer/app/index.html",
        },
      },
    },
  },
});