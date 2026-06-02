# DESIGN.md (draft)

Forward-looking design for `partybuff/calendar`. Audience: an agent
implementing changes in this repo. For project orientation read
`CLAUDE.md` first. For the engine API this repo consumes read
`ENGINE_CONTRACT.md`. User-facing behavior is in `README.md`.

---

## 1. Scope

A Roll20 API script that displays a fantasy campaign calendar in chat
and lets the GM advance time, switch worlds, and broadcast the current
view to players. Distributed as a single `calendar.js` paste artifact.

### In scope

- **Worlds:** Eberron, Faerûn (Harptos), Greyhawk, Dragonlance (Krynn),
  Exandria, Mystara, Birthright, Gregorian. One active world per
  campaign.
- **Date math:** advance, retreat, set, parse, format, weekday lookup,
  leap years, intercalary days. All delegated to the engine.
- **Moon phases:** illumination and label per moon per day. Output only;
  no sky position, altitude, azimuth, eclipses, or shadow framing.
  Full and new days are inflection points (single days, never spans).
  Anti-phase coupling between Therendor and Barrakas is engine-owned
  canon (Eberron). Dragonlance Night-of-the-Eye is the only Krynn
  anchor mechanism (no per-moon Krynn anchors).
- **Events** (canon-only — no user input):
  - Built-in canonical event packs per world (e.g., Sovereign Host
    feasts for Eberron, calendar festivals for Harptos). Packs ship
    with the engine and arrive at the wrapper via the setup token.
  - Eberron planar events surfaced as their own subsystem alongside
    events and lunar (canon cycles only — no GM seeds, no drift, no
    multi-day spans).
- **GM commands** (typed):
  - `!cal set world <id>` — switch worlds.
  - `!cal set date <date>` — set the current date.
  - `!cal advance` / `!cal retreat` — step one day.
  - `!cal send` — public-broadcast the today panel.
  - `!cal token <paste>` — apply a setup token.
  - `!cal resetcalendar` — clear state.
- **Player + GM commands** (typed; whispered back to caller):
  - `!cal` — today panel (minical + summary + buttons).
  - `!cal additional` — subsystem hub.
  - `!cal events current` / `events all [yyyy]`.
  - `!cal lunar current` / `lunar all [yyyy]`.
  - `!cal planar current` / `planar all [yyyy]` (Eberron only).
  - `!cal show [month] [year]` — calendar view, no today summary.
  - `!cal help` — command reference.
- **UX model:** whisper-first. Every chat reply is whispered to the
  caller. The single public broadcast is `!cal send`, GM-only. Panel
  navigation is a chain of button clicks that issue further `!cal …`
  commands.

### Out of scope

These are explicitly cut. Do not re-add without a written reversal.

- Weather of any kind (mechanical, narrative, ambient, location-aware).
- Time-of-day, sun position, horizon math.
- Sky rendering: moon altitude, azimuth, hour angle, "long shadows".
- Eclipse detection, occultation reporting.
- Forecast-lens knowledge tiers (zones A/B/C/D, DC ladders, tails,
  jitter, off-center placement, auto-sharpening). Players see what the
  GM sees.
- Generated planar events, GM-tunable seeds/anchors for planes, plane
  suppression, manifest zones, Ring of Siberys lighting.
- Multi-day full/new moon spans. Engine collapses each to its
  inflection day; the wrapper does not stretch them back out.
- 60-day moon history caches. Phases compute on-demand from anchors.
- Festival "nudges" that shifted lunar event dates near holidays. The
  engine is anchor-pure; festival proximity is not a phase input.
- Per-moon Dragonlance anchors. The Night-of-the-Eye triad is the only
  canonical mechanism. The token validator rejects per-moon Krynn
  anchors.
- GM custom events. Event content is canon-pack only. There is no
  add / remove / edit surface in the wrapper.
- Roll20 handouts as a render surface. Handout creation is disabled.
- Roll20 pages with "live" embedded rendering.
- Standalone web app, showcase site, Cloudflare Workers deployment.
  These live in `partybuff/party-buff`.
- Macros, dice rolls, ambient narration, AI generation.

---

## 2. Architecture

