import type { AffinityKeyDef, CharacterDef, StatusDef } from "../model/types.js";
import { QIONGJIU } from "./qiongjiu.js";
import { statusMap } from "./statuses.js";

/**
 * Game-data registry. Adding a future character = add a data file + one entry
 * here; the combat engine is never modified for new characters (docs/schemas.md §Notes).
 */
export interface Registry {
  getCharacter(id: string): CharacterDef | undefined;
  getStatus(id: string): StatusDef | undefined;
  getStatusMap(): Map<string, StatusDef>;
  characterIds(): string[];
  /** Affinity Key def by id (any doll's) — used to read a FOREIGN key's generic bonus. */
  getAffinityKey(id: string): AffinityKeyDef | undefined;
}

const CHARACTERS: CharacterDef[] = [QIONGJIU];

export const REGISTRY: Registry = {
  getCharacter(id) {
    return CHARACTERS.find((c) => c.id === id);
  },
  getStatus(id) {
    return statusMap().get(id);
  },
  getStatusMap() {
    return statusMap();
  },
  characterIds() {
    return CHARACTERS.map((c) => c.id);
  },
  getAffinityKey(id) {
    for (const c of CHARACTERS) {
      if (c.affinityKey?.id === id) return c.affinityKey;
    }
    return undefined;
  },
};