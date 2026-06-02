# Engine Consumer Contract

This repo (`partybuff/calendar`, the Roll20 API script) will consume
`@partybuff/calendar-engine` (published from `partybuff/party-buff`). This
document is the contract: it describes the API surface the Roll20 wrapper
needs from the engine. It is written for the engine author so that the
engine can be designed to fit without churn.

The engine may expose more than what is listed here. This document only
specifies what the Roll20 wrapper imports.

This contract is the v0.1.0 baseline. The seven initial-draft questions
were resolved 2026-05-26. The §8.1 revision lifted the "canon-only"
constraint on the planar API to accept per-campaign anchor offsets,
paralleled that on the moons API for per-campaign lunar anchors,
corrected the Long Shadows mechanic from phase-override to cycle-shift,
and added the cross-script token format (§10). The §8.2 revision
(this one) refactors the moons API to an opts-bag signature, adds
Dragonlance's `krynnAnchor` (Night-of-the-Eye world-level anchor —
the per-moon `anchors` map is invalid for Krynn), and pins the always-on
Therendor↔Barrakas anti-phase coupling lore mechanic. See §8 for the
full change-log. Subsequent revisions ride in their own PRs.

---

## 1. Package metadata

- **Name:** `@partybuff/calendar-engine`
- **Registry:** GitHub Packages (`https://npm.pkg.github.com`)
- **Auth:** consumers authenticate via `GITHUB_PACKAGES_TOKEN` in CI; local
  dev uses a `.npmrc` with a personal access token. Document the auth steps
  in the package README.
- **Module format:** ESM. The Roll20 wrapper is bundled with esbuild
  (`format: 'iife'`, `target: 'es2020'`), so the engine must be tree-shakeable
  ESM with no Node-only runtime imports (`fs`, `path`, etc.) in the modules
  this wrapper consumes. Pure modules only on the hot path. CommonJS would
  bundle but is discouraged.
- **Types:** ships its own `.d.ts`. No `@types/...` shim package.
- **Side effects:** the modules listed below must be marked
  `"sideEffects": false` (or list explicit side-effect files) so esbuild can
  drop unused exports.

## 2. Boundary rule

The Roll20 wrapper imports **only pure, deterministic functions and data**
from the engine. Anything that touches Roll20's runtime (`sendChat`,
`findObjs`, `state.*`, message dispatch, button HTML, persistent views,
command parsing, knowledge-tier UX) stays in `src/` of this repo and is
not the engine's concern.

The engine must not assume a host environment. No `window`, no `document`,
no `process.env`, no `globalThis.state`, no I/O.

## 3. Worlds the wrapper needs on day one

The Roll20 wrapper exposes a world selector with the following worlds. All
must be present in `worlds.list()` and resolvable via `worlds.get(id)`:

| id            | Label                  | Notes                              |
|---------------|------------------------|------------------------------------|
| `eberron`     | Eberron                | Has moons (12) and planar cycles   |
| `faerun`      | Faerûn (Harptos)       | Has moons (Selûne); intercalary    |
| `greyhawk`    | Greyhawk               | Has moons (Luna, Celene)           |
| `dragonlance` | Dragonlance (Krynn)    | Has moons (Solinari, Lunitari, Nuitari) |
| `exandria`    | Exandria               | Has moons (Catha, Ruidus)          |
| `mystara`     | Mystara                | Has moons (Matera)                 |
| `birthright`  | Birthright (Cerilia)   | Has moons (Lirovka)                |
| `gregorian`   | Earth (Gregorian)      | No moons in engine output (see §5) |

A world id is a stable string. Adding more worlds later is non-breaking.

**Runtime data is canon, not markdown.** The current per-world definitions
in `partybuff/calendar/src/worlds/*.ts`, `src/moon.ts`, and `src/planes.ts`
are the source of truth for concrete numbers (synodic periods, planar
cycle lengths, anchor dates, holiday calendars). When the engine package
is authored, harvest those files directly. Any synodic periods, anchor
years, or cycle lengths listed elsewhere in this doc or in `HISTORY.md`
are illustrative only and may have rounding drift.

## 4. Module layout

The wrapper imports from these subpaths. Names are proposed; the engine
author can adjust as long as the shapes survive.

```
@partybuff/calendar-engine/worlds      → world definitions + registry
@partybuff/calendar-engine/date        → serial date math
@partybuff/calendar-engine/moons       → moon phase calculation
@partybuff/calendar-engine/planes      → Eberron planar events
@partybuff/calendar-engine/colors      → color utilities + hex helpers
@partybuff/calendar-engine             → barrel re-export of the above
```

