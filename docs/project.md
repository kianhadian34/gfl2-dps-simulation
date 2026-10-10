# GFL2 Simulation — Permanent Project Continuity Record

**Document:** `docs/project.md` — the project continuity record (a navigator + state snapshot for
this project). It **summarizes and points to** the documents that own each subject (§1.5) and does
not replace them.
**Established:** 2026-10-09.
**Supersedes:** the external session handout (`GFL2 Simulation — Session Handoff`), which was
created to bootstrap a session with no access to the prior conversation. That handout is kept
OUTSIDE the project directory and is not part of the repository. (It supersedes the *handout* only —
not any document in §1.5.)

**Structure of this document:** §1 tells a new session how to start and who owns what. §2 is the
refreshable state snapshot. §3–§5 are the durable architecture, decisions and subsystem inventory.
§6 is the numerical evidence record. §7 is the change history. §8–§10 are the live backlog, open
questions and the single next action.

**Authority order (unchanged by this document):** the **repository** is the authority for code
state; **`docs/research.md` + `docs/validation-checklist.md`** are the authority for in-game
evidence and validation status. This document is a navigator and a record, not a third authority.
Where it disagrees with the code, the code wins — and this document should then be corrected.

---

## 1. READ THIS FIRST

### 1.1 Purpose

This file exists so a new session can **orient quickly** — it is the single starting point and a
navigator, not a substitute for the documents that own each detail. It records what is built, what
is decided, what is proven, what remains open, and what to do next, and **points to the file that
owns each topic** (§1.5) rather than restating it.

**This document is an ADDITIONAL requirement on top of the project's existing responsibilities, not
a replacement for any of them.** Maintaining it does **not** discharge any other obligation:

- The mandatory workflow (§3.5) still applies in full — including **Test**, **In-Game Validation**,
  and **Implement**. Never skip a workflow step because this document was updated.
- The **owning documents** must still be updated whenever their subject changes (§1.5). Updating
  this file does **not** satisfy the requirement to update them, and it must not be used in their
  place.
- Established code-quality, regression-testing, Git, and shared-mechanism practices still apply.

### 1.2 Session-start instructions (copyable)

> Read `docs/project.md` completely before starting work. Then **verify the actual repository
> state** — run the build/tests and check git (§2.2) — **before relying on the §2 snapshot** in this
> document. The snapshot is dated and will go stale between updates.
>
> **The repository and the current test results are authoritative.** If this document and the code
> disagree, the code wins — treat the document as wrong and correct it (§1.4).
>
> Inspect the relevant implementation and evidence before changing anything.
>
> Respect the established architecture, formulas and decisions in §3–§4. Do not reopen settled
> questions (§4) or re-run validation that a shared mechanism already covers (§6).
>
> When the user supplies in-game numbers, **calculate the expected result immediately** and
> compare it to the observed value before writing any code or documentation.
>
> **Never invent game mechanics or claim evidence that does not exist, and never promote an
> inference to a confirmed fact** — label the evidence class (§6 legend). `Not Tested` is a
> legitimate state (see §3.6).
>
> Make focused changes and preserve existing test coverage — never weaken or delete a test to
> accommodate new behavior.
>
> Update `docs/project.md` as part of completing meaningful work (§1.4) — not as a separate
> afterthought — and **end each task by reporting whether it was updated and which sections
> changed** (or why no update was needed).
>
> **Maintaining `docs/project.md` is ADDITIONAL to your existing duties, not a replacement.** Keep
> following the full workflow (§3.5) and keep updating the documents that own each subject (§1.5).
> Updating this file never substitutes for them.
>
> Ask for clarification only when a necessary decision cannot be resolved from the repository,
> the source material, or the established project decisions in this file.
>
> **Never commit without the user's explicit authorization.** One commit at a time, and never push
> until told.

### 1.3 Environment

- **Toolchain:** this machine's shell may not have `node`/`npm` on the default `PATH`. Prefix:
  `$env:PATH = "$env:LOCALAPPDATA\gfl2-sim\node;$env:PATH"` (portable Node). Use `npm.cmd`.
- PowerShell here has **no `&&`/`||`** — chain with `;`.
- Never write files with `Get-Content`/`Set-Content`/`Out-File`/`>` (ANSI mojibake). Use the file
  tools; they preserve encoding and BOM.
- **Exact commands:**
  ```powershell
  # Engine (repo root)
  npm.cmd run build          # tsc -p tsconfig.json -> dist/
  npm.cmd run test           # build + node --test "dist/test/*.test.js"
  node dist/test/<file>.test.js   # single test file
  npm.cmd run sim            # build + node dist/cli.js

  # UI (from ui/)
  npm.cmd run typecheck      # tsc --noEmit (node + web configs)
  npm.cmd run test           # tsc -p tsconfig.test.json -> dist-test, then node --test
  npm.cmd run build          # electron-vite build
  npm.cmd run dev            # electron-vite dev
  ```
- **Commit/push protocol:** `git diff --check` must be clean. LF→CRLF warnings on `git add` are
  normal. Push with `git -c http.sslBackend=openssl push origin main`, then verify
  `git rev-parse HEAD` equals `git ls-remote origin refs/heads/main`.

### 1.4 Maintenance contract (Phase 3)

Every future session MUST maintain this document. When a session starts, read this file
**completely** before doing anything else (§1.2), then verify the repository state.

**When an update is required.** Update `docs/project.md` **as part of the task that caused the
change** — never postponed to "later" or left to be reconstructed from chat history. An update is
required whenever work changes any of:

- behavior or architecture;
- a formula or a numeric rule;
- game data (`src/data/**`) or data shapes (`src/model/types.ts`);
- validation evidence or a claim's evidence class (§6);
- tests (added, changed, or removed) or their results;
- implementation status of any subsystem (§5);
- a decision that was previously open now being settled (§4), or a settled decision being reversed;
- limitations or open questions (§9);
- the backlog or the next action (§8, §10).

An explicit trigger list is better than a vague "meaningful work": **if any line above changed,
this document changed.** If genuinely none did (e.g. a read-only investigation, or a change
confined to a subsystem that no section describes), no update is needed — see the end-of-task
report below.

**Rules (every session):**

1. Read the relevant existing sections before starting.
2. Follow the established workflow (§3.5).
3. Preserve previous decisions and evidence unless new evidence contradicts them.
4. Update the §2 snapshot when relevant work changes the state (branch/HEAD/working tree, and
   re-run the build/tests rather than copying old numbers). **Do NOT open a commit solely to
   refresh this document after every commit** — refresh the snapshot at the **start of the next
   task** or when **wrapping up meaningful work**. A short in-sync lag between a commit and the
   next snapshot refresh is expected and is not an error; the repository (§1.2) remains
   authoritative throughout.
5. Record significant implementation changes, decisions, test results and validation evidence **at
   summary level, pointing to the owning document (§1.5) for the detail**.
6. Update subsystem status (§5) and the backlog (§8) so they reflect the actual outcome.
7. Record unresolved questions (§9) rather than silently making assumptions.
8. **Record commit hashes only after commits actually exist.** Never claim a change was committed
   when it was not. If work is uncommitted, say so explicitly.
9. Re-read the document for contradictions and stale statements after updating it.
10. Verify the final document accurately describes the repository and the work performed.

**Evidence discipline (§3.6, §6).** Every recorded claim must carry its evidence class: confirmed
in-game observation `[GAME]`, source/tooltip evidence `[SOURCE]`, automated test `[TEST]`,
mathematical check `[MATH]`, shared-mechanism validation `[SHARED]`, inference `[INFER]`, or
unresolved `[UNKNOWN]` (§6 legend). **Never promote an inference to a confirmed fact.** If a claim's
class is unclear, record the weaker (more conservative) class and note why it is unclear.

**Concise and current — update in place, do not append duplicates.** Revise the existing section
that describes the thing that changed. Do **not** add a second copy of a fact, a second history
entry for the same work, or a "new" section that restates an existing one. Preserve decision
history that is still useful (why a decision was made, what was ruled out) — but a superseded
statement should be **corrected or replaced in place**, with a short note that it changed, not left
standing beside its replacement. The document must not grow without bound: it is a current record
plus the decision history that still helps, not a transcript.

**Summarize and point; do not duplicate the owning documents (§1.5).** Record the outcome, the
decision, and **where the detail lives** — link to `docs/research.md`, `docs/validation-checklist.md`,
`docs/architecture.md`, the schemas, the code, or the tests rather than copying their content here.
Keeping a full specification or test record here duplicates an owner and creates two sources that
will drift apart. The owning document must still be updated whenever its subject changes; updating
this file is never a substitute for that.

**End-of-task report.** At the end of every task, report **whether `docs/project.md` was updated
and exactly which sections changed**. If no update was needed, say so and briefly why (which
trigger lines above did not fire). This keeps the document's upkeep visible instead of silent.

### 1.5 Documentation ownership map — this file does NOT own these details

