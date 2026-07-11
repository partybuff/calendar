# CLAUDE.md

Top-level orientation for an agent opening this repo cold. Read this first.

## What this repo is

`partybuff/calendar` — a Roll20 API script that displays a fantasy
campaign calendar in the Roll20 chat window. Single uploadable artifact:
`calendar.js`. The GM pastes it into Roll20's API Scripts editor;
players type `!cal` to see the calendar.

Branding: **Party Buff's Roll20 Calendar.**

## Current direction (read this carefully — the repo has wandered)

The repo previously contained large subsystems for weather, sky
simulation, forecast-lens knowledge tiers, planar mechanics, eclipses,
time-of-day, and handout rendering. **All of that is being cut.** The
Roll20 sandbox is too constrained to host it cleanly. Those features
moved (or are moving) into the sibling web app at `partybuff/party-buff`.

This repo is being refocused to a **thin Roll20 wrapper around
`@partybuff/calendar-engine`**, a pure-TypeScript engine published from
the party-buff monorepo. The wrapper imports the engine and bundles a
curated subset into `calendar.js`.

If you find a feature in the source that contradicts the in-scope list
below, treat it as legacy and confirm with the user before extending it.

### In scope

- Date math across nine worlds: Eberron, Faerûn (Harptos), Greyhawk,
  Dragonlance (Krynn), Exandria, Mystara, Barovia (Ravenloft), Birthright,
  Gregorian.
- Moon **phases** (illumination + label only). No sky position, altitude,
  azimuth, eclipse math, or "long shadows" framing.
- Eberron planar events surfaced in the Planar Current/All panels.
  Canon-only — no GM-tunable seeds, no off-cycle generation, no overrides.
- Events display, engine-canon only. ALL event content is generated
  from engine `world.holidays` at compose time
  (`src/worlds/index.ts::eventPacksFromEngine`); this repo hosts NO
  event data. Fidelity to the engine's own occurrence math is enforced
  by `test/engine-events-parity.test.ts`. The wrapper has no
  add/remove/list GM commands.
- GM commands: set date (`!cal set`), advance/retreat, paste a setup
  token (`!cal token`), broadcast the today panel (`!cal send`), plus
  live settings (`!cal manage` / `settings` / `theme` / `calendar` /
  `hemisphere` / `source`). There is no `set world` — switching worlds
  is not a live setting; it goes through `!cal resetcalendar` (re-runs
  the one-step world picker) or a `!cal token` paste. The `!cal token`
  pipeline IS operational (`src/token.ts`) — it applies world / date /
  variant / palette only. It does NOT carry lunar/planar anchor
  overrides: moons and planes are canon-only, so the wrapper always
  calls the engine with an empty opts bag, and any anchor fields on an
  incoming token are silently ignored (not validated, not stored).
- Whisper-first UX. `!cal` is the only chat entry point and every
  reply is whispered to the caller; `!cal send` (GM-only) is the
  single public broadcast surface.

### Out of scope (do not add)

- Weather (any form — temperature, wind, precipitation, climate,
  ambience).
- Time-of-day, sun position, horizon math.
- Moon sky position (altitude, azimuth, hour angle, shadows).
- Eclipse detection or reporting.
- Forecast-lens knowledge tiers (zones A/B/C/D, DC ladders, tails,
  jitter, off-center placement). Players see the same information the
  GM sees.
- Generated planar events, GM seeds/anchors for planes, plane
  suppression, manifest zones, Ring of Siberys lighting.
- Roll20 handouts as a render surface. Handout creation is disabled; the
  Markdown files under `Handouts/` are reference notes only, not code.
- Roll20 pages with embedded "live" rendering.
- The standalone web app, the showcase site, and any Cloudflare Workers
  deployment. Those live in `partybuff/party-buff`.

- GM custom events (`!cal event add` / `addmonthly` / `addyearly` /
  `remove` / `restore` / `list`). Events are canon-pack only as of
  the §5 UX rewrite; the management command family was retired.

If a request lands in the "out of scope" list, push back. The user
explicitly chose to cut these.

## Architecture (target)

```
partybuff/party-buff (monorepo)
  └── packages/calendar-engine        pure TypeScript, no Roll20 deps
        published as @partybuff/calendar-engine on GitHub Packages

partybuff/calendar (this repo)
  ├── src/                            Roll20 wrapper
  │   ├── index.ts                    entry point
  │   ├── state.ts                    state.PartyBuffCalendar persistence
  │   ├── commands.ts                 !cal parser + dispatch
  │   ├── ui.ts                       chat HTML, buttons
  │   ├── views/                      today, month, moons, events, help
  │   └── (imports from @partybuff/calendar-engine)
  ├── calendar.js                     built artifact (esbuild IIFE)
  └── build.mjs                       esbuild config
```

