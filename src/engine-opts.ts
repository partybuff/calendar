/**
 * Engine bridge — wrapper → @partybuff/calendar-engine.
 *
 * Three concerns live here:
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
 *   3. Reading per-campaign anchors from `state.PartyBuffCalendar.imported`
 *      (populated by `!cal token`) and emitting the engine's
 *      `PhaseOptions` / `PlanePositions` shapes.
 *
 * Every call here is cheap (object construction + small lookups, no
 * I/O); we don't memoize. The token-apply path that mutates
 * `state.imported` is rare; we trade a few extra object literals per
 * render for not having to invalidate a cache.
 */

import { worlds, planes as enginePlanes } from '@partybuff/calendar-engine';
import type {
  CalendarDate as EngineCalendarDate,
  MoonAnchor as EngineMoonAnchor,
  WorldId as EngineWorldId,
  World as EngineWorld,
} from '@partybuff/calendar-engine';
import type { PhaseOptions } from '@partybuff/calendar-engine/moons';
import type { PlanePositions } from '@partybuff/calendar-engine/planes';
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

/** Read the campaign-imported lunar anchors and emit the engine's
 *  `PhaseOptions` shape. Returns `{}` when no token has been applied
 *  (engine treats absent opts as canon). */
export function getMoonOpts(): PhaseOptions {
  const root = (state as { [key: string]: unknown })[state_name] as
    | Record<string, unknown>
    | undefined;
  const imported = (root?.imported || {}) as {
    lunarAnchors?: Record<string, EngineMoonAnchor>;
    krynnAnchor?: EngineCalendarDate | null;
  };
  const opts: { anchors?: Readonly<Record<string, EngineMoonAnchor>>; krynnAnchor?: EngineCalendarDate } = {};
  if (imported.lunarAnchors && Object.keys(imported.lunarAnchors).length) {
    opts.anchors = imported.lunarAnchors;
  }
  if (imported.krynnAnchor) {
    opts.krynnAnchor = imported.krynnAnchor;
  }
  return opts;
}

/** Read the campaign-imported planar anchors and emit the engine's
 *  `PlanePositions` shape. Always returns an object so callers can pass
 *  it directly (engine handles `{}` identically to `undefined`). */
export function getPlanePositions(): PlanePositions {
  const root = (state as { [key: string]: unknown })[state_name] as
    | Record<string, unknown>
    | undefined;
  const imported = (root?.imported || {}) as {
    planarAnchors?: Record<string, number>;
  };
  return imported.planarAnchors || {};
}

/** Re-export the engine's `planes` namespace so wrapper modules don't
 *  need to know the package layout — they import `enginePlanes` from
 *  this bridge and get the same object. */
export { enginePlanes };
