# Party Buff's Roll20 Calendar

A Roll20 API script for managing a fantasy campaign calendar with:
- graphical mini-calendar displayed in chat, with toggleable subsystems:
	- events tracking
	- moon phase tracking
	- planar movements (Eberron setting)

**Supports:** Eberron, Forgotten Realms, Greyhawk, Dragonlance, Exandria, Mystara, Ravenloft (Barovia), Birthright, Earth (Gregorian)

This script is the in-game companion to the [Party Buff](https://github.com/partybuff) calendar app — the web app handles the wide-canvas planning surface (rich weather, time-of-day, theming, custom events) while Roll20 is the at-the-table view. `!cal token <paste>` carries a one-way setup snapshot (world, date, variant, palette) from the web app into a running Roll20 session; it does not carry campaign content like custom events or weather.

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
| Help | `!cal help` | Docs-only reference |

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

On a brand-new campaign, only the GM sees the first-run prompt: a "Welcome to Party Buff's Roll20 Calendar" card with one button per supported world. Setup is a single step — pick a world and it's live immediately, seeded with that world's canonical variant, date, and palette. There is no follow-up wizard (no season/theme/hemisphere/event-source questions). The GM can dismiss the prompt (`!cal setup dismiss`) and come back to it later by typing `!cal`.

After setup is complete:
- `!cal` opens the compact Today dashboard
- `!cal help` opens the docs-only root help menu (status line + short reference cards — it is not a full command list)
- `!cal show month` and `!cal send month` open or share the full month grid

Players who use `!cal` before the GM finishes setup get a waiting message instead of setup or admin controls.

Whispers and GM-only acks use `noarchive` and don't persist in the chat log. Public broadcasts — `!cal send` and the calendar-reset announcement — are **not** `noarchive`; they post normally so the table has an in-game timestamp trail to scroll back to.

</details>

[Return to Table of Contents](#table-of-contents)

---

## Calendar Navigation

<details>
<summary>Show navigation layout and button meanings</summary>

The default `!cal` and `!cal today` views open a compact Today dashboard instead of dropping straight into the full month stack.

Everyone sees:
- The current month's minical, current date, and season
- Today's events/holidays
- Notable moon phases (full, new, or arriving within 2 days)
- A one-click row into the Events / Moons / Planes panels
- The month stepper (‹ Prev / This Month / Next › / Year)

GM-only, additionally:
- Notable planar states (coterminous, remote, or transitioning within 2 days)
- A control row: Retreat, Advance, Send (the public broadcast), Manage (the setup hub)

Players get an Additional / Help row instead of the GM control row.

Use `!cal show ...` or `!cal send ...` when you want the traditional month/year calendar render. `!cal help` is a docs-only reference card (status line + short "Reading the Calendar" / "Themes" / "Event Colors" pages) — it does not list every command or carry prompt buttons for typed input. The month stepper, `Additional` (Events/Lunar/Planar panels), and — for the GM — `Manage` (setup, sources, themes, broadcast, reset) are the actual navigation surface; almost everything is a button click, not typed input.

</details>

### Handouts

Roll20 handout creation is disabled — the script never calls `createObj`/`set('notes', ...)` on a handout. The Markdown files under `Handouts/` (`Events.md`, `Lunar.md`, `Planar.md`) are reference notes for the GM to read or paste manually; they are not wired into the script.

[Return to Table of Contents](#table-of-contents)

---
## Events

<details>
<summary>Show event behavior and source notes</summary>

### General
- Individual cells within the minical are color-filled on the day of an event.
- For days with multiple events, small colored dots appear beneath the numbered date.
- Each cell can be hovered over with a mouse to show a tooltip containing the event information.
- `!cal event <name>` whispers a detail card for a single event: its date(s), source, and lore, read live from the engine (the wrapper hosts no event text of its own).

### Canon-only, source-managed
- Every event on the calendar is generated from the active world's engine data (`world.holidays`) at render time — the script does not store, add, or edit event content. There is no `!cal event add` / `remove` / `restore` family; that was retired when events moved to canon-pack-only.
- Holidays are grouped by **source** (e.g. Eberron's Sharn, Sovereign Host, Dark Six, Silver Flame, Stormreach packs). `!cal source list` shows every source for the active world; `!cal source disable <name>` / `!cal source enable <name>` hide or restore an entire source's events; `!cal source up` / `down` reorders source priority (the top-ranked source on a date sets that day's cell color).
- Switching calendar systems applies source compatibility through automatic suppression (a source that doesn't belong to the new world is hidden), while GM manual source disables persist across calendar-system changes.

</details>

[Return to Table of Contents](#table-of-contents)

---
<a id="moons"></a>
## Moons: Modeling the Skies

<details>
<summary>Show moon-system modeling details</summary>

The script models the sky as a physical system rather than flavor-only text. Moon brightness, movement, nighttime lighting, and everything else all derive from explicit numbers. The goal is to create a constantly advancing game-world state that requires little GM intervention, and generates useful mechanics and information for D&D.

### Phase model

The moon system is **phases only** — illumination and a phase label per moon per day. There is no sky position, altitude, azimuth, eclipse detection, or "long shadows" framing; none of that ships to Roll20 (it's out of scope for this surface — see `CLAUDE.md`).

- Phase math is engine-owned and canon-only. There is no GM anchor override in Roll20: every moon uses the engine's standard reference date, and the GM cannot re-anchor a moon to a chosen full/new date from chat.
- **Lunar periods (Eberron only).** The engine ships two published cycle-length models for Eberron's twelve moons: Party Buff's month-matched periods (default) and the official WotC calendar tool's table, under which all twelve moons stood full together on Zarantyr 1, −2202 YK. `!cal settings lunar (partybuff|official)` picks between them. This is a model selection — like a month-name variant — not an anchor override; both tables are engine canon, and the setting only appears on worlds whose engine data carries an official table.
- `Full` and `New` are single-day **inflection points** — the exact day the engine's phase math crosses that point, not a percentage-illumination threshold. A moon is never "Full" for a multi-day span.
- Players and the GM see identical moon information. There are no hidden or GM-only moons, and no visibility windows gated by knowledge tier — any per-moon "hidden from players" flavor text in a sourcebook is not modeled as a mechanic here.
- The Today dashboard highlights any moon that's Full or New today (or arriving within 2 days). `!cal moon` (or `!cal lunar current`) shows every moon's current phase, synodic period, and last/next inflection; `!cal lunar all [year]` lists every Full/New across a year.

Setting-specific moon rosters (names, titles, synodic periods) are documented under each setting in [Supported Settings](#supported-settings).

</details>

[Return to Table of Contents](#table-of-contents)

---
## Planes

<details>
<summary>Show planar alignment model</summary>

The planar subsystem tracks Eberron's Planes of Existence and their alignment cycles. A plane is **coterminous**, **remote**, or **neutral**. Eberron is the only world with planar data — the panels and the Today dashboard's planar line are hidden on every other world.

**Coterminous** planes strengthen their associated traits.

**Remote** planes suppress or invert those same traits.

Planar phases are canon-anchored, read live from the engine — the wrapper carries no GM-tunable seeds, no anchor overrides, no off-cycle generation, and no plane suppression. What the engine says is coterminous/remote is what everyone sees.

`!cal planes` (or `!cal planar current` / `!cal planar all [year]`) shows the panels. There is no `!cal planes send` — the only public broadcast surface is `!cal send`, which appends whatever's active today to the shared broadcast.

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

These are used by `!cal set`, `!cal moon on`, and `!cal planes on`.

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

#### Source priority

- Priority `1` is the primary source for a date and supplies the calendar cell color when multiple source-pack events land on the same day.
- Unranked sources (`-` in the UI) are tied for last.
- Reorder with `!cal source up <name>` / `!cal source down <name>`.

### Core Calendar (any player)

```text
!cal
!cal show [range...]
!cal send [range...]      GM-only — the only public broadcast
!cal now
!cal today
!cal additional
!cal help [root|calendar|themes|eventcolors]
!cal event <name>
```

`!cal help` is a docs-only reference card (status line + short pages), not a full command list. Navigation is button-first: the month stepper (‹ Prev / This Month / Next › / Year) rides under every calendar render, `!cal additional` opens Events/Lunar/Planar panels, and (GM) `!cal manage` opens setup.

### Events, Lunar, Planar panels (any player)

```text
!cal events [current|all [year]]
!cal lunar [current|all [year]]
!cal planar [current|all [year]]        Eberron only
```

`!cal events` defaults to `current` (Past / Today / Upcoming, with one week of spillover into the adjacent month on each side). `!cal events all [year]` is a full year listing by month. `!cal lunar` / `!cal planar` follow the same current/all split. Planar panels only return data on Eberron; other worlds get a "Planar canon is Eberron-only" notice.

### Moon Commands (any player)

```text
!cal moon
!cal moon summary
!cal moon on <dateSpec>
```

Bare `!cal moon` is the full panel (the GM additionally gets a management card with a Moons on/off toggle). `!cal moon summary` is the compact one-liner. `!cal moon on <dateSpec>` inspects a specific day. There is no GM anchor/seed/reseed surface, no `moon full` / `moon new` day-setting, and no live Roll20 page binding — moons are canon-only, phase-only.

### Plane Commands (any player)

```text
!cal planes
!cal planes summary
!cal planes on <dateSpec>
!cal planes view <PlaneName>
```

Same shape as moons: bare `!cal planes` is the full panel, `summary` is compact, `on <dateSpec>` inspects a day, `view <PlaneName>` is a single-plane detail card. Eberron only. There is no `planes send` (broadcasting is `!cal send` only), no `planes set` / `anchor` / `seed` / `suppress` — planes are canon-only, read-only.

### GM: Setup

```text
!cal setup pick <world>
!cal setup dismiss
!cal token <paste>
```

First-run setup is one step: pick a world from the welcome card, done — that world's canonical variant, date, and palette apply immediately. There is no follow-up wizard. `!cal token <paste>` applies a configuration token copied from the web app: it carries **world, date, variant, and palette only**. It does not carry moon or planar anchors — moons and planes are canon-only in this wrapper, so there's nothing for an anchor field to override.

### GM: System Controls

```text
!cal manage
!cal settings
!cal settings (group|labels|moons|planes|buttons) (on|off)
!cal settings density (compact|normal)
!cal settings mode planes (calendar|list|both)
!cal settings lunar (partybuff|official)

!cal theme list
!cal theme <name>
!cal theme reset

!cal calendar
!cal calendar <system> [variant]
!cal hemisphere
!cal hemisphere (north|south)
!cal resetcalendar
```

`!cal manage` is the GM hub (Set Date, Calendar/Variant, Settings, Sources, Themes, Hemisphere, Broadcast, Reset). `!cal calendar <system> [variant]` only swaps the **name-variant** of the *current* world (e.g. Eberron's Galifar/Druidic/Halfling/Dwarven month names) — switching to a *different* world is not a live setting; it requires `!cal resetcalendar` (which re-runs the one-step world picker) or a `!cal token` paste. `!cal hemisphere` only affects worlds whose season labels vary by hemisphere (Faerûn, Gregorian); elsewhere it's a documented no-op. `!cal settings lunar (partybuff|official)` picks which lunar cycle lengths Eberron uses — Party Buff's month-matched periods (default) or the official WotC calendar tool's; the row and command only exist on worlds whose engine data ships an official period table (currently Eberron), and it's a choice between two published models, not an anchor override. There is no `!cal seasons` command — season sets are fixed per world, not user-selectable.

### GM: Date

```text
!cal set <dateSpec>
!cal advance [days]
!cal retreat [days]
```

### GM: Event Sources

```text
!cal source list
!cal source enable <name>
!cal source disable <name>
!cal source up <name>
!cal source down <name>
```

There is no `!cal event add` / `addmonthly` / `addyearly` / `remove` / `restore` — GM custom events were retired; events are canon-pack only (see [Events](#events)).

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
  index.ts          — Entry point for bundler
  boot-register.ts  — Roll20 chat:message registration, dispatch
  init.ts           — Initialization, public API
  config.ts         — User-editable configuration constants
  constants.ts      — Labels, styles, color themes
  engine-opts.ts    — Wrapper ↔ engine bridge (serial↔CalendarDate, canon-only opts)
  date-math.ts      — Serial date math, leap years
  color.ts          — Color utilities (delegates to engine)
  state.ts          — Roll20 state management, settings
  parsing.ts        — Date parsing, fuzzy matching
  events.ts         — Event occurrences, ranges, delivery
  rendering.ts      — HTML rendering, mini-calendars
  ui.ts             — Menus, buttons, dashboard render
  commands.ts       — Shared routing helpers
  today.ts          — !cal command dispatch table + Today/Events/Lunar/Planar panels
  moon.ts           — Moon phases (canon-only)
  planes.ts         — Planar cycles, effects (canon-only, Eberron)
  setup.ts          — First-run world picker, boot summary
  token.ts          — !cal token parse + apply (world/date/variant/palette)
  messaging.ts      — Chat send/whisper primitives (archive vs noarchive)
  worlds/           — Engine world registry + wrapper overlays (nine worlds)
  shared/           — Shared HTML/table-rendering helpers
  types/roll20.d.ts — Roll20 global type declarations
test/
  calendar_smoke.mjs — Node smoke check against the built bundle
  calendar_smoke.ps1 — PowerShell variant (Windows paste workflow)
  *.test.ts         — Tests organized by module (see test/ for the current list)
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

Pick a world from the one-step setup card, or a GM switches worlds later via `!cal resetcalendar` (re-runs the picker) or a `!cal token` paste. Name variants, themes, and other live settings are under `!cal manage`.

<details>
<summary><strong>Eberron</strong></summary>

- **Calendar:** Galifar Calendar — 12 months × 28 days (336-day year), 7-day week (Sul–Sar), YK era
- **Variants:** Galifar (standard), Druidic, Halfling, Dwarven month names
- **Moons:** 12 moons, one per month, each tied to a plane. Synodic periods range from 27 to 102 days. Phase (illumination + label) only — no sky position, eclipses, conjunctions, or "Long Shadows" framing on this surface. `!cal settings lunar official` swaps to the official WotC calendar tool's period table (see the moon roster below).
- **Planes:** 13 transitive/outer planes with coterminous/remote/neutral cycles, canon-only (no GM seeds, anchors, or suppression)
- **Events:** Sharn, Khorvaire, Sovereign Host, Dark Six, Silver Flame, and Stormreach event packs

#### Moons of Eberron

Fixed synodic periods on a 336-day year scaffold. `Full` and `New` land on the engine's single inflection day per cycle — not a percentage-illumination threshold.

Two published period tables ship with the engine, selected by the GM's **Lunar periods** setting (`!cal settings lunar (partybuff|official)`). The default is Party Buff's month-matched table (each moon full on the 1st of its month in 998 YK); `official` is the WotC calendar tool's table, anchored so all twelve moons stood full together on Zarantyr 1, −2202 YK.

| Moon | Title | Plane | Synodic Period (Party Buff) | Official Period (WotC) |
| --- | --- | --- | ---: | ---: |
| Zarantyr | The Storm Moon | Kythri | 27.32 days | 77 days |
| Olarune | The Sentinel Moon | Lamannia | 30.81 days | 56 days |
| Therendor | The Healer's Moon | Syrania | 34.74 days | 42 days |
| Eyre | The Anvil | Fernia | 39.17 days | 63 days |
| Dravago | The Herder's Moon | Risia | 44.16 days | 91 days |
| Nymm | The Crown | Daanvi | 49.80 days | 28 days |
| Lharvion | The Eye | Xoriat | 56.15 days | 98 days |
| Barrakas | The Lantern | Irian | 63.31 days | 105 days |
| Rhaan | The Book | Thelanis | 71.39 days | 49 days |
| Sypheros | The Shadow | Mabar | 80.50 days | 35 days |
| Aryth | The Gateway | Dolurrh | 90.76 days | 84 days |
| Vult | The Warding Moon | Shavarath | 102.34 days | 70 days |

Each moon is tied to a plane for flavor (Today dashboard marks a moon "ascendant" when its plane is coterminous or during its associated month), but that tie is cosmetic — plane phase and moon phase are computed independently.
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
  - Nuitari (8-day cycle) — Black Moon, Evil magic, Black Robes
- **Events:** Yule, Spring Dawning, Midsummer, Harvest Home

Lore-wise Nuitari is hidden from the uninitiated, but the Roll20 surface shows every moon identically to GM and players — there is no per-moon visibility gate here.

</details>

<details>
<summary><strong>Exandria</strong> (Critical Role)</summary>

- **Calendar:** Exandrian Calendar — 11 months of 28–32 days (328-day year), 7-day week (Miresen–Da'leysen), PD era
- **Moons:**
  - Catha (29-day cycle) — The Guiding Light, associated with Sehanine the Moonweaver
  - Ruidus (164-day cycle) — The Bloody Eye. Canon lore has it visible only part of the time; the Roll20 surface shows a plain phase cycle with no visibility-window mechanic.
- **Events:** New Dawn, Hillsgold, Day of Challenging, Harvest's Close, Zenith, The Crystalheart

</details>

<details>
<summary><strong>Mystara</strong> (BECMI / Known World)</summary>

- **Calendar:** Thyatian Calendar — 12 months × 28 days (336-day year), 7-day week (Lunadain–Loshdain), AC era
- **Moons:**
  - Matera (28-day cycle) — The Visible Moon, governs tides
  - Patera (32-day cycle) — The Invisible Moon, home of the Ee'aar. Canon lore keeps it hidden from most; the Roll20 surface shows both moons identically to GM and players.
- **Events:** New Year, equinoxes, and solstices

</details>

<details>
<summary><strong>Ravenloft (Barovia)</strong></summary>

- **Calendar:** Barovian Calendar — weekless. Twelve 28-day moons instead of months; dates read "Nth Night of the Mth Moon" rather than a month-day pair.
- **Variants:** Moons (canonical "First Moon"–"Twelfth Moon" naming) or Slavic Months (community-reconstructed transliterated names)
- **Moons:** One moon, full on the 1st night of every moon-month by definition — the calendar itself is a lunar cycle.
- **Seasons, events:** None. The demiplane's gloom has no canonical season or holiday cycle in this wrapper.

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
