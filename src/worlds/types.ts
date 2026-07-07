/**
 * World Definition Types
 *
 * These types define the shape of a world package. Each supported setting
 * provides a WorldDefinition that the engine uses to drive calendar, moon,
 * event, and setup behavior without world-specific conditionals.
 */

/* ── Calendar ─────────────────────────────────────────────────────────── */

export type WeekdayProgressionMode =
  | 'continuous_serial'   // weekday increments globally (Eberron, Gregorian, Greyhawk)
  | 'month_reset'         // weekday resets at the start of each month/tenday (Harptos)
  | 'festival_fixed';     // intercalary days use a fixed weekday index

export type IntercalaryRenderMode =
  | 'banner_day'          // single intercalary day rendered as a banner row (Gregorian leap day)
  | 'festival_strip'      // festival days render as a dedicated strip (Harptos)
  | 'week_block'          // intercalary period renders as its own week block (Greyhawk festivals)
  | 'regular_grid';       // no special rendering — intercalary days sit in the normal grid

export type DateFormatStyle =
  | 'ordinal_of_month'    // "14th of Zarantyr, 998 YK"
  | 'month_day_year'      // "January 14, 2024 CE"
  | 'festival_name_only'  // "Midwinter"
  | 'custom';

export type MonthSlot = {
  name: string;
  days: number;
  isIntercalary?: boolean;
  leapEvery?: number | null;
  regularIndex?: number;
};

export type NamingOverlay = {
  key: string;
  label: string;
  monthNames: string[];
  colorTheme: string;
  /** When true, `monthNames` is ignored and the engine world's own month
   *  names are used. Set for worlds whose canon is still being corrected
   *  engine-side, so renames flow through automatically. */
  useEngineMonthNames?: boolean;
};

export type CalendarDefinition = {
  key: string;
  label: string;
  weekdays: string[];
  weekdayAbbr?: Record<string, string>;
  monthDays: number[];
  structure?: MonthSlot[];
  namingOverlays: NamingOverlay[];
  defaultOverlayKey: string;
  weekdayProgressionMode: WeekdayProgressionMode;
  intercalaryRenderMode: IntercalaryRenderMode;
  dateFormatStyle: DateFormatStyle;
  parseAliases?: Record<string, number>;
};

/* ── Seasons ──────────────────────────────────────────────────────────── */

export type SeasonTransition = {
  mi: number;
  day: number;
  season: string;
};

export type SeasonDefinition = {
  key: string;
  names: string[];
  hemisphereAware: boolean;
  transitions?: SeasonTransition[];
  transitionsSouth?: SeasonTransition[];
};

/* ── Moons ────────────────────────────────────────────────────────────── */

export type MoonAnchorStrategy =
  | 'per_moon_anchor'     // each moon anchored independently (Eberron)
  | 'conjunction_anchor'  // all moons anchored from a conjunction event (Dragonlance)
  | 'visibility_anchor'   // anchored from visibility window (Exandria Ruidus)
  | 'seed_only';          // no explicit anchor, derived from world seed

export type MoonPhaseMode =
  | 'standard_phase'          // normal waxing/waning cycle
  | 'always_full_when_visible' // effectively full during visibility window (Ruidus)
  | 'hidden_phase'            // phase exists but hidden from players by default (Nuitari)
  | 'derived_only';           // phase derived from other moons, not independent

export type MoonCycleMode =
  | 'fixed'                   // exact cycle length in days
  | 'seeded_drift_uniform'    // base + uniform random per cycle
  | 'seeded_drift_triangular' // base + triangular random per cycle
  | 'custom';

export type MoonVisibilityMode =
  | 'normal'              // always visible
  | 'hidden_by_default'   // GM-only unless revealed (Nuitari, Patera)
  | 'visible_window'      // only visible during part of cycle (Ruidus)
  | 'gm_only';            // never shown to players

export type MoonAnchorDate = {
  year: number;
  month: number; // 1-based regular month index
  day: number;
};

export type MoonFixedAnchorDefinition = {
  referenceDate: MoonAnchorDate;
  timeFrac?: number;          // 0 = midnight, 0.5 = noon
  phaseAngleDeg?: number;     // 180 = full, 0 = new
  skyLongDeg?: number;        // absolute sky longitude target at the anchor
  overheadAtAnchor?: boolean; // force the body onto the meridian/zenith at the anchor
  observerLatitudeDeg?: number;
};

export type MoonOrbitalDataDefinition = {
  angularSizeVsSun?: number;
};

export type MoonMotionTuningDefinition = {
  inclinationBase?: number;
  inclinationAmp?: number;
  inclinationPeriodDays?: number;
  ascendingNode?: number;
  nodePrecessionDegPerYear?: number;
  distanceSwingPct?: number;
  distancePeriodDays?: number;
  apsisAngle?: number;
  apsisPrecessionDegPerYear?: number;
  retrograde?: boolean;
  orbitDirection?: 'prograde' | 'retrograde';
};

export type MoonBodyDefinition = {
  key: string;
  name: string;
  title?: string;
  color?: string;
  associatedMonth?: number | null;
  phaseMode: MoonPhaseMode;
  cycleMode: MoonCycleMode;
  baseCycleDays: number;
  cycleFormula?: string;
  visibilityMode: MoonVisibilityMode;
  synodicPeriod?: number;
  siderealPeriod?: number;
  diameter?: number;
  distance?: number;
  inclination?: number;
  eccentricity?: number;
  albedo?: number;
  orbitalData?: MoonOrbitalDataDefinition;
  motionTuning?: MoonMotionTuningDefinition;
  fixedAnchor?: MoonFixedAnchorDefinition;
  data?: Record<string, unknown>;
};

export type MoonSystemDefinition = {
  label: string;
  anchorStrategy: MoonAnchorStrategy;
  bodies: MoonBodyDefinition[];
};

/* ── Events ───────────────────────────────────────────────────────────── */

export type DefaultEvent = {
  name: string;
  month: number | 'all';
  day: string | number;
  color?: string;
  source: string;
  /** Year cadence (engine `year_cadence` holidays, e.g. Night of the Eye).
   *  When set, the event occurs only in years where
   *  (year - anchorYear) % everyYears === 0. Absent = every year. */
  everyYears?: number;
  anchorYear?: number;
};

export type EventPackDefinition = {
  key: string;
  label: string;
  events: DefaultEvent[];
};

/* ── Capabilities & Hooks ─────────────────────────────────────────────── */

export type WorldCapabilities = {
  moons: boolean;
  planes: boolean;
};

export type WorldHooks = {
  setup?: Record<string, unknown>;
  calendar?: Record<string, unknown>;
  moons?: Record<string, unknown>;
  weather?: Record<string, unknown>;
  ui?: Record<string, unknown>;
};

/* ── Setup ────────────────────────────────────────────────────────────── */

export type SetupStepDefinition = {
  key: string;
  label: string;
  type: 'choice' | 'query' | 'toggle';
  options?: { key: string; label: string }[];
  default?: string | boolean;
};

export type SetupDefinition = {
  extraSteps?: SetupStepDefinition[];
};

/* ── World Definition (top-level) ─────────────────────────────────────── */

export type WorldDefinition = {
  key: string;
  label: string;
  description: string;
  eraLabel: string;
  defaultDate: { month: number; day: number; year: number };
  calendar: CalendarDefinition;
  seasons: SeasonDefinition[];
  defaultSeasonKey: string;
  sunName?: string;
  moons?: MoonSystemDefinition;
  eventPacks?: EventPackDefinition[];
  capabilities: WorldCapabilities;
  setup: SetupDefinition;
  hooks?: WorldHooks;
};
