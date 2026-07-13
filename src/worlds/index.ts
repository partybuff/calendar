/**
 * World Registry — engine-backed.
 *
 * The wrapper previously shipped its own per-world `.ts` files with the full
 * canonical month / weekday / moon / holiday data. As of the engine swap, the
 * Roll20 wrapper consumes that canon from `@partybuff/calendar-engine` and
 * layers wrapper-only presentation data on top via `overlays.ts`.
 *
 * `getWorld(key)` still returns the wrapper's `WorldDefinition` shape so the
 * rest of `src/` (state.ts, setup.ts, ui.ts, moon.ts, etc.) keeps working
 * without per-call-site refactors.
 */

import { worlds as engineWorlds } from '@partybuff/calendar-engine/lite';
import type {
  World as EngineWorld,
  WorldId as EngineWorldId,
  Month as EngineMonth,
  Intercalary as EngineIntercalary,
} from '@partybuff/calendar-engine/lite';
import type {
  WorldDefinition,
  CalendarDefinition,
  MonthSlot,
  MoonSystemDefinition,
  MoonBodyDefinition,
  EventPackDefinition,
} from './types.js';
import {
  OVERLAYS,
  OVERLAY_ORDER,
  WrapperOverlay,
  StructuralIntercalary,
} from './overlays.js';

export type { WorldDefinition } from './types.js';
export * from './types.js';

/* ──────────────────────────────────────────────────────────────────────────
 * Structural slot translation table
 *
 * For each wrapper world we precompute the wrapper's flat months/intercalaries
 * array (call it the "structural array"). Each entry maps back to either a
 * canonical engine month or an engine intercalary, with an optional year
 * delta (used for Greyhawk Needfest: wrapper places it at the start of year
 * Y; engine places it at the end of year Y-1).
 *
 * date-math.ts imports `getStructuralSlot()` to translate between
 * wrapper (year, structural-mi) and engine `CalendarDate`.
 * ──────────────────────────────────────────────────────────────────────── */

export type StructuralSlotKind =
  | { readonly kind: 'month'; readonly engineMonthIndex: number }
  | { readonly kind: 'intercalary'; readonly intercalaryKey: string; readonly yearDelta: number };

export type StructuralSlot = {
  readonly name: string;
  readonly days: number;
  readonly isIntercalary: boolean;
  readonly leapEvery: number | null;
  /** Wrapper "regularIndex": 0-based position into the canonical month list. */
  readonly regularIndex: number;
  readonly translation: StructuralSlotKind;
};

/* Per-world structural arrays, computed once at module load. */
const STRUCTURAL_CACHE: Record<string, StructuralSlot[]> = {};

/** Effective structural slots for a world: the overlay's explicit list,
 *  or — when `deriveIntercalarySlots` is set — slots generated from the
 *  engine's own intercalary data so the wrapper tracks engine canon. */
function effectiveIntercalarySlots(
  engine: EngineWorld,
  overlay: WrapperOverlay,
): StructuralIntercalary[] {
  if (!overlay.deriveIntercalarySlots) return overlay.intercalarySlots;
  return engine.calendar.intercalaries.map((ic) => ({
    key: ic.key,
    position: 'after' as const,
    monthIndex: ic.insertAfter.monthIndex,
  }));
}

/** Naming overlays with `useEngineMonthNames` resolved against the engine. */
function resolveNamingOverlays(engine: EngineWorld, overlay: WrapperOverlay) {
  return overlay.namingOverlays.map((o) => ({
    ...o,
    monthNames: o.useEngineMonthNames
      ? engine.calendar.months.map((m) => m.name)
      : o.monthNames.slice(),
  }));
}

/** True while the engine still ships the overlay's LEGACY scheme (the
 *  probe intercalary key is present). Worlds without a schemeProbe are
 *  always "legacy" (i.e., the overlay applies unchanged). */
function isLegacyScheme(engine: EngineWorld, overlay: WrapperOverlay): boolean {
  const probe = overlay.schemeProbe;
  if (!probe) return true;
  return engine.calendar.intercalaries.some((ic) => ic.key === probe.legacyKey);
}

