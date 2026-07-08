# Party Buff's Roll20 Calendar

A Roll20 API script for managing a fantasy campaign calendar with:
- graphical mini-calendar displayed in chat, with toggleable subsystems:
	- events tracking
	- moon phase tracking
	- planar movements (Eberron setting)

**Supports:** Eberron, Forgotten Realms, Greyhawk, Dragonlance, Exandria, Mystara, Birthright, Earth (Gregorian)

This script is the in-game companion to the [Party Buff](https://github.com/partybuff) calendar app — the web app handles the wide-canvas planning surface (rich weather, time-of-day, theming, custom events) while Roll20 is the at-the-table view. Future versions will let the two link so dates and events sync between them automatically.

---

<details>
<summary><strong>Recommended In-Game Macros</strong></summary>

Create these as Roll20 macros for quick-bar access:

| Macro Name | Command | Notes |
| --- | --- | --- |
| Calendar | `!cal` | Opens the Today dashboard |
| Show Month | `!cal show month` | Current month view |
| Moons | `!cal moon` | Moon detail |
| Planes | `!cal planes` | Planar status |
| Advance 1 | `!cal advance 1` | GM only — advance one day |
| Retreat 1 | `!cal retreat 1` | GM only — retreat one day |
| Send Month | `!cal send month` | GM only — broadcast month to all |
| Help | `!cal help` | Command reference |

**Tip:** Mark GM-only macros as token actions so they appear in your GM toolbar but not for players.

</details>

---
<a id="table-of-contents"></a>
## Table of Contents

- [Installation](#installation)
- [How to Use](#how-to-use)
- [Calendar Navigation](#calendar-navigation)
- [Events](#events)
- [Moons](#moons)
- [Planes](#planes)
- [Command Reference](#command-reference)
- [Development](#development)
- [Supported Settings](#supported-settings)

---

## Installation

<details open>
<summary>Show installation steps</summary>

1. In Roll20, open your campaign's **API Scripts** page (Game Settings → API Scripts).
2. Create a new script and paste in the contents of `calendar.js`.
3. Save. It initializes automatically on first load.

</details>

### GitHub-built paste artifact

GitHub Actions already typechecks, tests, and builds the script on every push to `main`, every pull request to `main`, and on manual `workflow_dispatch` runs.

Each successful run uploads a `calendar-js` artifact containing the built `calendar.js`. That means agents can keep working only in `src/` and related docs/tests while the generated Roll20 upload file stays out of git.

To get a paste-ready build from GitHub:

1. Open the repo's **Actions** tab
2. Open the latest successful `CI` run for the branch or commit you want
3. Download the `calendar-js` artifact
4. Unzip it and paste `calendar.js` into the Roll20 API Scripts editor

Artifact note: GitHub Action artifacts are temporary build outputs, not permanent release files. The workflow currently keeps them for 30 days.

### Local manual build

If you want to build locally instead of downloading from GitHub:

1. Install Node.js 22+
2. Run `npm ci`
3. Run `npm run check`
4. Run `npm run build`
5. Optional PowerShell smoke check: `powershell -ExecutionPolicy Bypass -File .\test\calendar_smoke.ps1`
6. Paste the generated `calendar.js` into Roll20

The old browser-extension launcher was removed because it depended on a workflow that no longer works reliably. The supported local path is now "build, optionally smoke-check, then paste."

### GitHub Releases for stable versions

This repo also has a separate release workflow for permanent downloads.

- CI artifacts are for normal day-to-day builds
- GitHub Releases are for stable versioned builds you may want to keep and come back to later

A release happens automatically whenever the `version` in `package.json`
changes on `main`: GitHub Actions typechecks, tests, builds, and publishes
`calendar.js` to a GitHub Release for that version. You can also trigger a
release by pushing a `v*` tag manually. Either way, GitHub Actions will:

1. Typecheck, test, and build the project again
2. Create a GitHub Release for that version if one does not exist yet
3. Attach the built `calendar.js` file to that release as a downloadable asset

That means you do not need to commit `calendar.js` to git just to have a durable Roll20 upload file.

Manual release flow (if you want to cut a specific version by hand):

```bash
git tag v0.9.0
git push origin v0.9.0
```

Then open the repo's **Releases** page, download the attached `calendar.js`, and paste it into Roll20.

The permalink for the latest release is:

```
https://github.com/partybuff/calendar/releases/latest/download/calendar.js
```

This URL always serves the most recently published release's `calendar.js`, so GMs can bookmark it and re-download whenever a new version is tagged.

### Automatic engine updates

The wrapper depends on `@partybuff/calendar-engine`, published from the
`partybuff/party-buff` monorepo. You never bump that dependency by hand:

- In the monorepo, bumping the engine's `package.json` version and merging
  to `main` auto-publishes it to GitHub Packages.
- Here, a daily workflow (`check-engine-updates.yml`) notices the newer
  engine, regenerates `package-lock.json`, runs the full check, bumps this
  package's patch version, and opens a PR. Merging that PR cuts a new
  `calendar.js` release (above). The only manual step left in the whole
  chain is pasting the new `calendar.js` into Roll20 — Roll20 has no deploy
  API, so that part is unavoidable.

One-time repo settings to make this fully hands-off (Settings → Actions →
General → Workflow permissions):

- Enable **"Allow GitHub Actions to create and approve pull requests"** so
  the bump PR can be opened.
- For zero-click merges, add an `AUTOMATION_PAT` secret (a fine-scoped PAT
  with `contents` + `pull_requests` write) and enable **"Allow auto-merge"**
  with a required `CI` check. Without the PAT the bump PR still appears;
  you just click merge.

The `PACKAGES_TOKEN` secret (already used by CI) must stay set — it
authenticates installs of the private engine package.

[Return to Table of Contents](#table-of-contents)

---

## How to Use

<details open>
<summary>Show the basic startup flow</summary>

On a brand-new campaign, only the GM sees the first-run prompt:
> Welcome to Calendar! It looks like this is the first time Calendar has been used in this game. Would you like to initialize it?

Choose `Yes` to run the onboarding wizard or `No` to dismiss it for now. The GM can always resume by typing `!cal`.

After setup is complete:
- `!cal` opens the compact Today dashboard
- `!cal help` opens the task-focused root help menu
- `!cal show month` and `!cal send month` open or share the full month grid

Players who use `!cal` before the GM finishes setup get a waiting message instead of setup or admin controls.

All script-emitted Roll20 chat output currently uses `noarchive`.

</details>

[Return to Table of Contents](#table-of-contents)

---

## Calendar Navigation

<details>
<summary>Show navigation layout and button meanings</summary>

The default `!cal` and `!cal today` views open a compact Today panel instead of dropping straight into the full month stack.

The GM panel shows:
- Current date (bold)
- Today's events/holidays
- Notable moon phases (ascendant, new, full)
- Notable planar states (coterminous, remote)
- Step buttons (⬅ / ➡), Send Today View to Players, and an Additional Options menu for subsystem detail views and admin

Players see the same informational sections without step/admin controls.

Use `!cal show ...` or `!cal send ...` when you want the traditional month/year calendar render. The root help menu (`!cal help`) is also task-focused and includes prompt buttons for `!cal set`, `!cal add`, `!cal addmonthly`, `!cal addyearly`, `!cal moon on`, `!cal planes on`, and `!cal send`.

</details>

### Persistent Player Surfaces

- Roll20 handout creation and refresh are temporarily disabled.
- Editable handout/reference content lives in `Handouts/Events.md`, `Handouts/Lunar.md`, and `Handouts/Planar.md`.
- The script still supports the live Moon Phase page. Bind an existing page named `Moon Phase`, or bind any other existing page by name with the moon page commands below.
- Player movement to the live Moon page is explicit: the page redraws automatically when state changes, but players are only moved there when the GM uses `!cal moon page show`.

[Return to Table of Contents](#table-of-contents)

---
## Events

<details>
<summary>Show event behavior and source notes</summary>

### General
- Individual cells within the minical are color-filled on the day of an event.
- For days with multiple events, small colored dots appear beneath the numbered date.
- Each cell can be hovered over with a mouse to show a tooltip containing the event information.
### Pre-Included
* All published holidays are pre-included in the script. Each is assigned a color.
* Every pre-included holiday can be individually toggled on or off.
* Additionally, holidays are grouped by Source, allowing for entire categories to be toggled on or off.
* Switching between calendar systems applies source compatibility through automatic source suppression, while GM manual source disables persist across calendar-system changes.
### GM Generated
- GMs can create their own events, which are then stored in state.
- There is no limit to the number of events created. They can be deleted as necessary.
- If no color is assigned at creation, a random color is assigned.

</details>

[Return to Table of Contents](#table-of-contents)

---
<a id="moons"></a>
## Moons: Modeling the Skies

<details>
<summary>Show moon-system modeling details</summary>

The script models the sky as a physical system rather than flavor-only text. Moon brightness, movement, nighttime lighting, and everything else all derive from explicit numbers. The goal is to create a constantly advancing game-world state that requires little GM intervention, and generates useful mechanics and information for D&D.

### Observer Model

- The model cares about **apparent sky geometry.**
- The script does **not** track latitude, longitude, or time zones.
- It does not make a declared cosmological stance. It does not worry about sidereal orbital periods, nor the motion of distant stars or constellations (for now). 
- Sky reports are intentionally local and practical: they answer "what do we see where we are?" instead of simulating a full global observatory model.
- Time is presented as broad play-facing buckets such as early hours, morning, afternoon, evening, and night.
- Inclination matters mainly for **where** a moon appears in the sky and **how often** it can line up for crossings or eclipses; it is not treated as a second weather engine.

In practice, the sky model is optimized for play-facing observables: phase, brightness, apparent motion, and dramatic alignments. It is meant to answer "what can the characters notice tonight?" rather than produce a full latitude-by-latitude astronomy simulator.
### Moons

Lunar calendars are classic, and mechanically relevant for nighttime lighting.

Moon phases are intentionally flexible as a narrative tool. GMs can anchor any moon to a full or new phase on a chosen date, and the script then continues forward using the moon's regular motion from that anchor.

| System | Moon | Synodic Period | Diameter | Distance | Inclination | Eccentricity | Albedo | Epoch Anchor |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Earth | Luna | 29.53 days | 2,159 mi | 238,855 mi | 5.14° | 0.0549 | 0.12 | 2021-01-28 (full moon) |
| Faerûn | Selûne | 30.44 days | 2,000 mi | 183,000 mi | 5.1° | 0.054 | 0.25 | 1372-01-01 (full at midnight Hammer 1, 1372 DR) |
| Eberron | 12 moons | Mixed | Mixed | Mixed | Mixed | Mixed | Mixed | 998-01-01 default seed anchor |

- **Faerûn tilt note:** Selûne's inclination is retained for consistent sky geometry and future-proofing, even in a one-moon system.

Setting-specific moon data (orbital parameters, lore, and cosmological features) is documented under each setting in [Supported Settings](#supported-settings).

</details>

[Return to Table of Contents](#table-of-contents)

---
## Planes

<details>
<summary>Show planar alignment model</summary>

The planar subsystem tracks Planes of Existence and their alignment cycles. In this system, a plane can be **coterminous**, **remote**, or **neither**. The specific planes and cycle structures are setting-dependent — see [Supported Settings](#supported-settings) for details.

**Coterminous** planes strengthen their associated traits.

**Remote** planes suppress or invert those same traits.

Planar events are canon-anchored — the cycles follow published setting material. The script surfaces them as entries in the events list.

When a GM uses `!cal planes send ...`, players receive a non-interactive summary and the GM receives the full interactive panel back as a whisper. All of those messages currently use `noarchive`.

</details>

[Return to Table of Contents](#table-of-contents)

---

## Command Reference

<details>
<summary>Show the complete typed command reference</summary>

Most play should happen through the in-chat buttons. When typed syntax matters, the script whispers the relevant usage in Roll20. This section is the complete typed command reference for the current script.

### Date Input Rules

#### Month navigation for `!cal`, `!cal show`, and `!cal send`

Bare `!cal` opens the task-focused Today dashboard after setup completes. Once you add a range token, top-level `!cal` behaves like `!cal show` and `!cal send`: it renders a whole month or year, not a single-day card.

```text
!cal
!cal show month
!cal send month
!cal Zarantyr
!cal 1
!cal Zarantyr 998
!cal 1 998
!cal Rhaan 14
!cal Rhaan 14 998
!cal this month
!cal next month
!cal last month
!cal this year
!cal next year
!cal last year
```

Exact-date month jumps still work when you include a month:

```text
!cal Rhaan 14
!cal 9 14
!cal Rhaan 14 998
!cal 9 14 998
!cal first Sul of Aryth 998
```

Bare day-only inputs such as `!cal 14` or `!cal 1st` are rejected here; include a month.

#### Single-date specs

These are used by commands such as `!cal set`, `!cal setup date use`, `!cal moon on`, `!cal moon full`, `!cal planes on`, `!cal planes anchor`, and one-time event creation.

```text
14
Rhaan 14
9 14
Rhaan 14 998
9 14 998
1st
fourteenth
Midwinter
Growfest 3
```

A numeric month is the **real-month** ordinal (`1`–`12`), counting only the
named months — intercalary festivals are skipped, so `9 14` is the 9th real
month regardless of how many festivals precede it. **Intercalary festivals
are set by name** (`Midwinter`, `Shieldmeet`, `Growfest 3`); a bare festival
name lands on its first day.

#### Recurring event day specs

```text
6
18-19
first Sul
last Zor
every Sul
```

#### Source priority

- Priority `1` is the primary default-source event for a date and supplies the calendar cell color when multiple source-pack events land on the same day.
- Unranked sources (`-` in the UI) are tied for last.
- User-added events always outrank source-pack defaults.

### Core Calendar

```text
!cal
!cal show [range...]
!cal send [range...]
!cal now
!cal today
!cal list
!cal help [root|calendar|themes|seasons|eventcolors]
!cal effects
!cal set <dateSpec>
!cal advance [days]
!cal retreat [days]
```

The Today dashboard and root help menu also expose `Prompt !cal ...` buttons for `set`, `send`, `add`, `addmonthly`, `addyearly`, `moon on`, and `planes on`. Those buttons submit the same typed commands listed here.

### Setup and Onboarding

Before setup is complete, GM `!cal` starts or resumes onboarding and players get a waiting message. Most setup should happen through the buttons, but these are the underlying typed commands:

```text
!cal setup
!cal setup start
!cal setup resume
!cal setup restart
!cal setup dismiss

!cal setup calendar <system>
!cal setup variant <variant>
!cal setup date default
!cal setup date use <dateSpec>
!cal setup season <variant>
!cal setup hemisphere (north|south)
!cal setup theme (default|<theme>)
!cal setup defaults (on|off)
!cal setup moons (on|off)
!cal setup planes (on|off)
!cal setup review
!cal setup apply
```

### Settings and System Controls

```text
!cal settings
!cal settings (group|labels|events|moons|planes|offcycle|buttons) (on|off)
!cal settings density (compact|normal)
!cal settings mode (moon|lunar|planes|plane|planar) (calendar|list|both)
!cal settings verbosity (normal|minimal)

!cal theme list
!cal theme <name>
!cal theme reset

!cal calendar
!cal calendar <system> [variant]
!cal seasons
!cal seasons <variant>
!cal hemisphere
!cal hemisphere (north|south)
!cal resetcalendar
```

### Moon Commands

`!cal lunar` is an alias for `!cal moon`.

#### Moon views

```text
!cal moon
!cal moon lore [MoonName|siberys]
!cal moon info [MoonName|siberys]
!cal moon sky [middle_of_night|early_morning|morning|afternoon|evening|nighttime]
!cal moon visible [time]
!cal moon up [time]
!cal moon view <MoonName> [dateSpec]
!cal moon cal <MoonName> [dateSpec]
!cal moon on <dateSpec>
!cal moon date <dateSpec>
```

`!cal moon sky` also accepts the old convenience aliases `midnight`, `dawn`, `noon`, and `dusk`, but the script resolves them into the six canonical time buckets.

#### Sending moon info to players

```text
!cal moon send low
!cal moon send medium [1w|1m|3m|6m|10m|Nd|Nw]
!cal moon send high [1w|1m|3m|6m|10m|Nd|Nw]
```

Examples:

```text
!cal moon send medium 3m
!cal moon send high 10m
```

#### GM moon controls

```text
!cal moon seed <word>
!cal moon full <MoonName> <dateSpec>
!cal moon new <MoonName> <dateSpec>
!cal moon reset [MoonName]
!cal moon page bind <page name>
!cal moon page refresh
!cal moon page show
```

Examples:

```text
!cal moon full Aryth 14
!cal moon new Zarantyr Rhaan 14
!cal moon full Therendor Rhaan 14 998
```

`!cal moon page bind <page name>` only binds to an existing Roll20 page. Once bound, the script redraws that page automatically on date and moon-state changes, and `!cal moon page show` moves the shared player bookmark there explicitly.

### Plane Commands

`!cal planar` is an alias for `!cal planes`.

#### Plane views

```text
!cal planes
!cal planes on <dateSpec>
!cal planes date <dateSpec>
```

#### Sending plane info to players

```text
!cal planes send low
!cal planes send medium [1m|3m|6m|10m|Nd|Nw]
!cal planes send high [1m|3m|6m|10m|Nd|Nw]
```

Examples:

```text
!cal planes send medium 6d
!cal planes send high 3m
```

`!cal planes send ...` gives players a non-interactive summary and whispers the interactive control panel back to the GM. All of those messages currently use `noarchive`.

#### GM plane controls

```text
!cal planes set <PlaneName> <phase> [days]
!cal planes clear [PlaneName]
!cal planes anchor <PlaneName> <phase> <dateSpec>
!cal planes seed <PlaneName> <year|clear>
!cal planes suppress <PlaneName> [dateSpec]
```

`!cal planes clear <PlaneName>` clears that plane's direct override, anchor, GM custom event, and seed override. `!cal planes clear all` also resets the Fernia/Risia link mode to the campaign-seeded default.

Examples:

```text
!cal planes anchor Fernia coterminous Lharvion 1 996
!cal planes suppress Syrania
!cal planes suppress Dolurrh Aryth 12 998
```

### Event and Source Commands

#### Event commands

`!cal events` is the grouped interface. The direct shortcuts below call the same logic.

```text
!cal events list
!cal events add <dateSpec> <name> [#COLOR|color]
!cal events remove [list|key <KEY>|series <KEY>|<name fragment>]
!cal events restore [all] [exact] <name...>
!cal events restore key <KEY>

!cal add <dateSpec> <name> [#COLOR|color]
!cal remove [list|key <KEY>|series <KEY>|<name fragment>]
!cal restore [all] [exact] <name...>
!cal restore key <KEY>
!cal addmonthly <daySpec> <name> [#COLOR|color]
!cal addyearly <Month> <DD|DD-DD|ordinal-day> <name> [#COLOR|color]
!cal addyearly <first|second|third|fourth|fifth|last> <weekday> [of] <Month> <name> [#COLOR|color]
!cal addannual ...
```

Examples:

```text
!cal add 14 Market Day
!cal add Rhaan 14 Boldrei's Feast gold
!cal add Rhaan 14 998 Mourning Bell #6D4C41
!cal addmonthly first Sul Guild Meeting
!cal addyearly Aryth 13 Wildnight
!cal addyearly last Sul of Vult Harvest Supper
```

#### Event source commands

```text
!cal source list
!cal source enable <name>
!cal source disable <name>
!cal source up <name>
!cal source down <name>
```

</details>

[Return to Table of Contents](#table-of-contents)

---

## Development

<details>
<summary>Show project structure and build instructions</summary>

The source code lives in `src/` as TypeScript modules. A build step bundles them into the single `calendar.js` file that Roll20 consumes.

### Prerequisites

- Node.js 22+
- `npm ci` to install dev dependencies

### Commands

| Command | Description |
| --- | --- |
| `npm run build` | Bundle `src/` into `calendar.js` via esbuild |
| `npm test` | Run all tests via `node --test` with tsx |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run check` | Typecheck + test in one step |

### Project structure

```
src/
  config.ts         — User-editable configuration constants
  constants.ts      — Calendar systems, themes, palettes
  date-math.ts      — Serial date math, leap years
  color.ts          — Color utilities (delegates to engine)
  state.ts          — Roll20 state management
  parsing.ts        — Date parsing, fuzzy matching
  events.ts         — Event model, occurrences, ranges
  rendering.ts      — HTML rendering, mini-calendars
  ui.ts             — GM menus, theme/season UI
  commands.ts       — Command routing
  today.ts          — Combined today view
  moon.ts           — Moon phases
  planes.ts         — Planar cycles, effects
  messaging.ts      — Chat messaging utilities
  persistent-views.ts — Roll20 handout / page bindings
  worlds/           — World definitions (Eberron, Faerûn, etc.)
  showcase/         — Legacy sky-position math (quarantined; used by moon.ts only)
  init.ts           — Initialization, public API
  index.ts          — Entry point for bundler
  types/roll20.d.ts — Roll20 global type declarations
test/
  calendar_smoke.mjs — Node smoke check against the built bundle
  calendar_smoke.ps1 — PowerShell variant (Windows paste workflow)
  *.test.ts         — Tests organized by module
```

### Workflow

1. Edit TypeScript source in `src/`
2. Run `npm run check`
3. Run `npm run build` to regenerate `calendar.js`
4. Optional bundle smoke check: `powershell -ExecutionPolicy Bypass -File .\test\calendar_smoke.ps1`
5. Commit source changes (the built `calendar.js` remains gitignored)

CI runs typecheck, tests, build, and the PowerShell smoke check on every PR and uploads the built `calendar.js` as a downloadable GitHub Actions artifact. Tagged releases rebuild the script and attach `calendar.js` as a permanent release asset. The repo no longer ships a browser-sync launcher; the supported paths are GitHub artifact/release download or manual local build plus paste.

</details>

[Return to Table of Contents](#table-of-contents)

---

## Supported Settings

Switch settings via the setup wizard (`!cal setup`) or Admin panel (`!cal` → Admin).

<details>
<summary><strong>Eberron</strong></summary>

- **Calendar:** Galifar Calendar — 12 months × 28 days (336-day year), 7-day week (Sul–Sar), YK era
- **Variants:** Galifar (standard), Druidic, Halfling, Dwarven month names
- **Moons:** 12 moons, one per month, each tied to a plane and Dragonmark. Synodic periods range from 27 to 102 days. Full system with eclipses, conjunctions, and Long Shadows.
- **Planes:** 13 transitive/outer planes with coterminous/remote cycles, manifest zones, and timed overrides
- **Events:** Sharn, Khorvaire, Sovereign Host, Dark Six, Silver Flame, and Stormreach event packs

#### Cosmology

Eberron is modeled as Earth-like for baseline astronomical geometry (including axial tilt assumptions for daylight-length variation across the year). **Temperature is not driven by axial/solar-season physics** — seasonal weather pressure is handled through the planar/weather system instead. Axial tilt mostly shows up as broad seasonal daylight framing: longer summer days, shorter winter days, and corresponding shifts in the coarse time-of-day buckets.

#### Ring of Siberys

- Single equatorial ring at **0° inclination**
- Uses **Saturn's rings** as the physical analog, scaled to fit inside Zarantyr's orbit
- Extends roughly **370 to 3,480 miles (600 to 5,600 km)** above the surface
- **Albedo 0.50**, tuned to preserve the setting goal that the ring is visibly bright even by day
- Contributes about **0.008 lux** of nighttime illumination, forming most of the ~0.010 lux ambient clear-night baseline with starlight
- The outer edge sits about **2,300 km / 1,430 mi inside Zarantyr's mean orbit**, so the Ring never overlaps the nearest moon's track

#### Moons of Eberron

The Eberron implementation uses fixed synodic periods on a 336-day year scaffold. Exact full/new peaks only move when an external force does so deliberately: festival nudges, canonical associated-plane windows, Long Shadows gobbling, GM anchors, or the Therendor/Barrakas anti-phase coupling.

`Full` means at least `98.004%` illumination; `New` means at most `1.996%` illumination.

| Moon | Title | Plane | Dragonmark | Synodic Period | Apparent Size | Albedo |
| --- | --- | --- | --- | ---: | ---: | ---: |
| Zarantyr | The Storm Moon | Kythri | Mark of Storm | 27.32 days | 9.08x | 0.12 |
| Olarune | The Sentinel Moon | Lamannia | Mark of Sentinel | 30.81 days | 5.73x | 0.22 |
| Therendor | The Healer's Moon | Syrania | Mark of Healing | 34.74 days | 2.91x | 0.99 |
| Eyre | The Anvil | Fernia | Mark of Making | 39.17 days | 2.38x | 0.96 |
| Dravago | The Herder's Moon | Risia | Mark of Handling | 44.16 days | 2.66x | 0.76 |
| Nymm | The Crown | Daanvi | Mark of Hospitality | 49.80 days | 0.98x | 0.43 |
| Lharvion | The Eye | Xoriat | Mark of Detection | 56.15 days | 1.11x | 0.30 |
| Barrakas | The Lantern | Irian | Mark of Finding | 63.31 days | 1.07x | 1.375 |
| Rhaan | The Book | Thelanis | Mark of Scribing | 71.39 days | 0.49x | 0.32 |
| Sypheros | The Shadow | Mabar | Mark of Shadow | 80.50 days | 0.62x | 0.071 |
| Aryth | The Gateway | Dolurrh | Mark of Passage | 90.76 days | 0.69x | 0.275 |
| Vult | The Warding Moon | Shavarath | Mark of Warding | 102.34 days | 0.74x | 0.23 |

Apparent size is relative to Earth's Moon (Luna). Each moon borrows orbital-shape values from a selected real-world reference body chosen for behavioral fit with its in-setting story.
</details>

<details>
<summary><strong>Forgotten Realms</strong></summary>

- **Calendar:** Harptos Calendar — 12 months × 30 days + 5 intercalary festival days (365/366-day year), 10-day tendays, DR era
- **Moons:** Selune — 30.4375-day cycle aligned to the Harptos 4-year leap cycle
- **Intercalary days:** Midwinter, Greengrass, Midsummer, Shieldmeet (leap years), Highharvestide, Feast of the Moon — rendered as festival strips between months

</details>

<details>
<summary><strong>Greyhawk</strong></summary>

- **Calendar:** Dozenmonth of Luna — 12 months × 28 days + 4 intercalary festival weeks of 7 days (364-day year), 7-day week (Starday–Freeday), CY era
- **Moons:** Luna (28-day cycle, aligned to months) and Celene the Handmaiden (91-day cycle)
- **Events:** Needfest, Growfest, Richfest, and Brewfest festival weeks
- **Intercalary rendering:** Festival weeks render as their own week blocks in the calendar grid

</details>

<details>
<summary><strong>Dragonlance</strong></summary>

- **Calendar:** Krynnish Calendar — 12 months × 28 days (336-day year), 7-day week (Linaras–Bracha), PC era
- **Moons:** Three moons governing magic on Krynn:
  - Solinari (36-day cycle) — Silver Moon, Good magic, White Robes
  - Lunitari (28-day cycle) — Red Moon, Neutral magic, Red Robes
  - Nuitari (8-day cycle) — Black Moon, Evil magic, Black Robes (hidden from players by default)
- **Events:** Yule, Spring Dawning, Midsummer, Harvest Home
- **Setup:** Night of the Eye anchor configuration (seed-derived or manual)

</details>

<details>
<summary><strong>Exandria</strong> (Critical Role)</summary>

- **Calendar:** Exandrian Calendar — 11 months of 28–32 days (328-day year), 7-day week (Miresen–Da'leysen), PD era
- **Moons:**
  - Catha (base 29-day cycle with seeded drift) — The Guiding Light, associated with Sehanine the Moonweaver
  - Ruidus (base 164-day cycle with triangular drift) — The Bloody Eye, appears full when visible, visible only during a 14-day window per cycle
- **Events:** New Dawn, Hillsgold, Day of Challenging, Harvest's Close, Zenith, The Crystalheart

</details>

<details>
<summary><strong>Mystara</strong> (BECMI / Known World)</summary>

- **Calendar:** Thyatian Calendar — 12 months × 28 days (336-day year), 7-day week (Lunadain–Loshdain), AC era
- **Moons:**
  - Matera (28-day cycle) — The Visible Moon, governs tides
  - Patera (32-day cycle) — The Invisible Moon, home of the Ee'aar (hidden from players by default)
- **Events:** New Year, equinoxes, and solstices

</details>

<details>
<summary><strong>Birthright</strong></summary>

- **Calendar:** Cerilian Calendar — 12 months × 32 days + 4 intercalary festival days (388-day year), 8-day week (Firlen–Achlen), MA era
- **Moons:** Aelies (32-day cycle) — The Silver Moon of Aebrynis, cycle matches the month length
- **Events:** Erntenir (Harvest Festival), Haelynir (Day of the Sun), Midsummer, Midwinter

</details>

<details>
<summary><strong>Earth (Gregorian)</strong></summary>

- **Calendar:** Gregorian Calendar — 12 months × 28–31 days (365/366-day year), 7-day week (Sunday–Saturday), CE era
- **Leap years:** Every 4th year, except centuries, except centuries divisible by 400
- **Moons:** Luna — 29.53-day synodic period
- **Events:** Astronomical solstices and equinoxes

</details>

[Return to Table of Contents](#table-of-contents)

---