The wrapper prefers subpath imports so that unused systems (e.g., planes
for non-Eberron games) tree-shake cleanly.

## 5. API surface

All function inputs are validated by the engine; invalid inputs throw with
descriptive errors, not silent fallbacks. All outputs are immutable
(`readonly` fields or `Object.freeze`).

### 5.1 Worlds

```ts
type WorldId =
  | 'eberron' | 'faerun' | 'greyhawk' | 'dragonlance'
  | 'exandria' | 'mystara' | 'birthright' | 'gregorian';

interface World {
  readonly id: WorldId;
  readonly label: string;          // display name, e.g. "Eberron"
  readonly description: string;    // one-paragraph blurb
  readonly eraLabel: string;       // "YK", "DR", "CY", "PD", ""
  readonly calendar: WorldCalendar;
  readonly defaultDate: CalendarDate;
  readonly moons: readonly Moon[]; // empty if world has none in engine output
  readonly hasPlanarCycles: boolean; // true only for 'eberron' in v0.1.0
  readonly holidays: readonly Holiday[];
  readonly seasons: readonly Season[];
}

interface WorldCalendar {
  readonly weekdays: readonly string[];          // e.g. ['Sul','Mol','Zol','Wir','Zor','Far','Sar']
  readonly months: readonly Month[];             // canonical month list, never includes intercalaries
  readonly intercalaries: readonly Intercalary[]; // sibling list; empty if none
  readonly daysPerYear: number;                  // sum of all months + applicable intercalaries for a non-leap year
  readonly weekdayProgression: 'continuous' | 'month_reset' | 'festival_fixed';
}

interface Month {
  readonly index: number;                     // 0-based position in the canonical month list
  readonly name: string;                      // canonical, e.g. "Zarantyr", "Hammer"
  readonly aliases?: readonly string[];       // optional alternates (e.g. Faerûn "Old Calendar" names) — parse() accepts; format() ignores
  readonly days: number;                      // calendar days in this month
  readonly leapEvery?: number;                // optional: day-count of this month gains a day on years where year % leapEvery === 0 (e.g. Gregorian February)
}

interface Intercalary {
  readonly key: string;                       // stable, lowercase, e.g. 'shieldmeet', 'greengrass'
  readonly label: string;                     // "Shieldmeet", "Greengrass"
  readonly days: number;                      // calendar days in this intercalary on years where it applies
  readonly insertAfter: { monthIndex: number }; // intercalary sits between this month and the next
  readonly leapEvery?: number;                // optional: present only on years where year % leapEvery === 0 (e.g. Shieldmeet every 4)
}

// Discriminated union so consumers can't accidentally read monthIndex from an intercalary date.
type CalendarDate =
  | { readonly kind: 'month'; readonly year: number; readonly monthIndex: number; readonly day: number }
  | { readonly kind: 'intercalary'; readonly year: number; readonly intercalaryKey: string; readonly day: number };

// Holidays use the same discriminator pattern: fixed-date holidays know their slot;
// floating holidays declare a rule that resolves at query time (see §5.2 resolveHoliday).
type Holiday = FixedHoliday | FloatingHoliday;

interface FixedHoliday {
  readonly kind: 'fixed';
  readonly key: string;
  readonly label: string;
  readonly anchor: CalendarDate;              // month-or-intercalary date, year ignored
  readonly description?: string;
}

interface FloatingHoliday {
  readonly kind: 'floating';
  readonly key: string;
  readonly label: string;
  readonly rule: unknown;                     // opaque to the wrapper; engine owns the shape, consumers call resolveHoliday()
  readonly description?: string;
}

interface Season {
  readonly key: string;
  readonly label: string;
  readonly startMonthIndex: number;
  readonly startDay: number;
}

const worlds: {
  list(): readonly WorldId[];
  get(id: WorldId): World;        // throws on unknown id
};
```

**Notes on the date model:**
- Canonical month indices stay 1:1 with each world's cultural month list. Tarsakh is always
  Faerûn's `monthIndex: 3`; Shieldmeet is *not* `monthIndex: 4` — it's an `Intercalary` keyed
  `'shieldmeet'` that `insertAfter: { monthIndex: 6 }` (Flamerule). This protects external
  references that name a month by index.
- A "leap day of an existing month" (Gregorian Feb 29) is `Month.leapEvery: 4` on February;
  the day count goes from 28 → 29. A "leap intercalary" (Shieldmeet) is a whole
  `Intercalary` entry with `leapEvery: 4`. Different canon model, different shape.
- Date arithmetic transitions cleanly across the month/intercalary boundary; see §5.2.

