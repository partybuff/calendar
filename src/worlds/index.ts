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

import { worlds as engineWorlds } from '@partybuff/calendar-engine';
import type {
  World as EngineWorld,
  WorldId as EngineWorldId,
  Month as EngineMonth,
  Intercalary as EngineIntercalary,
} from '@partybuff/calendar-engine';
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

  /* Scheme gating: overlays carrying a schemeProbe adapt their seasons and
   * event packs to whichever engine scheme is installed. */
  const legacyScheme = isLegacyScheme(engine, overlay);
  const probe = overlay.schemeProbe;
  const seasonsSource = (!legacyScheme && probe?.canonSeasons) ? probe.canonSeasons : overlay.seasons;
  const eventPacksSource = (overlay.eventPacks && !legacyScheme && probe?.legacyOnlyEventPackKeys)
    ? overlay.eventPacks.filter((p) => !probe.legacyOnlyEventPackKeys!.includes(p.key))
    : overlay.eventPacks;

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
    eventPacks: eventPacksSource ? eventPacksSource.map((p): EventPackDefinition => ({
      key: p.key,
      label: p.label,
      events: p.events.map((e) => ({ ...e })),
    })) : undefined,
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