`docs/project.md` is a **navigator and continuity record**. The documents below **own** their
subjects: when their subject changes, update **them** (as well as this file's summary/pointer).
Do **not** treat this file as their replacement, and do **not** copy their content here.

| Document | Owns |
|---|---|
| `docs/research.md` | **Authority** for mechanics and in-game evidence; the uncertainty register (U-IDs) and the in-game test plan |
| `docs/validation-checklist.md` | **Authority** for validation status, the three validation states, the source hierarchy, and the claim-level evidence tables |
| `docs/architecture.md` | Layers, module breakdown, damage pipeline, turn loop, APL record, attachment architecture |
| `docs/schemas.md` | Data schemas / shapes |
| `docs/grid.md` | Grid and positioning rules |
| `ui/docs/ui.md` | UI architecture, panels, IPC, deferred UI scope |
| `ui/docs/assets.md` | Asset infrastructure, path contract, ownership rules, supplied-file inventory |
| `src/data/**` + `src/engine/**` | The authoritative behavior itself (code is the source of truth for code state) |
| `src/test/**`, `ui/test/**` | The executable evidence for the claims this file summarizes |

**Division of labor:** this file records *what changed, what is decided, what is open, and where to
look*; the owning document records *the detail of its subject*. A change that alters a mechanic's
evidence goes in `docs/research.md` / `docs/validation-checklist.md` **and** is summarized here; a
new formula derivation goes in the owning design document **and** is summarized here. Never the
summary alone.

---

## 2. Current Project State

**Snapshot verified:** 2026-10-09 (this session). Treat as a dated snapshot — re-verify per §1.2.

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `5e3911af1766be16a1bce1222e48947f03683385` |
| `origin/main` | `5e3911af1766be16a1bce1222e48947f03683385` (in sync) |
| Working tree | in progress: **V4 slice 4 — the `ownActionStart` tick (IMPLEMENTED)** — **uncommitted** (§7.1 item 14) |
| Untracked | `.reasonix/` (host-managed session artifacts — **never stage**) and `src/test/start-of-action-tick.test.ts` |
| Engine build | `npm run build` → exit 0 |
| Engine tests | **709 pass · 0 fail · 0 skipped** across **100 test files** |
| UI typecheck | exit 0 |
| UI tests | **286 pass · 0 fail** |
| UI build | exit 0 |
| `git diff --check` | clean |

### 2.1 Known discrepancies

- **Test-count inflation from a dirty `dist/` (resolved this session).** The prior handout
  recorded "97 files · 673 pass". That figure came from a `dist/` containing **two stale compiled
  artifacts with no sources** — `dist/test/dbg-fk3.test.js` and `dist/test/dbg-v2.test.js` (the
  latter literally `test("debug v2", …)`). They are gitignored, untracked, and disappear on a
  clean rebuild. `src/` has **95** `.test.ts`; a clean rebuild runs **95 files / 671 tests**. The
  correct figure is **671**, not 673.
- **`docs/architecture.md`, `ui/docs/ui.md` and `ui/docs/assets.md`** were corrected in commit
  `8d8ef61` (see §7) — the snapshot above reflects the corrected versions.

### 2.2 Re-verification procedure

```powershell
git rev-parse HEAD; git status --porcelain
git ls-remote origin refs/heads/main
$env:PATH = "$env:LOCALAPPDATA\gfl2-sim\node;$env:PATH"
npm.cmd run build; npm.cmd run test
cd ui; npm.cmd run typecheck; npm.cmd run test; npm.cmd run build
```

If a test count differs from §2, suspect a dirty `dist/` first: `Remove-Item -Recurse -Force dist`
then re-run.

---

## 3. Architecture and Engineering Rules

### 3.1 What this project is

A **data-driven combat simulator / DPS calculator** for *Girls' Frontline 2: Exilium*. The
current MVP target is **Qiongjiu vs a stationary training dummy** (always No Cover). The
simulation is deterministic and seeded: same inputs + same seed ⇒ identical results.

### 3.2 Layers

Per `docs/architecture.md` §2:

```
model   src/model/types.ts, src/model/runtime.ts, src/model/grid.ts  — typed data shapes only, no logic
data    src/data/*.ts                                                — game data as typed constants
engine  src/engine/*.ts                                              — resolution + simulation, data-driven
facade  src/simulate.ts, src/cli.ts                                  — scenario in, results out
ui      ui/src/**                                                    — Electron + React debug client
tests   src/test/*.test.ts (engine), ui/test/*.test.ts (UI)
```

**Data flow:** `CharacterDef` / `WeaponDef` / `StatusDef` / … (data) →
`createState(scenario, registry, warnings)` resolves every permanent stat source and equipment
into `UnitState` → `simulate()` runs the deterministic round loop → `SimulationResult` (totals,
`byCharacter`, `bySource`, `log`, `warnings`).

### 3.3 Important source directories and files

| Path | Role |
|---|---|
| `src/model/types.ts` | All data shapes (the largest surface — ~80 KB). The type unions are the behavior catalog. |
| `src/model/runtime.ts` | `LogEvent`, `SimulationResult`, `ResolvedConfig` |
| `src/model/grid.ts` | Grid config types |
| `src/engine/state.ts` | `createState`, `computePanel`, `makeDoll`, gating contracts (**~54 KB**) |
| `src/engine/simulation.ts` | The round loop, `dealDamageHit`, support attacks (**~70 KB**) |
| `src/engine/damage.ts` | `rollHit` — the ONLY damage code path |
| `src/engine/statuses.ts` | Generic status engine (`applyStatus`, `tickStatuses`, `cleanseDispellable`) |
| `src/engine/stability.ts` | Stability damage, break/Expose, recovery |
| `src/engine/remolder.ts` | Pattern Remolder resolution (`resolveRemolderUnit`/`resolveRemolderTeam`) |
| `src/engine/apex.ts` | Apex Chassis resolution + consumption |
| `src/engine/attachment-sets.ts` | Attachment-set gate evaluation + dealt bonus |
| `src/engine/cooldowns.ts`, `resources.ts`, `rng.ts`, `grid.ts`, `stats.ts` | Cooldowns, Confectance, seeded RNG, grid geometry, `finalStat` |
| `src/data/registry.ts` | The single addition point for a character |
| `docs/research.md` | **Authority** for mechanics + in-game evidence (~161 KB) |
| `docs/validation-checklist.md` | **Authority** for validation status + evidence states (~84 KB) |
| `docs/schemas.md`, `docs/grid.md`, `docs/architecture.md` | Design record |
| `docs/dolls/<charId>.md` | **Per-doll source record** — authoritative source transcription for one doll (established with `docs/dolls/vector.md`, 2026) |
| `ui/docs/ui.md`, `ui/docs/assets.md` | UI architecture + asset infrastructure |

### 3.4 Architectural invariants

1. **Data-driven combat.** Character behavior lives in game data. The engine interprets effects
   generically — there are **zero character-id conditionals in `src/engine/`** (verified: no
   `id === "…"` checks). Adding a character is a data file + **one entry** in
   `src/data/registry.ts`.
2. **Engine ⊥ UI.** The engine is a pure library (`state in → actions → state out`). The renderer
   must not import or execute `src/engine/*`; it goes through a narrow typed `window.sim` IPC
   bridge, with the Electron main process owning the session.
3. **ONE panel path.** `computePanel` (`src/engine/state.ts`) + `finalStat`
   (`src/engine/stats.ts`):
   ```
   Final Stat = ceil((Initial + Flat) × (1 + Stat%))
   ```
   **Every** flat source (character base, weapon, Dispatch, Remolder flat, Neural Helix, Affinity
   flat, attachments, Cooking Stats) sums into ONE flat bucket **before** the percentage multiply.
   There is no second stat system.
4. **ONE damage path.** `rollHit` (`src/engine/damage.ts`) is the only damage code path;
   `dealDamageHit` (`src/engine/simulation.ts`) is its only caller for attacks.
5. **ONE additive DMG% bucket.** All damage-increase modifiers are **additive within the same
   bucket** (`addDealt`). There is no separate bucket for any of them.
6. **Explicit state and determinism.** One injected seeded RNG is the only randomness source.
7. **Config over constants.** Any value research could not confirm is a scenario/config key with a
   documented default, never a magic constant in engine code.
8. **Accuracy-first.** Features are added only when they can be validated. Out-of-scope mechanics
   are not modeled (see §9).

### 3.5 Mandatory workflow

**Evidence → Document → Test → In-Game Validation → Implement → Commit.**

This applies to **every** task, in full. The `Document` step covers **both** the owning documents
(§1.5 — e.g. `docs/research.md`, `docs/validation-checklist.md`, `docs/architecture.md`) **and** the
continuity summary in this file; it is never satisfied by one alone. Where a step genuinely does not
apply (for example, in-game validation for a documentation-only change), say so explicitly instead
of silently skipping it. Maintaining `docs/project.md` is an **additional** requirement (§1.1) — it
never replaces this workflow, the owning documents, or any existing project practice.

### 3.6 Validation states (exactly three)

Per `docs/validation-checklist.md` "Project-wide validation standard":

- **`Validated`** — directly tested in-game under controlled conditions. Tooltips, code,
  plausibility, or a passing unit test do **NOT** make something Validated.
- **`Mathematically Proven`** — uniquely established by already-validated mechanics + authoritative
  data + a reproducible derivation that **excludes plausible alternatives**. Must reference its
  derivation. If two models predict the same number, it stays `Not Tested`.
- **`Not Tested`** — everything else. **A legitimate state, not a failure.**

**Source hierarchy (6 levels, adopted 2026):** 1 direct user-provided in-game evidence ·
2 direct in-game testing · 3 mathematically derived conclusions · 4 repository implementation ·
5 secondary/community sources · 6 assumptions. **The absence of a gameplay test does NOT invalidate
an explicit source fact.**

**Rank-inheritance rule:** generic behavior established for one rank is inherited by other ranks
unless the source explicitly differs, the effect structure differs, a rank-specific value needs
its own validation, or contradictory evidence exists. Do not re-test identical generic behavior
per rank.

### 3.7 The damage formula (authoritative)

```
Damage = base DMG × defense coefficient × (1 + DMG%) × CDMG × (1 + weakness)
         × (1 − stability and cover DMG reduction) × (1 − final DMG reduction)
```

In engine terms (`docs/architecture.md` §6, `docs/research.md` §3.1):

```
raw        = finalATK × skill.multiplier
mitigated  = raw × finalATK/(finalATK + finalDEF)     ≡ ATK/(1+DEF/ATK)
bonus      = 1 + Σ additive bonuses                    (ONE bracket)
phase      = 1.0 always                                (NO elemental counter wheel — corrected 2026)
weakness   = 1 + 0.10 × (# exploited weaknesses)       (additive across weaknesses; separate factor)
reduction  = (1 − stabilityReduction) × (1 − damageReduction)   (stabilityReduction is Cover-deferred → 1.0)
crit       = rng.roll(effCritRate) ? (1 + effCritDmg) : 1.0     (crit applies to the UNROUNDED product)
final      = ceil( mitigated × bonus × phase × weakness × reduction × crit )
fixed      = ceil(absolute fixed component)            (post-chain, own ceil — never scaled by the chain)
total      = normalChainFinal + fixed
```

**Damage-modifier rule (authoritative):** all damage-increase modifiers are **additive within the
same DMG% bucket** — including No-Cover damage, Support Action damage increases, Out-of-Turn
Damage, Attachment Set bonuses, Common Key secondary effects, Apex secondary effects, and
Remolder dealt bonuses. There is no separate bucket for these.

**Stat-bucket rule:** flat sources are added BEFORE the percentage multiply; `Boost (%)`-style
stats enter the percentage buckets. One formula, no parallel stat systems.

**Crit (U1/U19, validated in-game):** multiplier = `1 + Crit DMG`, linear (×1.20 at 120%, ×1.235
at 123.5%), applied to unrounded damage before the final ceil. Effective Crit Rate caps at 100%;
overflow is discarded unless a character's own passive converts it (ratio 1:1 confirmed).

**Fixed damage (U21, validated in-game):** post-chain with its own ceil; bypasses DEF, crit,
the additive bracket, phase, weakness, and ordinary damage reduction. Final DMG Reduction and
Fixed DMG Buff **DO** apply to it:
`fixed = ceil(scaling × (1 + Σ applier Fixed DMG Buffs) × (1 − Σ holder Final DMG Reduction))`.

### 3.8 Shared mechanisms to REUSE (do not build parallels)

| Mechanism | Where | Note |
|---|---|---|
| ONE panel path | `computePanel` (`src/engine/state.ts` ~l.194) | all flat sources → one bucket, before percentages |
| Damage pipeline | `dealDamageHit` (`simulation.ts`), `rollHit` (`damage.ts`) | the ONLY damage path |
| Additive DMG% bucket | `addDealt` inside `dealDamageHit` | every damage-increase modifier is additive here |
| Status system | `src/engine/statuses.ts` | generic; data-driven effects |
| Effect provenance | `LogEvent.appliedSources` / `effectSources` / `effectSourceRefs`; `abilitySourceLabel` / `passiveSourceLabel` | labels must derive from data, never literals |
| Remolder resolution | `resolveRemolderUnit` / `resolveRemolderTeam` (`src/engine/remolder.ts`) | UI preview reuses this |
| Apex resolution | `src/engine/apex.ts` | account-wide, scenario-level |
| Attachment sets | `src/engine/attachment-sets.ts` | `attachmentSetGatesMatch`, `attachmentSetDealtBonus` |

### 3.9 Gating contracts (permanent stat sources)

Two explicit, tested boundaries control whether permanent sources apply:

- **`applyDispatchStats: false`** — marks a member a **controlled math fixture**. It excludes ALL
  permanent global/character sources (Dispatch, Remolder flats, Neural Helix, Affinity flat,
  Cooking Stats). Test-only; production scenarios never set it.
- **`overridesAuthoritative: true`** (Debug Mode) — makes each supplied `baseStatOverrides` stat
  **authoritative**, suppressing other permanent sources **on that stat only**. Set only at the
  Debug→scenario boundary.

### 3.10 Testing conventions

- `node:test` + `node:assert/strict`. Engine tests live in `src/test/*.test.ts`; UI tests in
  `ui/test/*.test.ts`.
- **Expected numbers come only from in-game observation or confirmed formulas** — never invented.
  Where a value is UNKNOWN, tests assert the **config slot is honored**, not an invented number.
- Validation tests mirror `docs/research.md` §4/§5 as a fixture table, and document the
  arithmetic in comments (inputs → expected → observed).
- Determinism is asserted (same inputs ⇒ identical log).
- There are **no TODO/FIXME/HACK/XXX markers** in `src/` or `ui/src/`, and **no `try/catch` in the
  engine** (no swallowed errors, no error-masking `??` defaults).

---

## 4. Established Decisions and Confirmed Mechanics

Settled decisions are recorded here so future sessions do not reopen them. "Settled" means the
project owner decided, or evidence resolved it — it does not always mean `Validated` (§3.6).

### 4.1 Project-wide decisions

| # | Decision | Basis |
|---|---|---|
| D1 | **TypeScript on Node ≥ 22** is the implementation language/runtime. | Settled (`docs/architecture.md` §11 item 1); `package.json` `engines`, `tsc` build |
| D2 | **Qiongjiu is the primary implemented/validation character.** | Settled (`docs/architecture.md` §11 item 2); `src/data/qiongjiu.ts`, `registry.ts` |
| D3 | **User-defined fixed rotation** is the sim mode; auto-battle APL replication is OUT of MVP scope. | Settled (`docs/architecture.md` §11 item 3); `pickAction` in `simulation.ts`. There is **no `apl` module** — the APL section is historical design only. |
| D4 | **No Cover in the MVP** — the target is always No Cover; cover reductions and the stability-cover 60% reduction are recorded but never modeled. | `docs/architecture.md` §1.7, `validation-checklist.md` §2 |
| D5 | **Stability + Exposed are mandatory mechanics.** | same |
| D6 | **No elemental counter wheel exists** (corrected 2026). `phaseMultiplier` is structurally present but always 1.0. | `docs/research.md` §3.4 |
| D7 | **Engine contains no character-id conditionals.** | verified in `src/engine/` |
| D8 | **Max-stat attachments only**; no rolls/ranges/rarity modeled. | `docs/research.md` §3.19 |
| D9 | **Exactly ONE active Attachment Set per character** — sets cannot coexist or stack. | §3.19; selection is loadout-level, never inferred from stats |
| D10 | **Weapons are reusable definitions**, equipped via `ScenarioTeamMember.weaponId` (1 slot); not embedded in `CharacterDef`. | `src/data/weapons.ts` header |
| D11 | **Common Keys are reusable registry definitions** (not embedded per character); 3 slots max; only slot #0 is hardcoded, the rest are player-chosen. | `src/data/common-keys.ts` |
| D12 | **Apex Chassis is scenario-level (account-wide)** — one chassis serves the whole team; up to 2 components, at most one per type. | `src/engine/apex.ts` |
| D13 | **Apex scope is limited to the Apex Chassis** — the rest of Heavy Ordnance Corps is NOT modeled. | user-directed scope |
| D14 | **All-Element Boost is recorded but INERT** — it only acts through the unmodeled RES system. | `src/engine/apex.ts` |
| D15 | **Awakening/alignment uses the Lv9 representation** for the in-game Lv6 unlock state. | `types.ts` `AffinityLevelStats` doc |
| D16 | **`scene`/`Pass` is not a feature**; `roundOrder` must be a full permutation. | `Scenario.roundOrder` doc |
| D17 | **The 7 complex Attachment Sets stay INERT** until their gates become engine-evaluable; each is its own evidence step. | `docs/research.md` §4 U22 |
| D18 | **Do not re-run validation** already covered by a shared mechanism (P1 attachment folding, the additive DMG% bucket, the element-boost family). | `validation-checklist.md` §"anti-patterns"/precedent |

### 4.2 Settled mechanics (resolved unknowns)

All U-IDs are from `docs/research.md` §4. Statuses below are the resolved ones:

| U | Resolution |
|---|---|
| U1 | Crit multiplier = Crit DMG stat (×1.20 at 120%), applied to unrounded damage. **Resolved (in-game).** |
| U2 | Glancing (擦伤) — **REMOVED** (beta artifact). Not a live mechanic. |
| U3 | **No universal Exposed/Broken damage multiplier exists.** `exposedDamageMult` removed from the engine. |
| U4 | Exposed window = fixed 2-turn recovery (broken through N/N+1, restored at START N+2). Non-configurable. |
| U5 | Boss-specific stability-conditional passives: −80% taken while stability > 0 → ×0.20. Generic, data-driven via `DummyConfig.passives`. |
| U6 | Stability recovery = exactly 2 turns after break, restored to max. (`STABILITY_RECOVERY_DELAY = 2`) |
| U7 | Normal timed buffs tick at the **recipient's action end**; self-applied buffs tick at the end of the same casting action. |
| U8 | Same-tier reapply **refreshes duration, does not stack**. |
| U9 | Confectance: battle start **3**, max **6**, +1 per damage event, ultimate cost 3. |
| U10 | **No generic Confectance damage bonus** — DISPROVEN. Confectance is a pure resource. |
| U11 | Cooldown: CD-N waits N full turns after the cast turn (`nextOwnTurnEnd`). |
| U14 | Target DEF is per-target data; current tested boss displays **5,001**. No universal boss DEF. |
| U15 | Weakness: matched-count rule (1 → ×1.10, 2 → ×1.20, additive); partial-match confirmed; Phase weakness = ×1.10; weakness stability damage = base + 2 × #exploited. |
| U17 | "Resonance" phase extension — **REMOVED** (premise invalid; tied to the nonexistent counter wheel). |
| U19 | CDMG linearity confirmed; Crit Rate caps at 100%, overflow converts 1:1 only via a character passive. |
| U20 | Weakness factor is **additive across weaknesses** (`1 + 0.10 × count`); multiplicative ×1.21 ruled out. |
| U21 | Fixed Damage is post-chain with its own ceil; Final DMG Reduction + Fixed DMG Buff apply; ordinary reduction/weakness/additive bracket bypassed. DEF-scaling (Winter's Wrath) and damage-dealt-scaling (Negative Charge) validated. |
| U22 | Attachment structure/config/set model/stats confirmed; 8 sets implemented + validated; 7 inert. |

**Still open:** U12 (auto-battle AI — out of scope), U13 (live level cap data), U16 (element DoTs
for unverified elements), U18 ("Nixie/交换机" term — needs user clarification, not code), and the
Apex secondary-effect scaling question (§9.1).

---

## 5. System Inventory

Status legend: **Impl** = implemented; **Ev** = best available evidence level per §3.6;
**Val** = in-game validation state. Only systems that exist in the repository are listed — no
scope is invented or expanded.

### 5.1 Core engine

| System | Files | Impl | Ev / Val | Notes |
|---|---|---|---|---|
| Damage pipeline + buckets | `engine/simulation.ts`, `engine/damage.ts` | yes | **Validated** (in-game, reproduced) | the only damage path |
| Defense term | `engine/damage.ts` | yes | **Validated** | `ATK/(1+DEF/ATK)`; boss DEF 5,001 data |
| Crit (rate/cap/overflow, CDMG linear) | `engine/simulation.ts`, `damage.ts` | yes | **Validated** (U19) | `1 + critDmg`, unrounded, 100% CR cap |
| Weakness exploit | `damage.ts`, `state.ts` | yes | **Validated** | `1 + 0.10 × n`, +2 stab each |
| Fixed damage | `damage.ts`, `statuses.ts` | yes | **Validated** | post-chain, own ceil |
| Stability / break / Exposed / recovery | `engine/stability.ts` | yes | **Validated** (timing) | 2-turn recovery |
| Status system (durations, stacks, replace/block, cleanse) | `engine/statuses.ts` | yes | **Validated** (multiple) | generic; 28 status ids in `data/statuses.ts` |
| Cooldowns | `engine/cooldowns.ts` | yes | **Validated** (U11) | `nextOwnTurnEnd` |
| Confectance | `engine/resources.ts` | yes | **Validated** (U9) | start 3 / max 6; **extra-slot pool is SEPARATE** (never raises the cap) |
| Turn-start Confectance drain (+ extra slots) | `simulation.ts`, `resources.ts`, `statuses.ts`, `model/types.ts` | yes | **[GAME]** (mechanic, user-provided 2026-10-09) + `[TEST]` (8 tests) | generic `turn_start_confectance_drain`; a second extra-slot pool; round-scoped ATK% folded into the existing in-combat ATK% bucket. **NOT in-game validated.** |
| Extra Command (extra main actions) | `model/types.ts`, `data/statuses.ts`, `simulation.ts` | yes | **[GAME]** (semantics, user-provided 2026-10-09) + `[TEST]` (6 tests) | generic `extra_action` status effect + the `extra_command` status + an action loop (`actionBudget`); no move in an extra action; tick once per unit-turn. **NOT in-game validated.** |
| Apathetic Resistance (Crit DMG buff) | `model/types.ts`, `engine/statuses.ts`, `engine/simulation.ts`, `data/statuses.ts` | yes | **[SOURCE]** (values) + `[TEST]` (7 tests) | `critDmg` added to the `stat_modifier` stat union; read through the ONE `statModifier` path into the confirmed `1 + Crit DMG` multiplier; crit stats stay continuous. **NOT in-game validated.** |
| Per-element damage gate (`whenElement`) | `model/types.ts`, `engine/statuses.ts` | yes | `[TEST]` (9 tests) | an OR-list (`null` = phase-less) on `damage_modifier`, honored on DEALT + TAKEN and both modes, so it is never silently ignored. Same semantics as the attachment-set / Remolder element gates. **Engine vocabulary, not a game mechanic.** |
| Start-of-action status tick (`ownActionStart`) | `model/types.ts`, `engine/statuses.ts`, `engine/simulation.ts` | yes | **[GAME]** (ordering, user-provided 2026-10-09) + `[TEST]` (8 tests) | a THIRD `tickAt` point: turn starts → effect fires → the unit acts. Fired for team units AND the dummy's pass-turn (target-side debuffs). `tickStatuses` generalized to match the declared point directly. **NOT in-game validated.** |
| Determinism / seeded RNG | `engine/rng.ts` | yes | engine guarantee | `determinism.test.ts` |
| Effect provenance | `simulation.ts`, `state.ts`, `model/runtime.ts` | yes | **Validated** | `effectSources` + `effectSourceRefs` |
| Grid / positioning (core) | `engine/grid.ts`, `docs/grid.md` | yes (core) | **Validated** (core rules only) | height interaction Not Tested; **elemental tiles NOT modeled** (Burn family documented in `docs/research.md` §3.23) |
| Turn loop / round order | `engine/simulation.ts` | yes | engine guarantee | `roundOrder` full permutation |

### 5.2 Character, stats and permanent sources

| System | Files | Impl | Ev / Val | Notes |
|---|---|---|---|---|
| Qiongjiu kit (skills, keys, passive) | `data/qiongjiu.ts` | yes | **Validated** (multiple) | base HP 1893/ATK 802/DEF 528/Stab 9/CR 20%/CDMG +20% |
| Common Keys (player-chosen stats) | `data/common-keys.ts`, `engine/state.ts` | yes + UI | **Validated** | 3 slots; slot #0 fixed |
| Golden Melody (weapon) | `data/weapons.ts` | yes | **Validated** (charging/imprint/trait) | calibration changes ONLY the Effect |
| Neural Helix | `data/neural-helix.ts` | yes | **Validated** | universal `NEURAL_HELIX_GLOBAL_PCT = 0.12` + per-character |
| Affinity (own + foreign) | `data/qiongjiu.ts`, `engine/state.ts` | yes | **Validated** | own key levels exact only; foreign = +3% |
| Affinity-Level flat/pct stats | `types.ts`, `engine/state.ts` | yes | **Validated** | Lv5 none; Lv9 +5% |
| Dispatch stat buffs | `data/dispatch.ts` | yes | **Validated** | by class; Sentinel +231/+519/+222 |
| Pattern Remolder (engine) | `data/remolder.ts`, `engine/remolder.ts` | yes | **Validated** (requirements/effects) | Unity grants, set bonuses |
| Pattern Remolder (UI) | `ui/.../SetupScreen.tsx` | yes | E2E-verified | engine-computed preview |
| Permanent Cooking Stats | `data/cooking-stats.ts` | yes + UI | **VALIDATED — user's authority** | 15 ATK / 15 DEF / 30 HP; off by default |
| Base-stat overrides / Debug Mode | `engine/state.ts`, UI | yes | contract-tested | authoritative overrides |

### 5.3 Equipment and damage modifiers

| System | Files | Impl | Ev / Val | Notes |
|---|---|---|---|---|
| Attachments (stats + sets) | `data/attachments.ts`, `engine/attachment-sets.ts` | yes + UI | **Validated** (P1 full loadout; Burn Boost 2457) | max-stat only; 4 slots |
| Attachment Sets — 8 consumed | `data/attachment-sets.ts`, `engine/attachment-sets.ts` | yes | mixed (see §5.4) | Phase Strike, Freeze/Burn/Hydro/Corrosion Boost, Physical Boost, Tactical Calculus, Close Assault |
| Attachment Sets — 7 INERT | same | data only | **Not Tested** | gates not engine-evaluable |
| Apex Chassis | `data/apex-components.ts`, `engine/apex.ts` | yes + UI | **Guide-confirmed** + partial | 1 component recorded; scaling question open (§9.1) |
| Phase/elements + weakness matching | `damage.ts`, `attachment-sets.ts` | yes | **Validated** | 5 phase elements; no counter wheel |
| Ammo Weakness Upgrade | `state.ts`, `simulation.ts` | yes | **Validated** | separate from generic weakness |

### 5.4 The 8 implemented attachment sets (validation detail)

**Max stat values (RESOLVED 2026):** Attack **+72** · Attack Boost (%) **+11.4%** · Health **+162** ·
Health Boost (%) **+11.4%** · Defense **+48** · Defense Boost (%) **+11.4%** · Crit Rate **+15%** ·
Crit Damage (%) **+15%**. **MAX-STAT attachments only** — intermediate values are not modeled.

**Structure:** 4 slots (Muzzle / Sight / Foregrip / Underbarrel), each at most ONE user-configurable
configuration; an empty slot = no stats. **Per-slot max selected stats: Muzzle 4 / others 3.** Stats
must be unique within an attachment. **Muzzle is the only slot that can use Crit Damage.**

| Set | Value | Evidence |
|---|---|---|
| Burn Boost | +20%, element gate | **hard-checked in-game (2457)** |
| Freeze / Hydro / Corrosion Boost | +20%, element gate | shared mechanism (Burn Boost is the family's hard check) |
| Physical Boost | +20%, phase-less | shared mechanism |
| Close Assault | +12% unconditional / +24% melee → +36% melee | **developer-considered validated** (no in-game number) |
| Tactical Calculus | +25% | **resolved by in-game tooltip** (Support Attacks / Interceptions / Counterattacks / out-of-turn passive attacks); engine MVP consumes the **Support-Action path only** |
| Phase Strike | +15% vs a target carrying a status whose `StatusDef.phase` is non-null | **Validated** (control 1529 / test 2369) — only `overburn` → Burn is populated |

**7 inert sets** (their attachment-only gates are NOT engine-evaluable → `attachmentSetGatesMatch`
returns false, never unconditional): **Summon Boost** (`physicalSummonOnBattlefield`) · **Double
Strategy** (`targetNearCover`) · **Phase Resonance** (`phaseWeaknessCount` + Phase Boost undefined) ·
**Emergency Repair** (`allyFullHeal`) · **Ally Support** (`defenseSkill` + Area Defense II undefined) ·
**Shielded Recovery** (`hasShield`) · **Ultimate Pursuit** (Ultimate effect/stack infra).

**The deliberate validation decision (do not relitigate):** validate the **shared
stat-folding/aggregation mechanism** rather than demand a separate in-game screenshot for every
stat (P1 full loadout established it). Likewise no further per-element set tests — Burn Boost is
the family's hard check.

### 5.5 Facade, UI and distribution

| System | Files | Impl | Notes |
|---|---|---|---|
| Simulation API facade | `src/simulate.ts` | yes | `simulateScenario(scenario, registry)` |
| CLI | `src/cli.ts` | yes | `gfl2sim simulate <scenario.json> [--log]` |
| Desktop UI (Electron + React) | `ui/src/**` | yes | presentation client; one window; three debug panels (Grid, Combat Log, Rotation) |
| UI session / IPC | `ui/src/main/session.ts` | yes | narrow typed IPC; main owns the session |
| Asset infrastructure | `ui/src/shared/assets.ts`, `ui/.../AssetThumb.tsx` | yes | **33 known entities, 32 supplied files**; all but `qiongjiu_support` |
| Launcher / Node bootstrap | `ui/Launch Simulator.bat`, `ui/ensure-node.ps1` | yes | testers need no manual Node install |

**Wired asset categories:** `elements/` (7), `ammo/` (5), `remolder-categories/` (4), plus
character/skill/key/weapon assets consumed by the Setup screen. Manifest docs live in
`ui/docs/assets.md`.

### 5.6 Registry contents

| Kind | Entries |
|---|---|
| Characters | `qiongjiu`, `basic_attack_dummy` |
| Weapons | `jinshizou` (Golden Melody) |
| Common Keys | `qiongjiu_common_strategic_negotiation` (Strategic Negotiation) |
| Apex Components | `apex_firepower_reconstruction_iii` |
| Fixed Keys (Qiongjiu) | `fk1_concentration`, `fk2_efficient_planning`, `fk3_targeted_training`, `fk4_point_of_vulnerability`, `fk5_necessary_adjustments`, `fk6_steadiness` |
| Expansion Key | `qiongjiu_exp_ruined_gem` (Ruined Gem) |
| Affinity Key | `qiongjiu_affinity_warm_as_jade` (Warm as Jade) |
| Qiongjiu abilities | `qiongjiu_basic` (Fuse), `qiongjiu_common_rail`, `qiongjiu_guide_to_victory`, `qiongjiu_pressing_momentum`, `qiongjiu_support`, `qiongjiu_steady_plan` (passive) |

**This table describes the REGISTRY AS IMPLEMENTED.** Vector is **not** in it — her source record
exists (`docs/dolls/vector.md`) but no `CharacterDef`, registry entry, status, or weapon data has
been created. Do not read the per-doll doc as registry presence.

### 5.7 Per-doll source records (documented, NOT implemented)

| Doll | Record | Status |
|---|---|---|
| Vector | `docs/dolls/vector.md` | **SOURCE DATA ONLY** — kit, Fortification map, 9 keys, Remolder flats, signature weapon transcribed; **base stats resolved** (`[GAME]`: HP 1819 / ATK 748 / DEF 569 / Stab 10 / CR 20% / CDMG 120% / Move 6); **authoritative status/effect inventory in §7.1** (10 effects referenced, **4 exist / 6 missing**, with the exact capability gaps); **two statuses implemented** (`extra_command` §3.24, `apathetic_resistance` §3.25) — no registry/UI changes |

---

## 6. Evidence and Validation Record

Evidence classes used below (the legend for §1.4's evidence rule; distinct from the validation
states in §3.6):

- **[GAME]** — directly observed in-game (the strongest class).
- **[SOURCE]** — authoritative source/tooltip/screenshot (an authoritative input, NOT a
  validation state).
- **[TEST]** — verified by automated tests.
- **[MATH]** — mathematically derived / unique derivation.
- **[SHARED]** — validated through an already-validated shared mechanism.
- **[INFER]** — inferred (must be labeled).
- **[UNKNOWN]** — unresolved.

### 6.1 Qiongjiu permanent stat folding / panel ATK

**Inputs** [GAME] — in-game character sheet: HP **1893** · ATK **802** · DEF **528** ·
Stability **9** · Crit Rate **20%** · Crit DMG **+20%** (`critDmg 0.2`; multiplier = `1 + critDmg`).

Class sentinel → Dispatch flat ATK **+231** / HP **+519** / DEF **+222** [GAME].
`remolderFlat`: ATK **245** / HP **679** / DEF **224**. `neuralHelixStats`: ATK **196** / HP **333** /
DEF **92**, plus `atkPct` 10% and the universal **+12%**.
Affinity Lv.5 flat: ATK **115** / HP **292** / DEF **108** (cumulative Lv.1–5).

**Derivation** [TEST]/[MATH] (engine 1966 — asserted by test):

```
flat   = 802 + 22 + 231 + 245 + 196 + 115 = 1611     (the 22 is the +22 flat-ATK test weapon)
ATK%   = 10% (NH) + 12% (universal) = 22%
ceil(1611 × 1.22) = ceil(1965.42) = 1966  ✓
```

### 6.2 Full four-slot attachment loadout (P1) — IN-GAME VALIDATED

**Setup** [GAME]: Qiongjiu V6 · Affinity Lv.5 · test weapon **+22** flat ATK · all four slots.

| Slot | Stats |
|---|---|
| Muzzle | Attack +72 · Crit Rate +15% · Crit Damage +15% · Attack Boost +11.4% |
| Sight | Attack +72 · Crit Rate +15% · Attack Boost +11.4% |
| Foregrip | Attack +72 · Crit Rate +15% · Attack Boost +11.4% |
| Underbarrel | Attack +72 · Crit Rate +15% · Attack Boost +11.4% |

**Observed panel** [GAME]: ATK **3182.72** · DEF **1314.88** · HP **4161.92** · Stability **9.00** ·
Crit Rate **80.00%** · Crit DMG **135.00%**.

**Engine** [TEST]:

```
flat = 1611 + 72×4 = 1899
ATK% = 22% + 11.4%×4 = 67.6%
ceil(1899 × 1.676) = ceil(3182.724) = 3183   (engine integer; observed display 3182.72) ✓
critRate = 20% + 15%×4 = 80% ✓ ; critDmg = 20% + 15% = 35% → displayed 135% ✓
3183 − 1966 = +1217 panel ATK from the loadout ✓
```

**Proves:** 4 coexisting slots, multi-stat slots, cross-slot aggregation, flat+% folding,
Crit Rate/Crit DMG aggregation, and folding with ALL permanent systems.
**Does NOT prove:** HP/HP%/DEF/DEF% individually (covered by the shared mechanism) and
**does NOT validate Burn Boost damage** (separate 2457 test). Pinned by
`src/test/attachment-full-loadout-validation.test.ts`.

### 6.3 Burn Boost — IN-GAME VALIDATED (the family's only hard check)

`ATK 2898 · DEF 5000 · Burn weakness ×1.10 · Common Rail Lv.2 150% ATK · No-Cover +20% · Burn Boost +20%`

```
2898 × 1.5 × (2898/(2898+5000)) × 1.40 × 1.10
= 2898 × 1.5 × 0.36694… × 1.40 × 1.10 = 2456.36 → ceil = 2457   (observed 2457) ✓
```

Proves Burn Boost's +20% is **additive in the DMG% bucket alongside No-Cover**. The
Freeze/Hydro/Corrosion/Physical Boost family shares the identical mechanism → **[SHARED]**;
no further per-element tests planned.

### 6.4 Phase Strike — IN-GAME VALIDATED (control + test)

`ATK 2388 · DEF 5000 · Burn weakness +10% · Common Rail Lv.2 150% (Burn) · No-Cover +20%`

- **Control (Burn WEAKNESS but NO Burn debuff):**
  `2388 × 1.5 × (2388/7388) × 1.20 × 1.10 = 1528.29 → 1529` — Phase Strike did **NOT** apply ✓
- **Test (target carries `overburn` + Damage Up II), crit:**
  bucket `1.20 No-Cover + 0.20 DU2 + 0.15 Phase Strike = 1.55`; crit ×1.20
  `2388 × 1.5 × (2388/7388) × 1.55 × 1.20 × 1.10 = 2369.0 → 2369` ✓

Proves: Burn weakness alone does NOT trigger Phase Strike; an **active Burn debuff DOES**; the
+15% is **additive** in the existing bucket.

### 6.5 Other pinned in-game numbers (each reproduced exactly) [GAME]

| Case | Arithmetic | Result |
|---|---|---|
| Strategic Negotiation +7% out-of-turn | `ATK 2082 · 90% · DEF 5000 · bucket 0.20+0.20+0.17 = 1.57` → `550.8686 × 1.57` | **865** |
| Ruined Gem (Support → Burn, +15% vs Overburn) | `ATK 2000 · 90% · DEF 5000 · bucket 0.20+0.20+0.10+0.15 = 1.65 · Burn ×1.10` | **934** |
| Support Boost II +30% | `514.2857 × 2.00` | **1029** |
| Support Boost II no-Exposed contrast | — | **978** |
| FK5 Common Rail + Burn weakness | `ATK 2000 → Blazing Assault II +15% → 2300 · 150% · DEF 5000 · 1.20 No-Cover · Burn ×1.10` | **1435** |
| Overburn (3 ticks) | applier-ATK 10% each, `198 + 198 + 198` | **594** |
| Ammo Weakness Upgrade | Qiongjiu Basic non-crit progression + Burn+Ammo Phase control | 616/636/665/704 · 1191×3, 1470 crit |
| Support Boost I | one buff instance, two support-scoped effects | **883** / **538** |
| Guide to Victory Lv1 | `ATK 1962/1967/1985 · 110% · DEF 5000 · 1.20 · Burn ×1.10` | **803 / 807 / 820** |
| Crit validation (basic) | `ATK 1958 · 80% · DEF 5000 · 1.20` → normal/crit | **529 / 635** |
| Crit ordering control | ATK 1956 discriminates `ceil(529×1.2)=635` vs observed | **634** |
| CDMG linearity | ATK 1958, CDMG 123.5% | **654** |
| Weakness (Burn) | `ATK 1958 · 150% · 1.20 · Burn ×1.10` → normal / crit | **1091 / 1310** |
| Two weaknesses | Burn + Medium ammo → ×1.20 (multiplicative ×1.21 → 1201 ruled out) | **1191** |
| Fixed damage final-DMG chain | `1931×0.10×0.40 → 78`; `3471×0.10×1.10×0.40 → 153` | **78 / 153** |
| DEF-scaling fixed (Winter's Wrath Lv.1) | `ceil(source DEF 1489 × 0.50)` | **745** |
| Damage-dealt-scaling fixed (Negative Charge) | `ceil(383×0.30)=115`, `ceil(666×0.30)=200` | **115 / 200** |

### 6.6 Apex Chassis — recorded component + open question

**Recorded component** [SOURCE] (the only one with data): "Elevation — Firepower Reconstruction",
**Tier III** → Attack Boost +2.5% · Health Boost +2.5% · Defense Boost +2.5% · All-Element Boost +75,
plus secondary *"Firepower Reconstruction III"* (Lv.1): *"Damage dealt by AR Dolls is increased by
5%. If an attack exploits a weakness, damage dealt is increased by 7%."*

**Enhancement** [SOURCE]: Tier III ranges 2.5%→3.0% (+0.1% per enhancement) and 75→100 (+5);
Tier IV ranges 2.5%→3.5% (+0.2%) and 150→200 (+10). Both are exactly
`Enhance 1 + 5 × increment`, confirming **Enhance 1–6**. Observed [GAME] at Enhance 1 → **5% / 7%**.

**[UNKNOWN] — see §9.1:** the guide gives the secondary-effect values as **ranges**
(`{5-6.5}%` / `{7-12}%`) over "Tier III and IV forms {Enhance 1 – Enhance 6}". Reading **(a)** the
range spans Enhance 1–6 (values scale); **(b)** it spans drop variance (values fixed). The engine
implements **(b)** — fixed, does NOT scale — while the always-on stats DO scale. **This is a KNOWN
GAP pinned by a documented test** (`apex-chassis.test.ts`, "the recorded secondary-effect values do
NOT scale with enhancement"), not a validated rule.

### 6.7 Evidence that is deliberately NOT claimed

- **HP/HP%/DEF/DEF% attachment stats** — no individual screenshot; **[SHARED]** via the validated
  bucket/folding mechanism. No redundant per-stat screenshots required.
- **Per-element boost sets other than Burn** — **[SHARED]**; no further tests planned.
- **The 7 inert sets' mechanics** — **[UNKNOWN]**; must NOT be invented.
- **Support Action range = 8 tiles** — **[INFER]** explicit MVP modeling decision, NOT in-game
  validated; `range: 8` is declarative data with no engine consumer.
- **Grid height (High Ground → Ground = Exposed)** — implemented from confirmed rules but
  **[UNKNOWN]**/Not Tested in-game; do not claim as validated.
- **Apex secondary clauses in combat** — the *mechanism* is **[SHARED]**; a full combat
  re-derivation is NOT required.

---

## 7. Change History

Chronological record of meaningful completed work. Commit hashes are recorded **only where a
commit actually exists**.

### 7.1 This session (2026-10-09)

**Session scope:** new session bootstrapped from the external handout; orientation/audit; a
documentation-drift cleanup; establishment of this document; hardening its maintenance contract;
making explicit that this document is additional to — never a replacement for — the existing
workflow and owning documents.

| # | Work | Files | Verification | Commit |
|---|---|---|---|---|
| 1 | **Orientation audit** (no repository changes). Re-verified the handout against the repo: git state, engine build/tests, UI typecheck/tests/build, zero character-id conditionals, registry contents, no TODO markers, no engine `try/catch`. Found that the handout's "97 files · 673 pass" was inflated by two stale `dist/` artifacts (real: 95 files / 671 tests). | — | all suites green | — (read-only) |
| 2 | **Documentation-drift cleanup.** Corrected stale status labels and superseded-design claims after verifying each against the implementation. | `docs/architecture.md`, `ui/docs/assets.md`, `ui/docs/ui.md` | `git diff --check` clean; engine 671 pass; UI 286 pass; typecheck 0 | `8d8ef61` (pushed) |
| 3 | **Establish `docs/project.md`** (this document) — the permanent continuity record, its structure, and its maintenance contract. | `docs/project.md` | see §2 re-run; `git diff --check` | `98c4fab` (pushed) |
| 4 | **Harden the maintenance contract.** Added an explicit update-trigger list, the anti-duplication ("update in place") rule, the evidence-discipline rule, the end-of-task report requirement, and sharpened the "repository is authoritative if this document is stale" statement (§1.2/§1.4). Refreshed the §2 snapshot to the current HEAD and closed backlog item B2. | `docs/project.md` | `git diff --check` clean; no source/test change | `0670d2b` (pushed) |
| 5 | **Scope clarification: additional, not replacement.** Made explicit that maintaining this document is an ADDITIONAL requirement on top of existing duties — the full workflow (§3.5) and the owning documents still apply. Added §1.5 (documentation ownership map: which file owns which subject) and the `Document`-step clarification in §3.5; strengthened §1.1, §1.2 and §1.4 (rule 5 + a "summarize and point, do not duplicate" clause). No requirement removed or weakened. | `docs/project.md` | `git diff --check` clean; no source/test change; docs-only | `0670d2b` (pushed) |
| 6 | **Snapshot refresh** — corrected the three self-referential statements left stale by committing items 4–5 (§2 working-tree row, §7.1 commit columns, §10 open state) and recorded the no-per-commit-refresh policy in §1.4. | `docs/project.md` | `git diff --check` clean; docs-only | `ca21212` (pushed) |
| 7 | **Vector source record (documentation only).** Read Qiongjiu's `CharacterDef` to map the data schema, then transcribed Vector's kit from `dandegate.net/dolls/vector` into a new per-doll record. Verified each factual claim against the repo (status list, grid config, cooldown model, Confectance cap, `AffinityKeyDef`/`WeaponDef`/`imprint` shapes) and marked every gap as `[UNKNOWN]`/not-implemented rather than assuming. Downloaded 23 CDN assets and placed 19 into the asset tree (18 character + 1 weapon; **placed, not wired**). **Base stats then supplied by the user** (`[GAME]`: HP 1819 / ATK 748 / DEF 569 / Stab 10 / CR 20% / CDMG 120% / Move 6) and recorded — the one data blocker, resolved; the general fact "base Crit Rate is 20% for ALL characters" was recorded in its **owning** document `docs/research.md` §3.8. **Confectance >6 — RESOLVED [GAME]:** the user's earlier "might be a system allowing >6" hypothesis was then fully explained (2026-10-09): at **Fortification V5** Vector gains **2 Confectance slots SEPARATE from her normal 6**, and those extras are what her passive Lv.3 clause counts (+10%/+20% ATK). **U9's cap of 6 is unchanged** — the normal gauge never overflows; the engine must **not** raise `confectanceMax`. Recorded in `docs/dolls/vector.md` §4.5/§7 and `docs/research.md` §3.12. | `docs/dolls/vector.md` (new), `docs/research.md` §3.8 + §3.12, `ui/src/renderer/public/assets/characters/vector/**` (18), `ui/src/renderer/public/assets/weapons/banshees-whisper/**` (1), `docs/project.md` | claims verified by direct repo inspection; **no code/tests changed**; in-game validation **N/A** (docs-only) | `637bec5` (pushed) |
| 8 | **Elemental tiles (Burn family) documented (V3 prep).** Read the dandegate community guide "Elemental Tile Transformation" and recorded **Burn-related tiles only** in the mechanics doc: the Tile Upgrade / Polyphase Fusion layer, the base Burn tile (**Incineration → Flashover II → III**), and every Burn-containing fusion (**Scalding Vapors**, **Venomfire**, **Smoldering Suspire**, and the CN-only **Crackling Flare**) with their Lv2/Lv3 deltas. **Effect names independently resolved** from `dandegate.net/effects/<uuid>` records (10 uuids → names; only **Overburn** exists in this repo). Source is a **community guide (hierarchy level 5)**, labelled `[SOURCE]` / `Not Tested`; non-Burn tiles deliberately out of scope. **Nothing implemented.** | `docs/research.md` §3.23 (new), `docs/dolls/vector.md` (G1 cross-ref), `docs/project.md` | **no code/tests changed**; docs-only; in-game validation **N/A** | `629743e` (pushed) |
| 9 | **V2 — turn-start Confectance drain engine capability (IMPLEMENTED + TESTED).** Added the generic `turn_start_confectance_drain` `PassiveEffect` (`atkPct`, `extraSlots`, `perExtraSlotAtkPct`), a SECOND `extraConfectance` pool that `gainConfectance` fills from gains beyond `confectanceMax`, `drainAllConfectance`, and a turn-start trigger granting a round-scoped `UnitState.roundAtkPct` folded into the **existing** in-combat ATK% bucket (`statModifier`). **`confectanceMax` (U9 = 6) is UNCHANGED** — verified by a guard test. Semantics confirmed with the user: overflow fills the extras; clause 5 is additive on clause 4 → **+10/+20/+30% for 0/1/2 filled extras**; the drain consumes both pools. **No character ids anywhere.** | `src/model/types.ts`, `src/engine/resources.ts`, `src/engine/state.ts`, `src/engine/statuses.ts`, `src/engine/simulation.ts`, `src/test/confectance-drain.test.ts` (new), `docs/research.md` §3.12, `docs/dolls/vector.md`, `docs/project.md` | engine **679 pass / 0 fail** (+8 new); UI typecheck/tests/build green; **CLI output byte-identical** on `examples/qiongjiu-dummy.json` (no regression for existing characters); `git diff --check` clean | `437cee2` (pushed) |
| 10 | **V4 — status/effect inventory documented (evidence only).** Resolved **all 10** effect IDs Vector's kit references against the site's own effect records (`dandegate.net/effects/<uuid>`, `effectDetails` incl. every upgrade variant) and recorded the authoritative inventory in `docs/dolls/vector.md` **§7.1**: **2 exist** (`overburn`, `blazing_assault_ii`) / **8 missing**, each with its definition, tags, and upgrade variants. Classified the gaps: 6 reusable vocabulary additions, 3 genuinely new mechanics (one — extra actions — **out of MVP scope**), and the V3-coupled tile clauses. **Two record corrections recorded:** `Overheat Combustion` is a distinct Burn-debuff effect (resolves the V3-era ambiguity) and `Overheat` is a *third* distinct effect = **skill denial**. Design decision recorded with the user: add a **proper `whenElement`** gate to `damage_modifier` (not reuse `stack_tier_modifier`). **No code changed.** | `docs/dolls/vector.md` §7.1 + §7/G2 + §10, `docs/research.md` §3.23.6 (cross-ref), `docs/project.md` | **docs only — no code/tests changed**; `git diff --check` clean; in-game validation **N/A** | `cb2d0e1` (pushed) |
| 11 | **V4 slice 1 — Extra Command (IMPLEMENTED + TESTED).** Added the generic `extra_action` `StatusEffect` kind + the `extra_command` status (`category: "state"`) + an **action loop** in the turn loop driven by the previously-vestigial `UnitState.actionBudget`. Semantics confirmed with the user: the holder acts again in the same unit-turn (e.g. Ultimate → Skill 1/2 or Basic), **cannot move** during the extra action, **one extra action per stack**; the end-of-action tick runs **once**, after all actions. Data-driven — no character or skill ids. | `src/model/types.ts`, `src/data/statuses.ts`, `src/engine/simulation.ts`, `src/test/extra-command.test.ts` (new), `docs/research.md` §3.24 (new), `docs/dolls/vector.md`, `docs/validation-checklist.md`, `docs/project.md` | engine **685 pass / 0 fail** (+6 new); UI typecheck/tests/build green; **CLI output byte-identical**; `git diff --check` clean | `cb2d0e1` (pushed) |
| 12 | **V4 slice 2 — Apathetic Resistance (IMPLEMENTED + TESTED).** Added **`critDmg`** to the `stat_modifier` stat union, kept it **continuous** in `statModifier`, and routed `actor.critDmg` through that ONE path at the crit resolution site — so a Crit-DMG status enters the **confirmed** `1 + Crit DMG` multiplier (U1/U19) with no parallel crit path. Added the `apathetic_resistance` status (Crit DMG **+25%**, 2 turns, `purgeable: false` — the source states "cannot be cleansed"). Duration follows the in-game-**VALIDATED** U7 self-applied tick rule (inherited, not re-derived). | `src/model/types.ts`, `src/engine/statuses.ts`, `src/engine/simulation.ts`, `src/data/statuses.ts`, `src/test/apathetic-resistance.test.ts` (new), `docs/research.md` §3.10 + §3.25 (new), `docs/dolls/vector.md`, `docs/project.md` | engine **692 pass / 0 fail** (+7 new); UI typecheck/tests/build green; **CLI output byte-identical**; `git diff --check` clean; scratch probe file removed | `95717b0` (pushed) |
| 13 | **V4 slice 3 — per-element gate `whenElement` (IMPLEMENTED + TESTED).** Added the optional `whenElement?: (Element \| null)[]` field to the `damage_modifier` union member and consumed it in **three** places (`additiveDealtBonus`, `additiveTakenBonus`, `multiplicativeTakenMods`) so a declared gate is **never silently ignored** regardless of scope or mode. Semantics are the SAME OR-list as the existing attachment-set / Remolder element gates; `null` matches a phase-less hit. Motivated by Accelerant (Burn dmg *dealt* +10%) and Overheat Combustion V1 (Burn dmg *taken* +30%) — **neither status is implemented by this**; it supplies their element gate only. | `src/model/types.ts`, `src/engine/statuses.ts`, `src/test/element-gate.test.ts` (new), `docs/research.md` §3.26 (new), `docs/dolls/vector.md`, `docs/project.md` | engine **701 pass / 0 fail** (+9 new); UI typecheck/tests/build green; **CLI output byte-identical**; `git diff --check` clean | `5e3911a` (pushed) |
| 14 | **V4 slice 4 — start-of-action status tick `ownActionStart` (IMPLEMENTED + TESTED).** Added `"ownActionStart"` as a THIRD `tickAt` value (StatusDef + StatusOverride) and generalized `tickStatuses` to match the declared point directly (so a status fires at exactly ONE point). New handler `applyStartOfActionStatusEffects` (status-sourced fixed damage; `heal` deliberately excluded — it is an action-END effect). Fired at the holder's turn start **before movement and the action**, for team units AND the dummy's pass-turn (so target-side debuffs like Overheat Combustion tick). Ordering confirmed with the user: turn starts → effect → the unit acts. | `src/model/types.ts`, `src/engine/statuses.ts`, `src/engine/simulation.ts`, `src/test/start-of-action-tick.test.ts` (new), `docs/research.md` §3.27 (new) + U7 row, `docs/dolls/vector.md`, `docs/project.md` | engine **709 pass / 0 fail** (+8 new); UI typecheck/tests/build green; **CLI output byte-identical**; `git diff --check` clean | uncommitted (§10) |

**Detail — the documentation-drift cleanup (`8d8ef61`):** the task and its outcome are also
recorded here because future sessions should not re-fix them.

- `docs/architecture.md`
  - Title/status: "**Proposed** Architecture" + "proposal, awaiting approval" → `IMPLEMENTED (2026)`,
    retaining the document as the design record and naming the original wording. Historical context
    preserved, not rewritten.
  - §11: "Open decisions (user-owned, needed at implementation kickoff)" → "Kickoff decisions
    (SETTLED — recorded, no longer open)". Each item keeps its original wording with a
    **`→ SETTLED:`** clause citing the implementing file: TypeScript; Qiongjiu; user-defined fixed
    rotation.
  - §3 module table + §8: the `apl` module / APL interpreter is marked **NOT BUILT** (superseded by
    the fixed rotation). This was **found by inspection**, not in the original brief — the document
    claimed an `apl` module in the module breakdown while `src/engine/apl.ts` does not exist.
- `ui/docs/ui.md` — the "**244-test suite**" figure is a historical checkpoint, not the current
  count. It was **labeled as original wording with a pointer to `npm test`**, deliberately NOT
  replaced with another number that would re-drift on the next engine commit.
- `ui/docs/assets.md` — header said "No UI component renders images yet"; rendering is live via
  `AssetThumb` in the Setup screen, with `elements/`, `ammo/` and `remolder-categories/` wired. The
  implemented/unwired distinction was preserved (`qiongjiu_support` has no supplied file → intended
  fallback path). §7 repeated the same deferred-rendering claim; same correction. §6 counts
  (**33 known / 32 supplied**) were verified accurate and left unchanged.

**Remaining limitation of that work:** `docs/schemas.md` lines 1–3 also still read
"Proposed … proposal, awaiting approval". It was **out of the authorized scope** and already
carries a self-aware 2026 note at its line 54 marking the proposal-era schema as historical. It is
recorded as a backlog item (§8), not silently changed.

### 7.2 Prior work (from the external handout — commit hashes as recorded there)

The handout's commit list is retained for continuity. **All 25 hashes and their subject lines were
verified against `git log` this session with an exact automated comparison (25 checked, 0
mismatches)** — so this block is a verified record, not a transcription.

```
b332e52 fix(engine): generic provenance for the phase-exploit hook + validate CharacterDef.class
467891b fix(ui): match Remolder category icons to 52x52 + standardize the Crit DMG label
3d19b46 feat(ui): Pattern Remolder category icons — delivered assets + wiring
d949dc1 feat(ui): Pattern Remolder in the Setup screen — per-buff levels + engine-resolved preview
7fe0d2d docs(cooking-stats): record the values as validated by the project owner's authority
edea593 feat(engine): Permanent Cooking Stats — user-toggleable permanent flat ATK/DEF/HP
8848f40 fix(ui): launcher blank console on first run — cmd syntax error aborted the script
bc461ad feat(ui): launcher bootstraps Node.js automatically — no manual install for testers
e403537 fix(ui): Setup layout — move Simulation settings left, Apex Chassis + DEBUG MODE right
bd39e91 test(apex): full validation pass — behavioral coverage, docs, and the open scaling question
44d847c feat(ui): Apex Chassis section in Setup — account-wide component picker + enhancement
be04ec8 feat(apex): adapt the Apex Chassis (Heavy Ordnance Corps) — the ONE scoped part
f50ab94 feat(common-keys): player-selectable stat picker — 5-kind pool, per-key UI, choice-aware badge
4607471 feat(model): Common Key stat slots — only the first stat is hardcoded; the rest are player-chosen
6a03ebb fix(data): Guide to Victory has NO ammo attribute (2026 information fix)
4852819 fix(model): a non-attacking ability carries NO phase/ammo attribute (QJ Ultimate info fix)
df73fc8 style(ui): stack the rotation builder — priority order below the abilities palette
daf8c64 feat(ui): revamp the Rotation section (two-panel builder + timeline + badges)
9975faf feat(ui): show ammo-type icons in the Ammo weaknesses section
508fa52 assets(ammo): deliver the 5 Ammo Type icons (heavy, medium, light, shotgun, melee)
addc9c6 style(ui): tighten the Phase weaknesses element-icon spacing
48272c7 feat(ui): show element icons in the Phase weaknesses section
fe0ef58 assets(elements): deliver the 7 Phase/Element icons (physical, burn, hydro, corrosion, electric, freeze, omni)
c4a06cc docs(attachment): one active set per character; Close Assault dev-considered validated
dfe777d docs(attachment): element boosts validated by shared mechanism; only Burn Boost hard-checked
```

**Note for future sessions:** earlier history than this list is not reconstructed here. Use
`git log` for the authoritative record.

---

## 8. Active Backlog

Only genuinely open work. Completed items are closed and preserved in §7.

### 8.1 Immediate next step — Vector (character NAMED by the user, 2026-10-09)

**Implement Vector.** The user named her as the next character, and her source record now exists
(`docs/dolls/vector.md`). The engine is audited and ready: zero character-id conditionals,
data-driven dispatch, registry is a one-line change.

**Before any implementation, these are the blocking items (from `docs/dolls/vector.md` §7/§10):**

| # | Blocker | Why it blocks | Evidence needed |
|---|---|---|---|
| ~~V1~~ | ~~**Base stats** (ATK/HP/DEF/critRate/critDmg)~~ | **RESOLVED 2026-10-09** — user-provided character sheet: **HP 1819 · ATK 748 · DEF 569 · Stability 10 · Crit Rate 20% · Crit DMG 120% · Movement 6**; recorded in `docs/dolls/vector.md` §3 | — (obtained) |
| ~~V2~~ | ~~**The V5 extra Confectance slots + the turn-start drain**~~ | **ENGINE IMPLEMENTED + TESTED 2026-10-09.** The generic capability exists: `turn_start_confectance_drain` (`atkPct` + `extraSlots` + `perExtraSlotAtkPct`), a SECOND `extraConfectance` pool filled by gains beyond `confectanceMax`, and a round-scoped `roundAtkPct` folded into the existing in-combat ATK% bucket. **`confectanceMax` (U9 = 6) unchanged.** Semantics confirmed with the user: overflow fills the extras; additive ⇒ **+10/+20/+30%** for 0/1/2; the drain consumes both pools. **Remaining work is Vector's own DATA** (her passive's values), not engine code | — (capability done; 8 tests in `src/test/confectance-drain.test.ts`) |
| V3 | **Burn/Incineration tiles** | Foundational to Vector's kit (Dead End Meltdown, Searing Finale, FK1, passive V5); the grid has **no tile-effect system** | design/evidence step |
| V4 | **The remaining 6 undefined statuses + the engine vocabulary they need** — inventory in `docs/dolls/vector.md` **§7.1** | **EVIDENCE DOCUMENTED; slices 1–4 DONE.** `extra_command` (§3.24), `apathetic_resistance` (§3.25), the **`whenElement` gate** (§3.26) and the **`ownActionStart` tick** (§3.27) are **IMPLEMENTED + TESTED 2026**; `critDmg` is a valid `stat_modifier` stat. Still not implemented: 3 reusable vocabulary additions (count-by-classification scaling; all-allies targeting; support-trigger vocabulary), 1 new mechanic (**skill denial** — `Overheat`), and the V3-coupled tile clauses | definitions obtained; behaviour still needs in-game validation |
| V5 | **Signature weapon shape gaps** (Imprint condition, weapon ATK endpoints, trait pool) | Not representable in today's `WeaponDef`/`Imprint` shapes | source + judgement |

**Recommended order:** base stats are IN; **V2 (the Confectance-drain capability) is IMPLEMENTED +
TESTED**; **V4's evidence is DOCUMENTED** (`docs/dolls/vector.md` §7.1 — nothing implemented yet).
Remaining for Vector: **V3** (Burn/Incineration tiles — no tile system exists; the tile rules are
documented in `docs/research.md` §3.23) and **V4** (the status vocabulary + definitions) are
engine-scale work rather than data entry; **V5** is a weapon-shape decision. Do **not** implement a
partial kit that silently approximates an unmodeled mechanic (§1.4 / the anti-approximation rule).

### 8.2 Active tasks

| # | Task | Priority | Depends on | Evidence required | Status |
|---|---|---|---|---|---|
| B1 | `docs/schemas.md` header/status still says "Proposed … proposal, awaiting approval" | Low | — | repo inspection only (the file already self-notes the proposal-era content at line 54) | **Open** — deliberately out of previous tasks' scope |
| B3 | Resolve the Apex secondary-effect scaling question | — | user's call | in-game tooltip read | **DEFERRED — Apex is WIP** (user decision, 2026-10-09) |
| B4 | Vector implementation (see §8.1 V3–V5) | High | V3–V5 scope decision | then Evidence → Test → In-Game Validation | **Base stats IN · V2 capability DONE; BLOCKED on the V3/V4 engine-scale work and a scope decision** |
| B5 | Wire the 19 placed Vector assets into `assets.ts` (`KNOWN_ENTITY_IDS` + `SUPPLIED_ASSET_FILES` → `supplied: true`) | Low | — | none (files are placed) | **Open** — assets are placed but NOT wired; deliberately out of the docs-only task |

**Closed earlier this session:** B2 (commit `docs/project.md`) — completed as `98c4fab`; preserved in
§7.1 per the rule that completed items move to the history.

### 8.3 Deferred / blocked (not ready to start)

- **The 7 inert attachment sets** — stay inert until their gates become engine-evaluable. Each is
  its own evidence step; do not implement speculatively.
- **Apex Tier I/II/IV components and the other 6 types** — no data recorded; do not invent.
- **Element DoTs (U16)** — definitions unknown; deferred.
- **Auto-battle AI (U12)** — out of MVP scope.
- **Vector mechanics needing new engine systems** — Burn/Incineration tiles, the Confectance-drain
  ATK buff, cooldown reduction, allied healing, "large target" classification. Recorded in full in
  `docs/dolls/vector.md` §7. Each is its own design/evidence step; **do not approximate them**.

### 8.4 Optional cleanup (only if it ever matters)

- No TODO/FIXME/HACK/XXX markers exist anywhere in `src/` or `ui/src/` (verified) — nothing to
  clean.
- No `try/catch` in the engine — nothing to clean.

---

## 9. Known Limitations and Open Questions

### 9.1 The Apex secondary-effect scaling question (the one true open assumption)

**Question:** is Firepower Reconstruction's secondary effect (5% weapon-type / 7% weakness) **fixed**
or does it **scale** to 6.5% / 12% with enhancement?

**Why unresolved:** the guide gives ranges, and the only in-game observation is Enhance 1 → 5%/7%.

**Status as of 2026-10-09: DEFERRED — Apex is work-in-progress (user decision).** The engine
implements the fixed model, and the behavior is pinned by a documented test so it cannot change
silently. Nothing needs to happen until the user resumes Apex.

**Evidence that would resolve it:** equip the component at **Enhance 1** and **Enhance 6** and read
the tooltip. 5%→6.5% / 7%→12% ⇒ values scale (model must change). Unchanged ⇒ the current model is
correct. **Reading the tooltip alone suffices — no combat run needed.**

### 9.2 Deferred mechanics (out of MVP scope)

APL/auto-AI · movement/positioning beyond the core grid rules · **Cover — explicitly deferred**
(incl. the 35/30/25/20% cover reductions and the stability-cover 60% reduction) · maps ·
enemy turns/AI · DoT for unverified elements · **the wider additional-action topic** (enemy/extra-action *systems*; **Extra Command's extra main action IS implemented** — `docs/research.md` §3.24) · durations > 7 turns.

**Grid (`docs/grid.md`):** diagonal corner-squeezing, Ground→High Ground combat, detailed LOS,
height beyond Ground/High, unconfirmed movement modifiers.

**UI (`ui/docs/ui.md`):** website, cloud/auth, scenario sharing, advanced rotation editor,
builders, optimization/DPS ranking, charting, replay, terrain editor, flanking, packaged
installers beyond plain Windows dev builds.

**Status purge/removal:** not a general MVP mechanic; partially implemented as FK2's generic
`cleanseDispellable` (exactly 1 dispellable target buff before a Support Action). No other purge.

### 9.3 Genuine unknowns that must NOT be filled with assumptions

- Which character the user wants next (§8.1). **RESOLVED 2026-10-09: Vector.**
- The 7 inert attachment sets' mechanics (gates reference undefined statuses; **Phase Boost** /
  **Area Defense II** are referenced but not defined).
- Ultimate-Pursuit stacking details.
- ~~**Can Confectance exceed its max of 6?**~~ **RESOLVED + IMPLEMENTED 2026-10-09 [GAME]:** yes, but
  as a **SEPARATE resource** — at **V5** Vector gains **2 Confectance slots separate from the normal 6**,
  read by her passive Lv.3 clause (additive) for **+10%/+20%/+30% ATK** at 0/1/2 filled. **U9's cap of
  6 is unchanged** (the normal gauge never overflows). Recorded in `docs/dolls/vector.md` §4.5/§7 and
  `docs/research.md` §3.12; the **generic engine capability is implemented + tested**
  (`turn_start_confectance_drain`, `src/test/confectance-drain.test.ts`). **`confectanceMax` is never
  raised.**
- Live level cap / endgame stat magnitudes (U13).
- Element DoT definitions (U16).
- The term "Nixie/交换机" (U18) — needs user clarification, not code.
- Any in-game observations made but not yet written into `docs/` — cannot be known from the
  repository. If the user has numbers, they must be supplied.

### 9.4 Information that could NOT be recovered when establishing this document

- The exact intermediate reasoning of the previous conversation — not recoverable. Only its
  durable outputs (commits, docs, tests) survive, and those were re-read from the repository.
- Whether the Apex scaling question has been answered since the handout was written — `docs/research.md`
  §5 item 11 still records it as open, and the engine still implements the fixed model. Not resolved.
- File timestamps/authorship of pre-handout history beyond the commit list in §7.2.
- **UI visual verification:** the UI is verified by unit tests + build, **not** by screenshots (an
  Electron desktop window). Presentation claims rest on test assertions, not visual inspection.

### 9.5 Intentional behaviors that look like bugs (do NOT "fix")

- **Ammo Weakness Upgrade applies without a source label.** This is an explicit, documented
  exception to the provenance requirement (`docs/validation-checklist.md`). Do not thread a
  granting source into it.
- **`phaseMultiplier` always returns 1.0.** This is correct — there is no elemental counter wheel.
- **All-Element Boost is stored but never affects damage.** Correct — the RES system is unmodeled.
- **The 7 inert sets return "no match" rather than a default bonus.** Correct — unmodeled gates
  must never apply unconditionally.

---

## 10. Next Action

**The single most appropriate next action: scope Vector's remaining engine work with the user.** Her
source record is complete, the **only data blocker (base stats) is resolved** (`[GAME]`: HP 1819 ·
ATK 748 · DEF 569 · Stability 10 · Crit Rate 20% · Crit DMG 120% · Movement 6), **V2 is now
IMPLEMENTED + TESTED**, and **V4's evidence is documented**. What remains
(`docs/dolls/vector.md` §7 V3–V5) is **engine-scale work, not data entry**: Burn/Incineration tiles
and the 8 undefined statuses plus the vocabulary they need.

**V2 — DONE (engine capability).** The generic `turn_start_confectance_drain` mechanism is implemented
and covered by 8 tests (`src/test/confectance-drain.test.ts`): a second extra-slot Confectance pool,
the turn-start drain, and a round-scoped ATK% folded into the existing in-combat ATK% bucket.
**`confectanceMax` (U9 = 6) is unchanged** — pinned by a guard test. Only **Vector's own values** remain
to be written as data on her passive.

**V3 (tiles) is documented but not built** — `docs/research.md` §3.23 records the Burn-family tile rules
(base **Incineration → Flashover II → III**; fusions **Scalding Vapors**, **Venomfire**,
**Smoldering Suspire**, CN-only **Crackling Flare**) from a community guide, `[SOURCE]`/`Not Tested`,
with the effect names independently resolved. The engine has **no tile system**, so V3 remains a
design/implementation task.

**V4 (statuses) — slices 1–4 IMPLEMENTED; evidence documented for the rest.**
**Extra Command** (§3.24), **Apathetic Resistance** (§3.25), the **`whenElement` per-element gate**
(§3.26) and the **`ownActionStart` tick** (§3.27) are **DONE** — 6, 7, 9 and 8 new tests
respectively. The remaining V4 work is documented in `docs/dolls/vector.md` §7.1 — **6 statuses still
undefined**, needing 3 reusable vocabulary additions, 1 new mechanic (skill denial), and the
V3-coupled tile clauses.

**Why a decision is next:** the data-only portion of Vector is ready, but implementing a *partial* kit
would silently approximate mechanics the engine does not model — which the project rules forbid
(`§1.4`; "never invent game mechanics"). So the next step is a scope decision, not code:
either (a) extend the engine for tiles/statuses, or (b) implement only the subset that is honestly
modelable today and record the rest as inert/unmodeled, exactly as the 7 inert attachment sets are.

**Also outstanding (nothing here is committed):**

- **This V4 slice (the `ownActionStart` tick) is uncommitted** (§7.1 item 14) — awaiting the user's
  authorization.
- **Vector's assets are placed but NOT wired** (`assets.ts` untouched) — backlog **B5**.
- Per the §1.4 policy the §2 snapshot is refreshed at the start of the next task or when wrapping up —
  not by a separate commit after every commit.

**This section must be updated whenever the priority changes.**

---

*End of `docs/project.md`. Keep it current (§1.4).*