### 5.2 Date math

Dates flow across the boundary as either `CalendarDate` (year/month/day) or
`Serial` (integer day count from a per-world epoch). The engine owns the
conversion. The wrapper never does its own day arithmetic.

```ts
type Serial = number; // integer; per-world epoch is internal to engine

const date: {
  // conversions
  toSerial(world: WorldId, date: CalendarDate): Serial;
  fromSerial(world: WorldId, serial: Serial): CalendarDate;

  // arithmetic
  advance(world: WorldId, date: CalendarDate, days: number): CalendarDate;
  retreat(world: WorldId, date: CalendarDate, days: number): CalendarDate;
  diffDays(world: WorldId, from: CalendarDate, to: CalendarDate): number;

  // calendar queries
  weekdayIndex(world: WorldId, date: CalendarDate): number;                        // index into world.calendar.weekdays
  daysInMonth(world: WorldId, year: number, monthIndex: number): number;           // never folds intercalaries in; returns the month's own count for that year
  daysInIntercalary(world: WorldId, year: number, intercalaryKey: string): number; // returns 0 on years where the intercalary doesn't apply (e.g. Shieldmeet on non-leap years)
  daysInYear(world: WorldId, year: number): number;                                // sums all months + applicable intercalaries
  isLeapYear(world: WorldId, year: number): boolean;

  // floating-holiday resolution: returns the concrete date for a holiday's rule on a given year, or null if it doesn't fall this year
  resolveHoliday(world: WorldId, year: number, holidayKey: string): CalendarDate | null;

  // parsing / formatting (lenient; engine owns the rules)
  parse(world: WorldId, input: string): CalendarDate | null;
  format(world: WorldId, date: CalendarDate, style?: 'long' | 'short' | 'ordinal'): string;
};
```

**Behavior commitments:**
- `advance`/`retreat` are inverses for non-negative inputs.
- `diffDays(a, b)` + `advance(a, n)` = `b` when `n = diffDays(a, b)`.
- `fromSerial(world, toSerial(world, d))` round-trips exactly.
- `advance` transitions cleanly across intercalary boundaries:
  Tarsakh-30 + 1 day = Greengrass-1; Greengrass-1 + 1 day = Mirtul-1.
  The wrapper never special-cases intercalary days.
- `parse` returns `null` on unparseable input; does not throw.
- `resolveHoliday` returns `null` for unknown keys, for years where a leap-only
  holiday doesn't apply, or for rules that don't have a date this year.

### 5.3 Moons

The wrapper needs moon **phases** only. Not sky position, not altitude,
not azimuth, not eclipse math. Anything related to where a moon sits in
the sky belongs to the web app side.

```ts
interface Moon {
  readonly key: string;            // stable, lowercase, e.g. 'olarune'
  readonly name: string;           // "Olarune"
  readonly title?: string;         // "The Sentinel" — optional flavor
  readonly color: string;          // hex, e.g. "#c7a25a"
  readonly cycleDays: number;      // synodic period, integer or decimal
  readonly associatedMonthIndex?: number; // for worlds where a moon "rules" a month
}

// Per-campaign anchor declaration. The phase discriminator lets a
// consumer declare either a known full or a known new moon date as
// the campaign's reference point; the engine takes it from there.
interface MoonAnchor {
  readonly year: number;
  readonly monthIndex: number;     // 0-based, into world.calendar.months
  readonly day: number;            // 1-based
  readonly phase: 'full' | 'new';
}

type MoonPhaseLabel =
  | 'New'
  | 'Waxing Crescent'
  | 'First Quarter'
  | 'Waxing Gibbous'
  | 'Full'
  | 'Waning Gibbous'
  | 'Last Quarter'
  | 'Waning Crescent';

interface MoonPhase {
  readonly moonKey: string;
  readonly illumination: number;   // 0.0 (new) .. 1.0 (full)
  readonly waxing: boolean;        // true while approaching full
  readonly label: MoonPhaseLabel;
  readonly isFull: boolean;        // engine decides threshold per world
  readonly isNew: boolean;         // engine decides threshold per world
  readonly longShadows: boolean;   // Eberron-only canon: see "Long Shadows note" below. false for all non-Eberron moons.
}

// Per-call options. The two anchor surfaces are world-specific:
// `anchors` for the per-moon map (Eberron, Faerûn, Greyhawk, Exandria,
// Mystara, Birthright, Gregorian) and `krynnAnchor` for Dragonlance's
// world-level Night-of-the-Eye conjunction.
interface PhaseOptions {
  readonly anchors?: Readonly<Record<string, MoonAnchor>>;
  readonly krynnAnchor?: CalendarDate;   // Dragonlance only; must be kind: 'month'
}

const moons: {
  // all moons for a world on a given date
  phasesOn(
    world: WorldId,
    date: CalendarDate,
    opts?: PhaseOptions,
  ): readonly MoonPhase[];

  // single moon, single date
  phaseOf(
    world: WorldId,
    moonKey: string,
    date: CalendarDate,
    opts?: PhaseOptions,
  ): MoonPhase;

  // when is the next Full / New for this moon, starting from date?
  // returns the date of that event, or null if not within `withinDays`.
  nextEvent(
    world: WorldId,
    moonKey: string,
    fromDate: CalendarDate,
    event: 'full' | 'new',
    withinDays?: number,           // default 365
    opts?: PhaseOptions,
  ): CalendarDate | null;
};
```