```
partybuff/party-buff (sibling monorepo)
  └── packages/calendar-engine          pure TypeScript, no host deps
        published as @partybuff/calendar-engine on GitHub Packages

partybuff/calendar (this repo, the wrapper)
  ├── src/                              Roll20 wrapper
  │   ├── index.ts                      boot
  │   ├── state.ts                      state.PartyBuffCalendar
  │   ├── commands.ts                   !cal parser + dispatch
  │   ├── ui.ts                         chat HTML, button emit
  │   ├── views/                        today, month, moons, events, help
  │   └── (imports @partybuff/calendar-engine)
  ├── calendar.js                       built artifact (esbuild IIFE)
  └── build.mjs                         esbuild config
```

**Boundary rule.** The engine is pure and deterministic. The wrapper
owns everything that touches Roll20: `sendChat`, `findObjs`, `state.*`,
button HTML, command parsing, player vs GM gating, persistent views,
chat formatting. The engine does not import any Roll20 global and
assumes no host (no `window`, no `document`, no `process`, no `fs`).

If a piece of logic is testable as `(inputs) => outputs` with no host
dependency, it belongs in the engine. If it requires Roll20 to mean
anything, it stays here.

The current `src/` tree still contains pre-refocus modules (weather,
sky, moon sky position, planar subsystem, persistent views, time-of-day,
forecast-lens). Treat them as legacy. Either delete them or replace
them with thin shims over engine calls.

---

## 3. Data model

### 3.1 Engine-owned (do not duplicate)

- World definitions: id, label, era, calendar structure, default date,
  moons, holidays, seasons.
- All date arithmetic and parsing.
- Moon phase computation.
- Eberron planar phase computation (canon-anchored only).

See `ENGINE_CONTRACT.md` for exact shapes.

### 3.2 Wrapper-owned (lives in `state.PartyBuffCalendar`)

```ts
interface PersistentState {
  version: number;            // bump on breaking shape change; migrate on read
  worldId: WorldId;           // engine WorldId
  currentDate: CalendarDate;  // engine CalendarDate
  variant?: string;           // calendar variant key; absent = world default
  palette?: string;           // month-header palette key; absent = world default
  imported?: ImportedSetup;   // populated by `!cal token`; see §3.3
  setup: {
    status: 'uninitialized' | 'dismissed' | 'in_progress' | 'complete';
  };
}

interface ImportedSetup {
  lunarAnchors: Readonly<Record<string, MoonAnchor>>; // per-moon (non-Dragonlance worlds)
  krynnAnchor: CalendarDate | null;                   // Dragonlance only; canonical NoE anchor
  planarAnchors: Readonly<Record<string, number>>;    // Eberron only; per-plane day offset
  appliedAt: number;                                  // epoch ms
  schemaVersion: number;                              // token's `v`
}
```

Rules:
- Keep state small. Roll20 serializes to JSON on every write.
- Never store engine outputs (phases, planar states, event lists).
  Recompute on every render.
- No `customEvents` slot — event content is canon-only and ships with
  the engine.
- Versioned schema. Read path runs migrations; write path always emits
  the current shape.
- On unknown `worldId`, fall back to the engine's default and log; do
  not crash.
- `imported.krynnAnchor` is the canonical Dragonlance anchor; legacy
  triplicated-per-moon tokens are translated on the apply path so
  PR 2c only has one Dragonlance code path to support.

### 3.3 Events

Engine ships the canonical event packs as `World.holidays` plus, for
Eberron, the planar phase cycles. The wrapper displays both as
separate subsystems (see §5). There are no user-edited entries — no
add, no remove, no hide. A holiday is on the calendar or it isn't.

---

## 4. Roll20 constraints

Carry these forward; they shaped every previous attempt.

- **No `<script>` tags in chat.** Roll20 strips them.
- **Inline CSS only, and limited.** Most properties survive on `style=""`;
  `position`, `transform`, animations, and external stylesheets do not.
  `display: table` constructs are the most reliable layout primitive.
- **`/direct` strips command-button markup.** Anything that broadcasts to
  players must be a non-interactive summary. Interactive control panels
  are GM-whispered only.
- **Single-file delivery.** No JS includes, no HTML files. Everything
  ships as one `calendar.js`.
- **API time budget is real.** The previous high-tier moon panel hit
  ~1.8s/render because eclipse computation was recomputed per day cell.
  That's why eclipses are gone from this surface. Stay under ~200ms per
  render and well clear of the Roll20 watchdog.
- **`Campaign().journalfolder` is read-only.** Scripts cannot create
  Roll20 folders.
