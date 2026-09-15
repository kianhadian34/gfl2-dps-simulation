import type { SimApi } from "../preload/index.js";

declare global {
  interface Window {
    readonly sim: SimApi;
  }
}

export {}