/* ── Event packs from engine holidays ─────────────────────────────────────
 *
 * The wrapper hosts NO event content: every event is generated from the
 * engine world's `holidays` data at compose time. Holidays are grouped
 * into packs by their engine `source` key (world-prefixed, because source
 * names collide across worlds — 'historical' appears in five), which
 * plugs into the existing DEFAULT_EVENTS / source-suppression machinery.
 *
 * Rule-kind translation to wrapper DaySpec:
 *   fixed                       → 'D' or 'D-D' on the month's structural slot
 *   floating/intercalary        → day within that intercalary's structural slot
 *   floating/weekly             → month 'all' + 'every <weekday>'
 *   floating/nth_weekday_of_every_month → month 'all' + '<nth> <weekday>'
 *   floating/nth_weekday_of_month       → '<nth> <weekday>' on that month
 *   floating/year_cadence       → 'D' on the month's slot + everyYears /
 *                                 anchorYear (e.g. Dragonlance Night of the
 *                                 Eye: every 3rd year from 348, on 10/15)
 *   floating/gregorian_table    → skipped (no recurring-spec equivalent;
 *                                 unused by any shipped world)
 * Fidelity is enforced by test/engine-events-parity.test.ts against the
 * engine's own allOccurrencesIn(). */
const NTH_WORD: Record<string, string> = {
  '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '5': 'fifth', '-1': 'last',
};