**Boundary rule.** The engine is pure and deterministic. Anything that
touches Roll20 (`sendChat`, `findObjs`, `state.*`, button HTML, command
parsing, player vs GM gating) stays in `src/`. The engine does not import
any Roll20 globals and does not assume a browser or Node host.

The current `src/` tree still contains the legacy modules (weather, sky,
planes-as-subsystem, time-of-day, persistent views, showcase). Treat
them as legacy until they are deleted or replaced by engine imports.

## Roll20 constraints worth knowing

These bit the previous design repeatedly. Carry them forward.

- **No `<script>` tags in chat.** Roll20 strips them.
- **Limited inline CSS.** Most properties survive on `style=""`, but
  `position`, `transform`, animations, and external stylesheets do not.
  `display: table` constructs are the most reliable layout primitive.
- **`/direct` strips command-button markup.** Public broadcasts must be
  non-interactive summaries; interactive control panels are GM-whispered
  only.
- **No HTML files, no JS includes.** Everything ships as one `calendar.js`.
- **API time budget is real.** The previous high-tier moon panel
  routinely hit ~1.8s per render because of eclipse recomputation;
  that's why eclipses are gone from this surface.
- **`Campaign().journalfolder` is read-only.** Scripts cannot create
  Roll20 folders.
- **Handout `set('notes', ...)` is async and rate-limit-prone.**
- **Persistent state lives in `state.PartyBuffCalendar`.** Roll20
  serializes it as JSON on every write; keep it small.
- **Button-emit pattern.** The only practical UI is "buttons that issue
  `!cal …` commands, which re-render the panel." All "interactive" UI is
  really a chain of chat messages.

## Source of truth

| Concern                                    | File                                         |
| ------------------------------------------ | -------------------------------------------- |
| Engine API the wrapper depends on          | `ENGINE_CONTRACT.md`                         |
| Forward-looking design for this repo       | `DESIGN.md`                                  |
| User-facing behavior                       | `README.md`                                  |
| Wandering path that got us here            | `HISTORY.md` (read only if a design choice surprises you) |
| World data (moons, calendars, holidays)    | engine package, once published; mirrored in `src/worlds/*.ts` until then |
| Runtime behavior                           | `src/` and `calendar.js`                     |

If `README.md` and code disagree, README is the intent and the code is
the bug.

If `DESIGN.md` and `ENGINE_CONTRACT.md` disagree on engine shape, the
contract wins (the engine is the dependency, not this repo).

## What to read next

1. `DESIGN.md` — scope, data model, open decisions.
2. `ENGINE_CONTRACT.md` — the API surface the wrapper imports.
3. `README.md` — user-facing behavior. Long; skim the command reference.
4. `src/index.ts` — entry point.
5. `src/worlds/*.ts` — current per-world data. Some moves to the
   engine; some stays as Roll20-specific overlays.

Ignore (legacy, scheduled for deletion):
`Design Ideas.md`, `Design Tasks.md`, `design/handout-folders.md`,
`sky-renderer-*.md`, `forecastlunar`, `weather foecasting`,
`2026-04-01.md`, `2026-04-08.md`, `In Depth Design Information/*.md`,
`Additional Calendars for Implementation.md`, `Dragonlance Moons.md`.
The pre-refocus `DESIGN.md` (51 KB, with weather/sky/planar subsystem
chapters) is also legacy; the current `DESIGN.md` is short and
forward-looking.

## Development workflow

- TypeScript source in `src/`. Bundled to `calendar.js` via `npm run build`.
- `npm run check` runs typecheck + tests. Run it before pushing.
- CI runs the same on every PR.
- The Roll20 paste artifact (`calendar.js`) is built in CI and
  downloadable from the workflow artifact. Local builds also work.
- `__ROLL20__` is a compile-time constant set in `build.mjs`; code can
  gate Roll20-only paths on `typeof __ROLL20__ !== 'undefined' &&
  __ROLL20__`. With the refocus this should rarely be needed.

## Tone for docs in this repo

Agent-oriented and terse. No marketing language. No "we." Concrete
decisions and constraints. If you're tempted to add aspirational fluff
or restate the history, don't — `HISTORY.md` covers the path and that's
enough.