**Anchor model:**
- The `anchors` argument is keyed by `Moon.key`. Each entry overrides
  the engine's canonical anchor for that moon for the duration of the
  call. Moons not present in `anchors` use canon.
- Both `'full'` and `'new'` phases are accepted. A full-phase anchor
  replaces the moon's canonical reference date wholesale. A new-phase
  anchor is internally translated into a one-cycle nudge so the
  declared date lands as new; the standard cycle resumes from there.
- The engine reads anchors and emits phases deterministically. There is
  no "anchor lookup" side effect — pass the same `opts` blob for
  every query in a campaign and the engine will agree with itself.

**Dragonlance `krynnAnchor` — world-level anchor:**
- Krynn canon: Solinari, Lunitari, and Nuitari only conjunct on the
  Night of the Eye; the triad slides together as one event, never
  individually. Per-moon `anchors` entries for Krynn moons are
  non-canonical and the token consumer (§10) rejects them.
- `krynnAnchor` takes a single `CalendarDate` (`kind: 'month'` only;
  intercalary is invalid) and pins all three Krynn moons to full on
  that date. The engine internally synthesizes the equivalent
  triplet-anchor map.
- On non-Dragonlance worlds `krynnAnchor` is ignored — those worlds
  anchor via `anchors`.
- If both `anchors` and `krynnAnchor` are passed on a Dragonlance
  call, `krynnAnchor` wins inside the engine. The token format (§10)
  rejects the combination at parse time so producers must pick one.

**Always-on lore mechanics:**
The engine applies two canon mechanics with no opt-out short of a
consumer-supplied anchor for the affected moon.
- **Long Shadows** (Eberron): see "Long Shadows note" below.
- **Therendor ↔ Barrakas anti-phase coupling** (Eberron): Barrakas
  (cycle 63.3115d) drifts in loose anti-phase with Therendor
  (34.735d); each Barrakas full/new pair gets pulled toward
  Therendor's nearest full by `gain × phaseError`, clamped at
  ±1 day. The engine exports `COUPLING_GAIN = 0.2` and
  `COUPLING_MAX_SHIFT_DAYS = 1.0` from `@partybuff/calendar-engine/moons`
  for consumers that want to surface the values; both are constants
  in v0.2.x. A consumer-supplied anchor on Barrakas suppresses
  coupling for that moon (the explicit campaign intent wins).

**Removed from the Roll20 surface but the engine may still expose for the
web app:** sky position, altitude, azimuth, hour angle, eclipse detection,
sun-relative geometry. The wrapper does not import these.

**Long Shadows note:** the Roll20 wrapper *does* surface the Eberron Long
Shadows gobble effect via `MoonPhase.longShadows`. Long Shadows is a canon
event anchored at Vult 26–28 (with a tapered window — distance 0: ±3 days,
distance 1: ±2 days, distance ≥2: ±1 day).

**Mechanic — cycle-shift, not override.** For each affected moon, the
engine ships *pre-programmed one-cycle nudges* — the same internal
mechanism that translates a consumer-declared new-phase anchor (above)
into the standard math. The shift relocates that year's relevant new-
moon date to land within the gobble window; the cycle leading into that
new moon stretches or compresses to accommodate; the standard `cycleDays`
period resumes from the shifted new moon onward. The moon is *genuinely*
in its New phase on the gobble day — not "lit-but-rendered-dark."

`MoonPhase.longShadows: true` surfaces on phase output during the window
so renderers can visually distinguish a Long-Shadows-driven New from a
routine cycle New. The flag is rendering metadata only; the underlying
phase math is correct without it.

No GM tuning of the gobble window, no GM choice of which moons are
affected, no opt-out. The window dates, the affected moons, and the
per-year shift amounts are all canon and ship with the engine.

