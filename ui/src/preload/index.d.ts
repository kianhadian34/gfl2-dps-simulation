import type { SimApi } from "./index.js";

declare global {
  interface Window {
    readonly sim: SimApi;
  }
}

export {}