function titleWords(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function eventPacksFromEngine(
  wrapperKey: string,
  engine: EngineWorld,
  structural: StructuralSlot[],
): EventPackDefinition[] | undefined {
  const holidays = engine.holidays || [];
  if (!holidays.length) return undefined;

  const structMonth = new Map<number, number>();
  const structIc = new Map<string, number>();
  structural.forEach((s, i) => {
    if (s.translation.kind === 'month') structMonth.set(s.translation.engineMonthIndex, i + 1);
    else structIc.set(s.translation.intercalaryKey, i + 1);
  });
  /* Lowercased to match the wrapper's canonical DaySpec form — the
   * seed and merge paths dedupe on the day string, so capitalization
   * mismatches would duplicate events. */
  const weekdayName = (wi: number) => (engine.calendar.weekdays[wi] || '').toLowerCase();

  type GenEvent = {
    name: string; month: number | 'all'; day: string; color?: string; source: string;
    everyYears?: number; anchorYear?: number; firstYear?: number;
  };
  const bySource = new Map<string, GenEvent[]>();
  for (const h of holidays) {
    let month: number | 'all' | null = null;
    let day: string | null = null;
    let everyYears: number | undefined;
    let anchorYear: number | undefined;
    if (h.kind === 'fixed') {
      const mIdx = structMonth.get(h.monthIndex) ?? null;
      const monthSlot = mIdx != null ? structural[mIdx - 1] : null;
      /* Overflow day (e.g. Gregorian Leap Day: engine fixed holiday at
       * February/29, but February's canonical `days` is 28 — the 29th
       * is carved out into its own leap-gated structural intercalary
       * slot right after February). Single-day holidays only; route to
       * that slot instead of clamping into a nonexistent regular day. */
      const overflowSlot = (mIdx != null && h.endDay == null && monthSlot && h.day > monthSlot.days)
        ? structural[mIdx]
        : null;
      if (overflowSlot && overflowSlot.isIntercalary && overflowSlot.leapEvery) {
        month = mIdx! + 1;
        day = String(h.day - monthSlot!.days);
      } else {
        month = mIdx;
        day = (h.endDay != null && h.endDay > h.day) ? (h.day + '-' + h.endDay) : String(h.day);
      }
    } else {
      const r = h.rule;
      if (r.kind === 'intercalary') {
        month = structIc.get(r.intercalaryKey) ?? null;
        day = String(r.day || 1);
      } else if (r.kind === 'weekly') {
        month = 'all';
        day = 'every ' + weekdayName(r.weekdayIndex);
      } else if (r.kind === 'nth_weekday_of_every_month') {
        const nth = NTH_WORD[String(r.nth)];
        if (nth) { month = 'all'; day = nth + ' ' + weekdayName(r.weekdayIndex); }
      } else if (r.kind === 'nth_weekday_of_month') {
        const nth = NTH_WORD[String(r.nth)];
        const m = structMonth.get(r.monthIndex);
        if (nth && m != null) { month = m; day = nth + ' ' + weekdayName(r.weekdayIndex); }
      } else if ((r as { kind: string }).kind === 'year_cadence') {
        /* Fires on (monthIndex, day) only in years where
         * (year - anchorYear) % everyYears === 0. occurrencesInRange /
         * getEventsFor gate on the everyYears/anchorYear fields.
         * `year_cadence` was added to the engine's FloatingHolidayRule
         * union after 0.25.0; the cast keeps this branch compiling against
         * engine versions whose types predate the kind (where it simply
         * never matches at runtime). */
        const yc = r as unknown as { monthIndex: number; day: number; everyYears: number; anchorYear: number };
        month = structMonth.get(yc.monthIndex) ?? null;
        day = String(yc.day);
        if (yc.everyYears > 1) { everyYears = yc.everyYears; anchorYear = yc.anchorYear; }
      }
      /* gregorian_table: intentionally unhandled — see block comment. */
    }
    if (month == null || day == null || !day.trim()) continue;

    const sourceKey = wrapperKey + ':' + (h.source || 'canon');
    if (!bySource.has(sourceKey)) bySource.set(sourceKey, []);
    const entry: GenEvent = { name: h.label, month, day, source: sourceKey };
    if (h.color) entry.color = h.color;
    if (everyYears != null) { entry.everyYears = everyYears; entry.anchorYear = anchorYear; }
    /* `firstYear` gates the holiday's occurrence identically to the
     * engine's own resolveHoliday/allOccurrencesIn (plain `year <
     * firstYear`, negative years valid) — carried through _withCadence
     * (state.ts) to persisted events, and enforced by the
     * getEventsFor/occurrencesInRange gates in events.ts. */
    if ((h as { firstYear?: number }).firstYear !== undefined) {
      entry.firstYear = (h as { firstYear?: number }).firstYear;
    }
    bySource.get(sourceKey)!.push(entry);
  }
  if (!bySource.size) return undefined;

  return Array.from(bySource.entries()).map(([key, events]) => ({
    key,
    label: titleWords(key.slice(wrapperKey.length + 1)),
    events,
  }));
}

function buildStructure(
  engine: EngineWorld,
  overlay: WrapperOverlay,
  monthNames: string[],
): StructuralSlot[] {
  const months = engine.calendar.months;
  const intercalariesByKey = new Map<string, EngineIntercalary>();
  for (const i of engine.calendar.intercalaries) intercalariesByKey.set(i.key, i);

  /* Group structural intercalaries by their (position, monthIndex) anchor. */
  type Anchor = { position: 'before' | 'after'; monthIndex: number };
  const isSameAnchor = (a: Anchor, b: Anchor) => a.position === b.position && a.monthIndex === b.monthIndex;
  const slotsByAnchor: { anchor: Anchor; slots: StructuralIntercalary[] }[] = [];
  for (const s of effectiveIntercalarySlots(engine, overlay)) {
    const entry = slotsByAnchor.find((e) => isSameAnchor(e.anchor, { position: s.position, monthIndex: s.monthIndex }));
    if (entry) entry.slots.push(s);
    else slotsByAnchor.push({ anchor: { position: s.position, monthIndex: s.monthIndex }, slots: [s] });
  }
  function intercalariesForAnchor(anchor: Anchor): StructuralIntercalary[] {
    const e = slotsByAnchor.find((x) => isSameAnchor(x.anchor, anchor));
    return e ? e.slots : [];
  }

  function structuralEntryForIntercalary(si: StructuralIntercalary): StructuralSlot {
    /* Gregorian Leap Day is synthesized from Feb's leapEvery; engine doesn't
     * expose it as an intercalary entry. */
    if (si.key === '__gregorian_leap_day') {
      return {
        name: 'Leap Day',
        days: 1,
        isIntercalary: true,
        leapEvery: 4,
        regularIndex: si.monthIndex,
        translation: { kind: 'intercalary', intercalaryKey: si.key, yearDelta: 0 },
      };
    }
    const ic = intercalariesByKey.get(si.key);
    if (!ic) {
      throw new Error(`[calendar wrapper] intercalary "${si.key}" not found in engine world ${engine.id}`);
    }
    /* When wrapper places an intercalary at the start of a year but the
     * engine's canonical position is at the end of the previous year,
     * adjust the year delta so the day-counts line up. */
    let yearDelta = 0;
    if (si.position === 'before' && ic.insertAfter.monthIndex !== si.monthIndex - 1) {
      /* Engine puts this intercalary after monthIndex `ic.insertAfter.monthIndex`,
       * which means it is "between year Y" and "year Y+1". Wrapper renders it
       * at the start of year Y+1, so wrapper-year Y maps to engine-year Y-1. */
      yearDelta = -1;
    }
    return {
      name: ic.label,
      days: ic.days,
      isIntercalary: true,
      leapEvery: ic.leapEvery ?? null,
      regularIndex: si.monthIndex,
      translation: { kind: 'intercalary', intercalaryKey: si.key, yearDelta },
    };
  }

  const out: StructuralSlot[] = [];
  for (let mi = 0; mi < months.length; mi++) {
    const m: EngineMonth = months[mi];
    /* Intercalaries placed "before" this canonical month. */
    for (const si of intercalariesForAnchor({ position: 'before', monthIndex: mi })) {
      out.push(structuralEntryForIntercalary(si));
    }
    /* The canonical month itself. */
    out.push({
      name: monthNames[mi] || m.name,
      days: m.days,
      isIntercalary: false,
      leapEvery: null,
      regularIndex: mi,
      translation: { kind: 'month', engineMonthIndex: mi },
    });
    /* Intercalaries placed "after" this canonical month. */
    for (const si of intercalariesForAnchor({ position: 'after', monthIndex: mi })) {
      out.push(structuralEntryForIntercalary(si));
    }
  }
  return out;
}

/** Returns the canonical structural slot at wrapper-mi for the given wrapper
 *  world key. Returns null if the world or index is unknown. */
export function getStructuralSlot(wrapperKey: string, mi: number): StructuralSlot | null {
  const arr = STRUCTURAL_CACHE[wrapperKey];
  if (!arr) return null;
  if (mi < 0 || mi >= arr.length) return null;
  return arr[mi];
}

/** Returns the full structural array for a wrapper world, or null. */
export function getStructuralArray(wrapperKey: string): readonly StructuralSlot[] | null {
  return STRUCTURAL_CACHE[wrapperKey] || null;
}

/** Returns the engine WorldId for a wrapper key, or null. */
export function getEngineId(wrapperKey: string): EngineWorldId | null {
  const ov = OVERLAYS[wrapperKey];
  return ov ? ov.engineId : null;
}

/** Resolve an external world identifier — either a wrapper registry key
 *  (e.g. 'faerunian') or the underlying engine WorldId (e.g. 'faerun') — to
 *  the wrapper key. Built directly off the `OVERLAYS` registry so callers
 *  (the `!cal token` importer) never need a second hardcoded world list;
 *  adding an overlay (e.g. Barovia) automatically makes it resolvable.
 *  Case-insensitive. Returns null when `id` matches neither a wrapper key
 *  nor a known engineId. */
export function resolveWorldKey(id: string): string | null {
  const needle = String(id || '').toLowerCase();
  if (!needle) return null;
  if (OVERLAYS[needle]) return needle;
  for (const key of OVERLAY_ORDER) {
    if (String(OVERLAYS[key]!.engineId).toLowerCase() === needle) return key;
  }
  return null;
}

/** True when a world's engine moons publish an official (WotC calendar
 *  tool) cycle-length table — `Moon.officialCycleDays`, selectable per
 *  call via `PhaseOptions.cycleSource: 'official'`. Currently Eberron
 *  only. Gates the GM "Lunar periods" setting: the settings row and the
 *  `!cal settings lunar` command only exist where the engine ships the
 *  alternate table. */
export function worldHasOfficialLunarPeriods(wrapperKey: string): boolean {
  const engineId = getEngineId(String(wrapperKey || '').toLowerCase());
  if (!engineId) return false;
  const engine = engineWorlds.get(engineId);
  return !!engine.moons && engine.moons.some((m) => m.officialCycleDays != null);
}

/** Engine holiday `description` for an event by its display label, in the
 *  given wrapper world (case-insensitive). Read live from engine
 *  `world.holidays`, so editing lore in the engine auto-bumps to Roll20 —
 *  the wrapper hosts no description text. Null when no holiday matches or the
 *  matched holiday carries no description. */
export function engineEventDescription(wrapperKey: string, label: string): string | null {
  const engineId = getEngineId(wrapperKey);
  if (!engineId) return null;
  const target = String(label || '').trim().toLowerCase();
  if (!target) return null;
  const engine = engineWorlds.get(engineId);
  for (const h of (engine.holidays || [])) {
    if (String((h as { label?: string }).label || '').trim().toLowerCase() === target) {
      const d = (h as { description?: string }).description;
      if (d) return d;
    }
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Composition: engine World + WrapperOverlay → WorldDefinition
 * ──────────────────────────────────────────────────────────────────────── */

function composeMoons(engine: EngineWorld, overlay: WrapperOverlay): MoonSystemDefinition | undefined {
  if (!engine.moons.length) return undefined;
  const bodies: MoonBodyDefinition[] = engine.moons.map((m) => {
    const lore = overlay.moonLore?.[m.key];
    const vis = overlay.moonVisibility?.[m.key] || 'normal';
    const fixedAnchor = overlay.moonFixedAnchors?.[m.key];
    return {
      key: m.key,
      name: m.name,
      title: m.title,
      color: m.color,
      associatedMonth: m.associatedMonthIndex == null ? null : (m.associatedMonthIndex + 1),
      phaseMode: 'standard_phase',
      cycleMode: 'fixed',
      baseCycleDays: m.cycleDays,
      synodicPeriod: m.cycleDays,
      visibilityMode: vis,
      fixedAnchor: fixedAnchor ? { ...fixedAnchor } : undefined,
      data: lore ? { loreNote: lore } : {},
    };
  });
  return {
    label: overlay.moonOverlays?.label || (engine.label + ' Moons'),
    anchorStrategy: overlay.moonOverlays?.anchorStrategy || 'per_moon_anchor',
    bodies,
  };
}

function composeCalendar(
  engine: EngineWorld,
  overlay: WrapperOverlay,
  structural: StructuralSlot[],
): CalendarDefinition {
  const namingOverlays = resolveNamingOverlays(engine, overlay);
  const monthNamesCanonical = namingOverlays.find(
    (o) => o.key === overlay.defaultOverlayKey,
  )?.monthNames || engine.calendar.months.map((m) => m.name);

  const monthDays = engine.calendar.months.map((m) => m.days);

  /* Build the legacy `structure` array (intercalary slots + regularIndex
   * placeholders) so callers that switch on monthSlot.isIntercalary etc. keep
   * working. */
  const structure: MonthSlot[] = structural.map((s) => {
    if (s.isIntercalary) {
      return {
        name: s.name,
        days: s.days,
        isIntercalary: true,
        leapEvery: s.leapEvery,
      };
    }
    return {
      name: s.name,
      days: s.days,
      regularIndex: s.regularIndex,
    };
  });

  /* Optional parse-aliases for month name resolution — combine engine
   * aliases (e.g. Faerûn "Old Calendar") with any wrapper-side extras. */
  const parseAliases: Record<string, number> = {};
  for (let mi = 0; mi < engine.calendar.months.length; mi++) {
    const m = engine.calendar.months[mi];
    if (m.aliases) for (const a of m.aliases) parseAliases[a.toLowerCase()] = mi;
  }

  return {
    key: overlay.wrapperKey,
    label: overlay.calendarLabel,
    weekdays: engine.calendar.weekdays.slice(),
    weekdayAbbr: overlay.weekdayAbbr,
    monthDays,
    structure,
    namingOverlays: namingOverlays.map((o) => ({ ...o, monthNames: o.monthNames.slice() })),
    defaultOverlayKey: overlay.defaultOverlayKey,
    weekdayProgressionMode: overlay.weekdayProgressionMode,
    intercalaryRenderMode: overlay.intercalaryRenderMode,
    dateFormatStyle: overlay.dateFormatStyle,
    parseAliases: Object.keys(parseAliases).length ? parseAliases : undefined,
  };
}

function composeWorld(overlay: WrapperOverlay): WorldDefinition {
  const engine = engineWorlds.get(overlay.engineId);
  const namingOverlays = resolveNamingOverlays(engine, overlay);
  const defaultOverlay = namingOverlays.find((o) => o.key === overlay.defaultOverlayKey)
    || namingOverlays[0];
  const monthNames = defaultOverlay ? defaultOverlay.monthNames : engine.calendar.months.map((m) => m.name);

  /* Scheme gating: overlays carrying a schemeProbe adapt their seasons to
   * whichever engine scheme is installed. */
  const legacyScheme = isLegacyScheme(engine, overlay);
  const probe = overlay.schemeProbe;
  const seasonsSource = (!legacyScheme && probe?.canonSeasons) ? probe.canonSeasons : overlay.seasons;

  const structural = buildStructure(engine, overlay, monthNames);
  STRUCTURAL_CACHE[overlay.wrapperKey] = structural;

  /* The wrapper's `defaultDate.month` is the structural-mi (0-based) of the
   * canonical month. Pick the wrapper's structural index for engine's
   * canonical default-date month. */
  let structMi = 0;
  const ed = engine.defaultDate;
  if (ed.kind === 'month') {
    for (let i = 0; i < structural.length; i++) {
      const t = structural[i].translation;
      if (t.kind === 'month' && t.engineMonthIndex === ed.monthIndex) { structMi = i; break; }
    }
  }

  return {
    key: overlay.wrapperKey,
    label: engine.label,
    description: engine.description,
    eraLabel: engine.eraLabel || (engine.id === 'gregorian' ? 'CE' : ''),
    sunName: overlay.sunName,
    defaultDate: {
      month: structMi,
      day: ed.kind === 'month' ? ed.day : 1,
      year: ed.year,
    },
    calendar: composeCalendar(engine, overlay, structural),
    seasons: seasonsSource.map((s) => ({
      ...s,
      names: s.names.slice(),
      transitions: s.transitions ? s.transitions.slice() : undefined,
      transitionsSouth: s.transitionsSouth ? s.transitionsSouth.slice() : undefined,
    })),
    defaultSeasonKey: overlay.defaultSeasonKey,
    moons: composeMoons(engine, overlay),
    eventPacks: eventPacksFromEngine(overlay.wrapperKey, engine, structural),
    capabilities: { ...overlay.capabilities },
    setup: overlay.setup || {},
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────────── */

const _worlds: Record<string, WorldDefinition> = {};
for (const key of OVERLAY_ORDER) {
  _worlds[key] = composeWorld(OVERLAYS[key]);
}

/** All registered worlds, keyed by WorldDefinition.key. */
export const WORLDS: Record<string, WorldDefinition> = _worlds;

/** Display-order list of world keys for menus and setup. */
export const WORLD_ORDER: string[] = OVERLAY_ORDER.slice();

/** Look up a world by key. Returns undefined if not found. */
export function getWorld(key: string): WorldDefinition | undefined {
  return WORLDS[String(key || '').toLowerCase()];
}

/* ──────────────────────────────────────────────────────────────────────────
 * Strategy helpers — check properties of the current world's calendar.
 * ──────────────────────────────────────────────────────────────────────── */
import type { WeekdayProgressionMode, IntercalaryRenderMode, DateFormatStyle } from './types.js';

export function weekdayProgressionFor(sysKey: string): WeekdayProgressionMode {
  return WORLDS[sysKey]?.calendar.weekdayProgressionMode ?? 'continuous_serial';
}

export function intercalaryRenderFor(sysKey: string): IntercalaryRenderMode {
  return WORLDS[sysKey]?.calendar.intercalaryRenderMode ?? 'regular_grid';
}

export function dateFormatFor(sysKey: string): DateFormatStyle {
  return WORLDS[sysKey]?.calendar.dateFormatStyle ?? 'ordinal_of_month';
}

/** Check whether a world has a particular capability. */
export function worldHas(sysKey: string, cap: keyof import('./types.js').WorldCapabilities): boolean {
  const w = WORLDS[sysKey];
  return !!(w && w.capabilities[cap]);
}

/** Get the moon system definition for a world (if any). */
export function moonSystemFor(sysKey: string): import('./types.js').MoonSystemDefinition | undefined {
  return WORLDS[sysKey]?.moons;
}
