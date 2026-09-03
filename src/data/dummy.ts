import type { DummyConfig } from "../model/types.js";

/** Recommended MVP dummy defaults (docs/research.md §3.16, §6): fully configurable, cover always "none". */
export const TRAINING_DUMMY: DummyConfig = {
  id: "training_dummy",
  name: "Training Dummy",
  hp: 999999999,
  defense: 0,
  stability: 0,
  weaknesses: [],
  phase: null,
  cover: "none",
};