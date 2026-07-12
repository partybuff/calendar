/**
 * Engine bridge — wrapper → @partybuff/calendar-engine.
 *
 * Two concerns live here:
 *
 *   1. Resolving the wrapper's `state.settings.calendarSystem` (an
 *      overlay key like `'eberron'` or `'faerun-modern'`) to an engine
 *      `World` object via the world registry.
 *   2. Translating wrapper serial numbers into engine `CalendarDate`
 *      values. Serials are numerically identical on both sides — same
 *      `daysBeforeYear * baseDpy + intra-year-offset` formula — but the
 *      wrapper flattens intercalaries into its `cal.months` array
 *      whereas the engine keeps them in a sibling `intercalaries` list
 *      with a `kind: 'intercalary'` discriminator on the date. The
 *      `getStructuralSlot()` table from `src/worlds/index.ts` encodes
 *      that mapping per-slot.
 *
 * Moons and planes are canon-only (#198): `getMoonOpts()` /
 * `getPlanePositions()` below always return `{}` — there is no
 * per-campaign anchor state to read any more (`state.imported` was
 * retired as a follow-up; a `!cal token` no longer carries anchor
 * fields at all).
 *
 * Every call here is cheap (object construction + small lookups, no
 * I/O); we don't memoize.
 */

import { worlds, planes as enginePlanes, seasons as engineSeasons } from '@partybuff/calendar-engine/lite';
import type {
  CalendarDate as EngineCalendarDate,
  WorldId as EngineWorldId,
  World as EngineWorld,
  PhaseOptions,
  PlanePositions,
} from '@partybuff/calendar-engine/lite';
import { state_name } from './constants.js';
import { ensureSettings } from './state.js';
import { fromSerial as wrapperFromSerial } from './date-math.js';
import { getEngineId, getStructuralSlot } from './worlds/index.js';

/** Engine WorldId for the active world. The engine's `moons` and
 *  `date` namespace methods both take a WorldId string. Throws if the
 *  active world isn't engine-backed — a setup invariant the caller
 *  should already have enforced. */
export function getEngineWorldId(): EngineWorldId {
  const st = ensureSettings();
  const sysKey = String(st.calendarSystem || 'eberron');
  const engineId = getEngineId(sysKey);
  if (!engineId) {
    throw new Error(`engine bridge: no engine world registered for "${sysKey}"`);
  }
  return engineId;
}

/** Resolve the active world to a full `World` object. Most callers
 *  want this — the moon-key→name cache and similar lookups need the
 *  registry entry, not just the id. */
export function getEngineWorld(): EngineWorld {
  return worlds.get(getEngineWorldId());
}

/** Translate a wrapper serial into an engine `CalendarDate`.
 *
 *  Engine validation is strict: passing a Shieldmeet date on a non-leap
 *  year throws. The wrapper's `fromSerial` only ever returns slots that
 *  are active for the resolved year, so this should never happen on
 *  in-range inputs, but we surface clearer errors when it does. */
export function serialToCalendarDate(serial: number): EngineCalendarDate {
  const wrapped = wrapperFromSerial(serial);
  const sysKey = String(ensureSettings().calendarSystem || 'eberron');
  const slot = getStructuralSlot(sysKey, wrapped.mi);
  if (!slot) {
    throw new Error(
      `engine bridge: structural slot ${wrapped.mi} unknown for world "${sysKey}"`,
    );
  }
  if (slot.translation.kind === 'month') {
    return {
      kind: 'month',
      year: wrapped.year,
      monthIndex: slot.translation.engineMonthIndex,
      day: wrapped.day,
    };
  }
  return {
    kind: 'intercalary',
    year: wrapped.year + slot.translation.yearDelta,
    intercalaryKey: slot.translation.intercalaryKey,
    day: wrapped.day,
  };
}

/** Moon phase options for engine queries. Canon-only: moons always use the
 *  engine's standard default-seed anchors — GM in-Roll20 anchor overrides
 *  were cut (CLAUDE.md: planes/moons are canon-only, no overrides). The engine
 *  treats `{}` as canon. A future live token may set world/date/variant/
 *  palette, but the standard set from the default seed is the only anchor
 *  pathway; there is no per-campaign override. */
export function getMoonOpts(): PhaseOptions {
  return {};
}

/** Plane positions for engine queries. Canon-only: planes always use the
 *  engine's canonical positions; the GM anchor-override pathway was cut
 *  (see getMoonOpts). The engine handles `{}` identically to `undefined`. */
export function getPlanePositions(): PlanePositions {
  return {};
}

/** Re-export the engine's `planes` namespace so wrapper modules don't
 *  need to know the package layout — they import `enginePlanes` from
 *  this bridge and get the same object. */
export { enginePlanes };

/** "Month N of Y" numeric orientation label for a wrapper serial — the
 *  engine's own `seasons.label`, canon per-world (regular months render
 *  "Month 7 of 12"; intercalary days render the "{label} — between months
 *  X and Y of N" framing). Distinct from the wrapper's own season NAME
 *  (`_getSeasonLabel` in ui.ts, e.g. "Mid-summer") — this is the numeric
 *  position, always available even for worlds with no defined seasons
 *  (Barovia). Used by the today card's season line. */
export function monthPositionLabel(serial: number): string {
  return engineSeasons.label(getEngineWorldId(), serialToCalendarDate(serial));
}