- **`handout.set('notes', ...)` is async and rate-limit-prone.** Don't
  rely on it for the primary UX. (We don't — handouts are out of scope.)
- **Persistent state lives in `state.PartyBuffCalendar`.** Roll20
  serializes it as JSON; keep it small.
- **Button-emit pattern.** The only practical UI is "buttons that issue
  `!cal …` commands, which re-render the panel." All "interactive" UI is
  a chain of chat messages.
- **`randomInteger()` is the only sanctioned RNG.** Avoid `Math.random()`
  in shipped code paths (the engine's outputs are deterministic, so this
  rarely matters — flag if you reach for an RNG anywhere).

---

## 5. UX

### 5.1 Whisper-first

Every chat reply is whispered to the caller. The only public broadcast
is `!cal send` (GM-only), which sends the same panel `!cal` would have
whispered, this time to the room. Players cannot broadcast anything.

This is the cleanest defence against Roll20 chat spam: a 12-player
table can each click `!cal` without flooding the room.

### 5.2 Entry: `!cal`

A whispered panel with these stacked sections:

1. **Minical** — current month, day cells with stacked event chips,
   today highlighted. Each chip has a `title=""` tooltip (desktop-only;
   mobile players read the full info via the subsystem panels).
2. **Today summary** — long date, weekday, season, next-event hint
   ("Next event: Sun's Blessing in 3 days").
3. **GM-only button row** (suppressed when caller isn't GM):
   `[Retreat] [Advance] [Send]`. Each emits `!cal retreat` /
   `!cal advance` / `!cal send`.
4. **Public button row**: `[Additional] [Help]`. Emits
   `!cal additional` / `!cal help`.

### 5.3 `!cal send` — public broadcast

GM-only. Same layout as the whispered `!cal` panel but minus the GM
row (Retreat/Advance/Send don't render publicly — they're GM-only
widgets). The public row stays; players reading the broadcast can
click `[Additional]` / `[Help]` and those buttons issue their own
whispered `!cal additional` / `!cal help`.

Send is the **only** command that crosses the whisper boundary. There
is no per-subsystem send.

### 5.4 `!cal additional` — subsystem hub

Whispered. Three pairs of buttons, one row per subsystem:

```
[Events Current]  [Events All]
[Lunar Current]   [Lunar All]
[Planar Current]  [Planar All]     (Eberron only)
                                    [← Back]
```

Back returns to `!cal` (issues `!cal`).

### 5.5 Subsystem panels

All subsystem panels whisper to the caller. Every one ends with a
`[← Back]` button to `!cal`. None has a Send button.

#### Events Current — `!cal events current`

Three sections: **Past** | **Today** | **Upcoming**. Every event line
carries an explicit month label (no "events this month" title — the
panel can span months).

Inclusion rules:
- Always includes all events from the active month.
- Past also includes events from the prior month whose date is within
  `weekdays.length` days of today (so a 7-day-week world spills one
  week back). Spillover crosses year boundaries.
- Upcoming follows the same rule against the next month.

#### Events All — `!cal events all [yyyy]`

Full year listing. Default `yyyy` = current year. Organized by month
section header, then chronological by date within the month. Spammy
by design — `events current` is the day-to-day view, `events all`
exists for "what's the full picture of holidays I've got."

#### Lunar Current — `!cal lunar current`

One row per moon, columns:
- Name
- Active phase (label + illumination glyph)
- Synodic period (cycle days)
- Last full **or** new (whichever was more recent), with date
- Next full **or** new (whichever is sooner), with day countdown

#### Lunar All — `!cal lunar all [yyyy]`

Year listing organized by month, **not** by moon. Default `yyyy` =
current year. Per-month section header, then chronological
`Day — Moon Name Full|New` lines. Mixing moons within a month is
intentional — readers want to see "when does the sky have an event"
across all moons.

#### Planar Current — `!cal planar current`

Eberron-only. Same Past/Today/Upcoming model as `events current`,
with the same week-length spillover and explicit month labels.

Transition line shape:
- Phase-in: `16 — Fernia Coterminous for 7 days`
- Phase-out: `22 — Fernia Coterminous Ends` (dimmer, no countdown)

#### Planar All — `!cal planar all [yyyy]`

Eberron-only. Same structure as `lunar all`: per-month section,
chronological transitions inside.

### 5.6 `!cal show [month] [year]`

Whispered. Pure calendar grid — no today summary, no next-event
hint, no GM row. Defaults: current month, current year. Useful for
planning ahead without leaving the current date.

`show` is mentioned in `!cal help` but has no button. Typed-only.

### 5.7 `!cal help`

Whispered. Lists every command in plain text (no buttons — Help is
the reference card). Includes the typed-only GM admin commands:
`!cal set world <id>`, `!cal set date <date>`, `!cal token <paste>`,
`!cal resetcalendar`.

### 5.8 Setup

GM-only first-run wizard. Persistent setup state: `uninitialized`,
`dismissed`, `in_progress`, `complete`. Campaigns with populated
calendar data but no setup marker auto-migrate to `complete` (no
onboarding interruption).

The web-app setup token (§10 of `ENGINE_CONTRACT.md`) is the primary
configuration channel. The wizard exists for the no-token case:

1. World (8 choices).
2. Starting date — accept "use world default" or a custom date via the
   same parser used by `!cal set date`.

That's it. Era labels, color themes, hemisphere choices, season
models, event source ordering — all dropped. The engine returns one
canonical representation per world; the wrapper renders it.

Public chat must never receive setup prompts. If a player types `!cal`
before setup is complete, the wrapper whispers a polite waiting
message.

### 5.9 Stacking rules for the minical

Multiple events can land on the same day. Stack order (top to bottom)
in the cell:
1. Canon holidays (engine `World.holidays`).
2. Lunar events (full / new for any moon).
3. Planar transitions (Eberron only).

Within a tier, ties are broken by event key sort order — stable
across renders. Tooltips on each chip show the event name and source.

---

## 6. Build and dependencies

- TypeScript source in `src/`, bundled to `calendar.js` via
  `npm run build` (esbuild, IIFE, ES2020).
- `npm run check` runs typecheck and tests; CI runs the same on every PR.
- The Roll20 paste artifact is built in CI and downloadable from the
  workflow artifact. Local builds also work.
- `__ROLL20__` is a compile-time constant set in `build.mjs`. With the
  refocus this should rarely be needed, but it remains available for
  gating any path that genuinely behaves differently in the Roll20
  sandbox.
- The engine is consumed via GitHub Packages
  (`@partybuff/calendar-engine`). Auth via `GITHUB_PACKAGES_TOKEN` in CI
  and an `.npmrc` PAT locally; document in the engine package README.

---

## 7. Testing

- Engine has its own tests in the party-buff repo. Do not duplicate
  them here.
- This repo tests:
  - Command parsing (`commands.ts`) — every `!cal` form.
  - State migration (`state.ts`) — every supported `version` upgrade.
  - View rendering (`views/*`) — snapshot of the chat HTML emitted for
    representative scenarios per world.
  - Roll20 shim contract (`test/roll20-shim.ts`) — the wrapper never
    touches a Roll20 global the shim doesn't model.
- Tests run under Node via `tsx --test`. The shim simulates `sendChat`,
  `findObjs`, `state`, `playerIsGM`, etc.

---

## 8. Open decisions

Flagged for resolution. None block first cut.

1. **`!cal show` navigation arrows.** The bare `show` panel is
   static — no today summary, no GM row. Should it carry
   `[← Prev month] [Next month →]` buttons for ergonomics, or stay
   typed-only? Lean: keep it static. Adding navigation drifts toward
   re-implementing `!cal` without the today framing.
2. **`!cal lunar current` ordering.** Sort moons alphabetically, by
   cycle days, or by world-canonical order (the `World.moons` array)?
   Lean: world-canonical (matches the engine's intent).
3. **Today summary "next event" hint scope.** Should "next event"
   include lunar/planar transitions, or only canon-holiday entries?
   Lean: only holidays — lunar/planar each have their own current
   panel and a holiday hint reads cleaner.
4. **Year boundary on lunar/planar "all" spillover.** The events
   panels spill into nearby months including across year boundaries;
   `lunar all yyyy` / `planar all yyyy` are explicitly year-scoped.
   Confirm: no spillover for the year-scoped panels.
5. **Mobile-tooltip parity.** Roll20 chat preserves `title=""` for
   desktop. Mobile players don't get tooltips. Acceptable cost per
   the user — no expand-on-click fallback. Documented here so the
   choice isn't re-litigated.

---

## 9. Out-of-scope reminders

If you read code that suggests we should add:

- a sky panel
- weather narration
- eclipse warnings
- forecast windows or "DC 15 reveal"
- handouts
- moon altitude or "long shadows"
- planar drift / generated planar events
- Ring of Siberys lighting
- a player-vs-GM knowledge model

…that code is legacy. Confirm with the user before extending it.