### 5.4 Planes (Eberron only)

The Roll20 wrapper surfaces planar events as entries in the **events**
list — not as their own subsystem. So the engine only needs to expose
"what planes are active on this date" and "when does the next phase change
happen." No subsystem-level queries, no randomization, no generated
drifts. Per-campaign anchor offsets (one number per plane) are accepted
via the optional `positions` argument; everything else is canon.

```ts
type PlanarPhase = 'coterminous' | 'remote' | 'neutral';

interface Plane {
  readonly key: string;            // 'daanvi', 'fernia', etc.
  readonly name: string;           // "Daanvi"
  readonly title: string;          // "The Perfect Order"
  readonly color: string;          // hex
  readonly associatedMoonKey?: string;
  readonly effects: {
    readonly coterminous: string;  // GM-facing one-liner
    readonly remote: string;
  };
}

interface PlanarState {
  readonly plane: Plane;
  readonly phase: PlanarPhase;
  readonly daysIntoPhase: number;
  readonly daysUntilNextPhase: number;
  readonly nextPhase: PlanarPhase;
  readonly phaseDuration: number;  // total days in the current phase
}

// Per-campaign anchor offset table. Keys are Plane.key, values are
// day-count offsets applied to the canonical cycle. Absent keys =
// canon position. Missing argument = all canon.
type PlanarPositions = Readonly<Record<string, number>>;

const planes: {
  // all planes for Eberron on a given date
  statesOn(date: CalendarDate, positions?: PlanarPositions): readonly PlanarState[];

  // single plane on a single date
  stateOf(planeKey: string, date: CalendarDate, positions?: PlanarPositions): PlanarState;

  // only the planes currently in a non-neutral phase (coterminous or remote)
  // — this is what the events list surfaces
  activeOn(date: CalendarDate, positions?: PlanarPositions): readonly PlanarState[];

  // upcoming phase changes in a window — for "what's coming up" lists
  upcoming(
    fromDate: CalendarDate,
    withinDays: number,
    positions?: PlanarPositions,
  ): readonly { plane: Plane; from: PlanarPhase; to: PlanarPhase; on: CalendarDate }[];
};
```

**Notes:**
- The engine seeds Eberron's planar cycles from canon. The `positions`
  argument lets a consumer (e.g. the web app, where GMs tune anchors)
  declare per-campaign offsets — one integer per plane. This is *not*
  the dropped "generated drifts" feature, which randomized off-cycle
  wobbles at runtime; that mechanic is permanently out. Per-campaign
  offsets are deterministic: the same `positions` blob always yields the
  same states.
- `WorldId` argument is omitted on plane functions because planes are
  Eberron-only in v0.1.0. If another world later gains planes, we revisit.
- `activeOn` exists so the Roll20 events view can do
  `events.concat(planes.activeOn(today))` without filtering neutrals client-side.
- `Plane.effects.coterminous` and `.remote` are literal strings in v0.1.0.
  If the web app eventually needs template interpolation (world date, NPC
  names, etc.), shape will evolve to something like
  `{ template: string; variables: Record<string, unknown> }`. The Roll20
  wrapper doesn't need that. Not a v0.1.0 blocker.

### 5.5 Colors

The wrapper renders chat HTML for Roll20. It needs hex strings per moon
and per plane (already on `Moon.color` and `Plane.color`), plus a couple
of contrast utilities so we don't ship readability bugs.

```ts
const colors: {
  // returns '#RRGGBB' or null
  sanitizeHex(input: string): string | null;

  // accepts hex or CSS color name; returns '#RRGGBB' or null
  resolve(input: string): string | null;

  // foreground that meets contrast on the given background
  textOn(bgHex: string): '#000000' | '#ffffff';
};
```

No per-month color in the engine. The wrapper will derive month colors
from `Moon.color` for worlds with month-aligned moons (Eberron), or fall
back to a static palette in `src/` for worlds without.

## 6. What is **not** in this contract

The engine may build these for the web app. The Roll20 wrapper does not
import them and the contract makes no commitments about their shape:

- Weather subsystem (climate matrices, location, seasonal modifiers,
  forecasting, narrative ambience)
- Time-of-day / sun position / horizon math
- Moon sky position (altitude, azimuth, compass, hour angle)
- Eclipse detection and eclipse math
- Forecast-lens knowledge-tier system (DC ladders, zones A/B/C/D, tails)
- Custom-event storage (lives in Roll20 `state.*`, not engine; tokens
  do **not** carry custom events — see §10)
- Anything UI: layouts, components, rolltemplates, button HTML
- Roll20 API objects (`sendChat`, `findObjs`, `playerIsGM`, etc.)

