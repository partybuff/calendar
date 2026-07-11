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
  Exandria, Mystara, Barovia (Ravenloft — weekless, "Nth Night of the
  Mth Moon" date format), Birthright, Gregorian. Nine worlds
  (`src/worlds/overlays.ts::OVERLAY_ORDER`). One active world per
  campaign.
- **Date math:** advance, retreat, set, parse, format, weekday lookup,
  leap years, intercalary days. All delegated to the engine.
- **Moon phases:** illumination and label per moon per day. Output only;
  no sky position, altitude, azimuth, eclipses, or shadow framing.
  Full and new days are inflection points (single days, never spans).
  Anti-phase coupling between Therendor and Barrakas, and Dragonlance's
  Night-of-the-Eye conjunction, are always-on engine canon (Eberron /
  Krynn respectively) — the wrapper triggers neither directly and has
  no per-moon anchor override of any kind; it always calls the engine
  with an empty opts bag.
- **Events** (canon-only — no user input):
  - Built-in canonical event packs per world (e.g., Sovereign Host
    feasts for Eberron, calendar festivals for Harptos), generated from
    engine `world.holidays` at render time. Packs ship with the engine
    package itself, not with a token — `!cal token` carries
    world/date/variant/palette only and has nothing to do with event
    content.
  - Eberron planar events surfaced as their own subsystem alongside
    events and lunar (canon cycles only — no GM seeds, no drift, no
    multi-day spans).
- **GM commands** (typed):
  - `!cal set <dateSpec>` — set the current date. There is no `!cal set
    world <id>` — switching to a *different* world is not a live
    setting (it changes month/moon/holiday data); it goes through
    `!cal resetcalendar` (re-runs the one-step world picker) or a
    `!cal token` paste. `!cal calendar <system> [variant]` only swaps
    the name-variant *within* the current world.
  - `!cal advance [N]` / `!cal retreat [N]` — step N days (default 1).
  - `!cal send [range]` — the single public broadcast. Bare = today
    panel; with a range, that month/year.
  - `!cal token <paste>` — apply a setup token (world/date/variant/
    palette only — no anchor fields; see `ENGINE_CONTRACT.md` §10).
  - `!cal resetcalendar` — wipe state; setup runs again.
  - `!cal manage` / `!cal settings` / `!cal theme` / `!cal calendar` /
    `!cal hemisphere` / `!cal source` — the GM configuration surface
    (name variants, palettes, per-source event visibility, density,
    subsystem toggles). Live settings, not part of first-run setup.
- **Player + GM commands** (typed; whispered back to caller):
  - `!cal` — today dashboard (minical + summary + buttons).
  - `!cal additional` — subsystem hub.
  - `!cal events current` / `events all [yyyy]`.
  - `!cal lunar current` / `lunar all [yyyy]`.
  - `!cal planar current` / `planar all [yyyy]` (Eberron only).
  - `!cal show [month] [year]` — calendar view, no today summary.
  - `!cal event <name>` — single-event detail card.
  - `!cal help` — docs-only reference card (status line + short pages),
    not a full command list.
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
- 60-day moon history caches. Phases compute on-demand, closed-form,
  from the engine's canon reference — the wrapper has no anchor state
  to cache against.
- Festival "nudges" that shifted lunar event dates near holidays. The
  engine is canon-pure; festival proximity is not a phase input.
- Any in-Roll20 moon/plane anchor override, per-moon or otherwise
  (Eberron, Dragonlance's Night-of-the-Eye, or any other world). The
  wrapper always calls the engine with an empty opts bag. A token's
  `lunarAnchors` / `krynnAnchor` / `planarAnchors` fields (if a
  producer still sends them) are silently ignored on parse — not
  validated, not stored, not applied.
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

**No anchor persistence.** Moons and planes are canon-only (PR #198):
the engine opts bags are always called with `{}`. There is no
`imported` / `lunarAnchors` / `krynnAnchor` / `planarAnchors` slot —
PR #203 removed the last of that shape from persisted state (it was
write-only; nothing read it). The idealized shape below intentionally
carries no anchor fields:

```ts
interface PersistentState {
  worldId: WorldId;           // engine WorldId (wrapper registry key)
  currentDate: CalendarDate;  // engine CalendarDate
  variant?: string;           // calendar variant key; absent = world default
  palette?: string;           // month-header palette key; absent = world default
  setup: {
    status: 'uninitialized' | 'dismissed' | 'in_progress' | 'complete';
  };
}
```

The shipped `state.ts` shape is a legacy-flavored superset of this
(`calendar: { current, months, weekdays, events }`, `settings: {...}`,
`suppressedDefaults`, source-priority lists, UI density, etc.) rather
than this literal interface — this section states the *data the
wrapper is allowed to own*, not the exact on-disk layout. Treat the
list of rules below as binding regardless of the concrete shape:

Rules:
- Keep state small. Roll20 serializes to JSON on every write.
- Never store engine outputs (phases, planar states, event lists).
  Recompute on every render.
- No `customEvents` slot — event content is canon-only and ships with
  the engine.
- No anchor slot of any kind — see the callout above.
- On unknown `worldId`, fall back to the engine's default and log; do
  not crash.

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

Every interactive chat reply is whispered to the caller. `!cal send`
(GM-only) is the only public broadcast a GM *chooses* to send — it
posts the same panel `!cal` would have whispered, this time to the
room, non-interactively (`/direct` strips buttons). Players cannot
broadcast anything.

Two things are GM-facing whispers, not broadcasts, worth calling out
because they're easy to mis-scope:
- The **boot summary** (`notifySetupStatusOnReady`, fired after
  `checkInstall` on the next `!cal` after a sandbox restart) whispers
  "Calendar Initialized" to the GM only — it never goes to the table.
- `!cal resetcalendar` is a partial exception to "whisper-first": it
  *does* post one public, archived line ("Calendar reset. Was: ... Now:
  ...") as an in-game timestamp anchor, in addition to a GM-only ack.
  That line isn't interactive and isn't gated behind `!cal send` — it's
  a side effect of the reset command itself, not a second general
  broadcast surface.

This is the cleanest defence against Roll20 chat spam: a 12-player
table can each click `!cal` without flooding the room.

### 5.2 Entry: `!cal`

A whispered panel with these stacked sections:

1. **Minical** — current month, day cells with stacked event chips,
   today highlighted. Each chip has a `title=""` tooltip (desktop-only;
   mobile players read the full info via the subsystem panels).
2. **Today summary** — date, season, today's events, and any moon at a
   notable phase (full/new today or within 2 days). GM only,
   additionally: notable planar states.
3. **Views row**: one-click buttons into Events / Moons / Planes (world-
   gated — Planes only on Eberron, Moons only if enabled).
4. **Month stepper**: `‹ Prev` / `This Month` / `Next ›` / `Year`.
5. **GM-only button row** (suppressed when caller isn't GM):
   `[Retreat] [Advance] [Send] [Manage]`. Each emits `!cal retreat` /
   `!cal advance` / `!cal send` / `!cal manage`.
6. **Public button row** (players only): `[Additional] [Help]`. Emits
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

### 5.6 `!cal show [range]`

Whispered. Pure calendar grid — no today summary, no next-event
hint, no GM row. Bare `show` (or top-level `!cal` with a trailing
range token, e.g. `!cal next month`) defaults to the current month.
The month stepper (`‹ Prev` / `This Month` / `Next ›` / `Year`) rides
under every `show` output and issues further `show ...` commands, so
this view is button-navigable, not typed-only.

### 5.7 `!cal help`

Whispered, docs-only reference — **not** a full command list. A status
line (current date, active world/variant, non-default overrides) plus
short reference cards ("Reading the Calendar", "Themes", "Event
Colors") and `Dashboard` / `Additional` buttons. It does not enumerate
typed commands or GM admin syntax; the GM configuration surface lives
in `!cal manage`, and this file / `README.md`'s Command Reference are
the actual command lists.

### 5.8 Setup

GM-only, one step. Persistent setup state: `uninitialized`,
`dismissed`, `in_progress` (unused by the current one-step flow, kept
for schema compatibility), `complete`. Campaigns with populated
calendar data but no setup marker auto-migrate to `complete` (no
onboarding interruption).

There is no multi-step wizard. The GM picks a world from the welcome
card (`!cal setup pick <world>`); that world's canonical variant,
date, and palette apply immediately — no follow-up questions about
season, hemisphere, theme, or event sources. The web-app setup token
(§10 of `ENGINE_CONTRACT.md`) is the richer configuration channel for
GMs who want more than "just pick a world":

1. World (9 choices) — picking it applies the world's canonical
   default date, variant, and palette in the same step. There is no
   second question. A GM who wants a specific starting date sets it
   afterward with `!cal set <dateSpec>`.

That's it. Era labels, color themes, hemisphere choices, season
models, event source ordering — all dropped from *setup*; several
(theme, hemisphere, source visibility) are still available afterward
as live `!cal manage` settings, just not asked about during onboarding.
The engine returns one canonical representation per world; the wrapper
renders it.

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

Historical — the first four have since been resolved by shipped code;
left here so the reasoning isn't re-litigated. Only #5 is still live.

1. **`!cal show` navigation arrows.** *Resolved: yes.* The month
   stepper (`‹ Prev` / `This Month` / `Next ›` / `Year`) rides under
   every `show` output.
2. **`!cal lunar current` ordering.** *Resolved: world-canonical.*
   `_lunarCurrentHtml` iterates `sys.moons` in the order the world
   registry (engine `world.moons`) supplies.
3. **Today summary "next event" hint scope.** *Moot.* The shipped
   Today dashboard has no generic "next event" countdown line — it
   shows today's events, notable moon phases, and (GM) notable planar
   states directly, not a forward-looking hint.
4. **Year boundary on lunar/planar "all" spillover.** *Resolved: no
   spillover.* `_lunarAllHtml` / `_planarAllHtml` scope strictly to
   `[yearStart, yearEnd]`; `_eventsCurrentHtml` / `_planarCurrentHtml`
   (the *current*, not *all*, panels) are the ones with week-length
   spillover across month/year boundaries.
5. **Mobile-tooltip parity.** Still open. Roll20 chat preserves
   `title=""` for desktop. Mobile players don't get tooltips.
   Acceptable cost per the user — no expand-on-click fallback.
   Documented here so the choice isn't re-litigated.

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