## 7. Versioning

- `0.1.0` — first published version. Anything in this document is fair
  game for breaking changes between minors during the `0.x` line.
- `1.0.0` — when both sides agree the API is stable enough to commit to
  semver. The Roll20 wrapper will pin a caret range (`^1.0.0`) at that
  point.
- The wrapper's `package.json` will track the engine version via a normal
  npm dep. A weekly cron in this repo opens a bump PR when a newer release
  is available (separate work, not part of this contract).

## 8. Resolved decisions

All seven open questions from the v0.1.0-draft were resolved with the
engine author on 2026-05-26. Decisions are now reflected in the schemas
above; they're listed here as a single change-log entry.

1. **Floating holidays** → declarative + `resolveHoliday(world, year, key)`.
   Storage is a key + rule descriptor (opaque to the wrapper); engine
   resolves to a concrete date on demand. (§5.1, §5.2)
2. **Long Shadows on `MoonPhase`** → kept. `MoonPhase.longShadows: boolean`
   is always present (false everywhere except Eberron under canon window).
   The gobble mechanic — tapered window distances ±3 / ±2 / ±1 — ports
   faithfully from the existing Roll20 implementation. (§5.3) *Revised
   in §8.1: cycle-shift mechanic, not phase-override.*
3. **`Serial` namespace** → per-world. No cross-world epoch exists in canon.
   (§5.2)
4. **Intercalary days** → not interleaved into the canonical month list.
   `WorldCalendar` gets a sibling `intercalaries: readonly Intercalary[]`,
   `CalendarDate` becomes a discriminated union with `kind: 'month' |
   'intercalary'`, `daysInMonth()` never folds intercalaries in, and
   `daysInIntercalary()` is the companion query. Date arithmetic transitions
   cleanly across the boundary. (§5.1, §5.2)
5. **Holiday floating sentinel** → discriminated union `FixedHoliday |
   FloatingHoliday` with a `kind` discriminator. No `-1` sentinels.
   Compile-time safety. (§5.1)
6. **Naming overlays** → canonical `Month.name` + optional
   `Month.aliases?: readonly string[]`. Wrapper renders canonical; `parse()`
   accepts aliases. (§5.1)
7. **Moonless worlds** → always present as `moons: readonly Moon[]` with
   `[]` when empty. Avoids `world.moons?.length` everywhere. (§5.1)

**Future-but-not-blocking:** `Plane.effects` strings will need templating
support eventually for web-app interpolation; not in v0.1.0.

### 8.1 Revision — per-campaign anchors, Long Shadows correction, cross-script token

This revision lifts the v0.1.0 "canon-only" stance to admit per-
campaign anchor data on both the moons and planes APIs, corrects
the Long Shadows mechanic from phase-override to cycle-shift, and
introduces the cross-script token format (§10). Roll20 setup that
used to live in the script's own menus (variant, palette, anchors)
now flows from the web app via a pasted token; the Roll20 script
becomes a viewer-plus-date-mover, never a configurator.

1. **Moons API — `anchors?` argument** added to `moons.phasesOn` /
   `phaseOf` / `nextEvent`. Keyed by `Moon.key`. Each entry overrides
   the engine's canonical anchor for that moon. Both `'full'` and
   `'new'` phases are accepted. (§5.3)
2. **Planes API — `positions?` argument** added to `planes.statesOn` /
   `stateOf` / `activeOn` / `upcoming`. Keyed by `Plane.key`. Each
   entry is an integer day offset applied to the canonical cycle.
   Generated drifts / randomization remain permanently out. (§5.4)
3. **Long Shadows — cycle-shift mechanic.** The affected moons'
   new-moon date for the year is moved into the Vult 26–28 gobble
   window via pre-programmed engine `phaseShifts`. The cycle around
   that shift stretches or compresses; the standard period resumes
   from the shifted new moon. The phase math is genuinely New on
   the gobble day. `MoonPhase.longShadows: true` stays as a
   rendering hint so consumers can visually distinguish a Long-
   Shadows-driven New from a routine cycle New. The previous
   "moon appears dark when it would otherwise be illuminated"
   wording was misleading and is retired. (§5.3)
4. **Cross-script token (§10).** Spec for a portable setup-only
   token that the web app emits and the Roll20 script consumes.
   Carries world id, current date, calendar variant, palette
   choice, lunar anchors, and planar anchor offsets — no campaign
   content (custom events, notes, weather, forecast). The Roll20
   script reads it via a single chat command and applies it to
   `state.PartyBuffCalendar`.

### 8.2 Revision — moons opts-bag, Dragonlance krynnAnchor, Therendor↔Barrakas coupling

Auditing the published engine surface against the worlds-canon list
exposed two gaps. The §8.1 per-moon `anchors` map was modelled on
Eberron/Faerûn/Greyhawk semantics (each moon anchored individually);
Dragonlance does not allow individual moon anchors at all, and the
Eberron Therendor↔Barrakas anti-phase coupling lore mechanic was
missing from the engine surface (the wrapper carried a sequence-based
port of it that the inflection-based engine couldn't host). This
revision lands both in the engine and reshapes the moons API.

1. **Moons API — `PhaseOptions` opts bag.** `moons.phasesOn` /
   `phaseOf` / `nextEvent` now take a single `opts?: PhaseOptions`
   argument in place of the positional `anchors?`. The opts shape is
   `{ anchors?, krynnAnchor? }`. Pre-publish refactor — the §8.1
   `anchors?` signature was never shipped in a stable engine release,
   so the reshape doesn't break any pinned consumer. (§5.3)
2. **Dragonlance `krynnAnchor`.** New `krynnAnchor?: CalendarDate`
   option (kind `'month'` only) and matching `Token.krynnAnchor` field
   pin all three Krynn moons to full on Night of the Eye. Per-moon
   anchors for Krynn moons are non-canonical and the token validator
   rejects them; legacy producer tokens that triplicated the
   conjunction across `lunarAnchors.solinari` / `.lunitari` /
   `.nuitari` are accepted-with-translation as a v=1 transition
   affordance. (§5.3, §10.1, §10.2.11–12)
3. **Therendor ↔ Barrakas anti-phase coupling (Eberron, always-on).**
   The engine now applies the canon coupling per cycle: Barrakas's
   full/new pair gets pulled toward Therendor's nearest full by
   `gain × phaseError`, clamped at ±1 day. A consumer-supplied
   anchor on Barrakas suppresses coupling. The constants
   `COUPLING_GAIN = 0.2` and `COUPLING_MAX_SHIFT_DAYS = 1.0` are
   exported from `@partybuff/calendar-engine/moons` for consumers
   that want to surface them. (§5.3)

## 9. Reference: what the wrapper does with this

For grounding. None of this affects the contract.

- **State persistence:** Roll20 wrapper persists `{ worldId, currentDate,
  variant, palette, lunarAnchors, planarAnchors, viewPreferences,
  schemaVersion }` in `state.PartyBuffCalendar`. There are no
  `customEvents` — event content is engine canon only, configured per-
  campaign via packs that the web app gates and the Roll20 surface
  shows wholesale (no per-pack toggle in Roll20).
- **GM commands:** `!cal set date <date>`, `!cal advance [N]`,
  `!cal retreat [N]`, `!cal token <paste>`, `!cal resetcalendar`,
  `!cal help`. The `!cal event` / `!cal source` / `!cal theme` /
  `!cal variant` / `!cal seasons` families from the pre-revision
  script are retired; their configuration moves entirely to the web
  app and flows in via §10 tokens.
- **Views:** today, month (with adjacent shoulder week), rolling 3-
  month, year, next year, previous year, lunar (full moons list),
  planar (planes list). Button-first UX; `!cal` is the only chat
  entry point.
- **Player surface:** read-only views, no admin controls. No knowledge
  tiers — full information for all players.

## 10. Cross-script token format

The Roll20 wrapper and the `@partybuff/party-buff` web app share
`@partybuff/calendar-engine` and therefore compute dates, moons,
and planes identically given the same anchors. To let GMs configure
their calendar in the web app — where setup-heavy operations (anchors,
variants, palettes) have a real UI — and apply that configuration to
a running Roll20 game, both sides agree on a portable token format.

The token carries **setup only** — never campaign content. Custom
events, custom moons, notes, lore, weather, and forecast gating all
stay on the web. The token is a stateless snapshot the Roll20 side
can replay over its `state.PartyBuffCalendar` blob.

### 10.1 Wire format

A token is the base64 encoding (standard alphabet, padding optional)
of a UTF-8 JSON object with this shape:

```ts
interface Token {
  readonly v: 1;                                          // schema version; consumers reject v > supported
  readonly world: WorldId;                                // see §3
  readonly date: CalendarDate;                            // see §5.1
  readonly variant?: string;                              // calendar variant key (e.g. 'standard') — absent = world default
  readonly palette?: string;                              // month-header palette key — absent = world default
  readonly lunarAnchors?: Readonly<Record<string, MoonAnchor>>;   // see §5.3 — invalid on Dragonlance (use krynnAnchor)
  readonly krynnAnchor?: CalendarDate;                    // Dragonlance only; kind: 'month'; see §5.3
  readonly planarAnchors?: Readonly<Record<string, number>>;     // see §5.4 (PlanarPositions); Eberron only
}
```

Optional fields absent from the token mean "use the world's default";
do not interpret absence as "clear the receiver's existing setting."

Producers SHOULD omit fields equal to the world's default rather than
include them, so tokens stay small (~200–400 chars base64 typical) and
forward-compatible (a future default change automatically applies to
old tokens).

### 10.2 Validation rules

A consumer (Roll20 wrapper, or any third party) MUST reject a token
when:

1. `v` is not an integer or is greater than the consumer's supported
   schema version. Error: *"this token requires a newer version of
   the calendar."*
2. `world` is not a known `WorldId`. Error: *"unknown world '<id>'."*
3. `world` doesn't match the consumer's currently-configured world.
   The consumer MAY prompt to switch worlds, but MUST NOT silently
   overwrite.
4. `date` is not valid for the declared world (out-of-range
   `monthIndex`, `day` exceeds `daysInMonth` / `daysInIntercalary`,
   unknown `intercalaryKey`).
5. `variant` is non-empty but isn't a known variant for the world.
6. `palette` is non-empty but isn't a known palette key.
7. Any `lunarAnchors` key isn't a moon known to the world.
8. Any `lunarAnchors` entry's date is invalid for the world, or its
   `phase` is not `'full'` or `'new'`.
9. Any `planarAnchors` key isn't a plane known to the world. Planes
   are Eberron-only; non-Eberron tokens with a non-empty
   `planarAnchors` are invalid.
10. The decoded payload is not valid JSON or is not a plain object.
11. `krynnAnchor` is present on a non-Dragonlance token, or its
    `kind` is not `'month'`, or any of its `year` / `monthIndex` /
    `day` fields are missing / wrong type / out-of-range for the
    world's calendar.
12. A Dragonlance token carries `lunarAnchors` with any non-Krynn moon
    key (Dragonlance has no other moons in canon), OR with Krynn keys
    (`solinari` / `lunitari` / `nuitari`) that disagree on date or
    phase (the triad must conjunct as one event), OR carries both
    `krynnAnchor` and `lunarAnchors` (ambiguous intent — pick one).
    Consumers MAY accept a Dragonlance token whose `lunarAnchors`
    triplicates the same conjunction across all three Krynn keys
    (the legacy producer shape) and translate it to `krynnAnchor`
    on application; this is a transition affordance for v=1.

Validation failures surface the engine's human-readable error
message to the GM (via `/w gm` for Roll20).

### 10.3 Application semantics

When applying a validated token to a running calendar state:

1. Overwrite `worldId`, `variant`, `palette`, `lunarAnchors`,
   `planarAnchors`, `currentDate` with the token's values. For fields
   absent from the token, fall back to the world's defaults (NOT to
   the receiver's pre-existing value).
2. Do **not** touch non-setup state — view preferences, command
   history, etc.
3. Surface two GM-whispered confirmations:
   - *"New configuration loaded. Use `!cal` to begin."*
   - If the previous `currentDate` differs from the token's `date`:
     *"The previous date was X. The new date is Y."* — so the GM
     can `!cal set` the old date back if they want.

### 10.4 Generation semantics

Producers of tokens (the web app's "Copy configuration" affordance)
read setup fields from the resolved campaign state and emit a token
containing the current value of each. Producers SHOULD omit any
field that's at the world's default — that keeps tokens small and
forward-compatible (a future engine release that adjusts a default
automatically flows through old tokens).

### 10.5 Forward compatibility

`v` is the only versioning surface. A consumer reading a known `v`
MAY ignore unknown top-level fields (engines may add metadata in
patch releases). A consumer reading `v > supported` MUST refuse with
the error from §10.2.1 and MUST NOT attempt a partial application.

When the engine releases a schema change requiring `v > 1`, both
this contract and the producer / consumer implementations bump in
the same release window. Mixed-version pastes fail loud, not silent.

---

*Status: v0.1.0 baseline with §8.1 + §8.2 revisions. §8.2 engine
implementation (opts-bag refactor, `krynnAnchor`, Therendor↔Barrakas
coupling) shipped in `@partybuff/calendar-engine@0.2.4`. Roll20
wrapper consumption follows in this repo: token validator updates
land with this revision; the moon/plane query call sites (PR 2c)
follow once the engine bump merges. Subsequent contract revisions
ride in their own PRs.*
