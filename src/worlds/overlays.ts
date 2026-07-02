/**
 * Roll20 wrapper overlays for engine worlds.
 *
 * The engine ships canonical world data (months, intercalaries, moons,
 * holidays). The Roll20 wrapper needs extra per-world data that the engine
 * does not carry: naming overlays for month aliases, color themes per overlay,
 * default render modes, date format styles, weekday abbreviations, capability
 * flags, event source packs, and a structural index map that interleaves
 * engine intercalaries into the wrapper's flat `cal.months` array.
 *
 * Anything that's "canon" — month names, day counts, weekday names, moon
 * data, holiday anchors — comes from the engine. Anything that's Roll20-side
 * presentation lives here.
 */
import type { World } from '@partybuff/calendar-engine';
import type {
  WeekdayProgressionMode,
  IntercalaryRenderMode,
  DateFormatStyle,
  NamingOverlay,
  SeasonDefinition,
  EventPackDefinition,
  WorldCapabilities,
  SetupDefinition,
  MoonSystemDefinition,
  MoonFixedAnchorDefinition,
} from './types.js';

/* --------------------------------------------------------------------------
 * Structural intercalary slot
 *
 * Where, in the wrapper's flat month-or-intercalary array, this intercalary
 * should be inserted. `position: 'before'` means the slot precedes month
 * `monthIndex` (e.g. Greyhawk Needfest before Fireseek). `position: 'after'`
 * means the slot follows month `monthIndex` (e.g. Harptos Midwinter after
 * Hammer). The intercalary key matches the engine's
 * `Intercalary.key` so the adapter can look it up.
 * ------------------------------------------------------------------------ */
export type StructuralIntercalary = {
  key: string;                    // engine intercalary key
  position: 'before' | 'after';
  monthIndex: number;             // engine canonical month index
};

/* --------------------------------------------------------------------------
 * Wrapper overlay
 *
 * One overlay per engine world. The wrapper composes engine `World` data
 * with this overlay to produce a `WorldDefinition` for legacy callers.
 * ------------------------------------------------------------------------ */
export type WrapperOverlay = {
  /** Wrapper-side key. Equals the engine WorldId for most worlds, but
   *  Faerûn is `faerunian` in the wrapper to preserve saved-game keys. */
  wrapperKey: string;
  /** Engine WorldId we read canon from. */
  engineId: World['id'];

  /** "Galifar Calendar", "Harptos Calendar", etc. */
  calendarLabel: string;
  /** Continent / world / political label tuples for the setup wizard. */
  worldLabel?: string;
  continentLabel?: string;
  /** Sun name (Roll20 lore field; not engine-tracked). */
  sunName?: string;

  /** Default weekday abbreviations for the calendar grid header. */
  weekdayAbbr?: Record<string, string>;

  /** Engine intercalaries interleaved into the wrapper's flat month array.
   *  Order doesn't matter — the composer sorts by structural position. */
  intercalarySlots: StructuralIntercalary[];

  /** When true, `intercalarySlots` is ignored and slots are derived from
   *  the engine world's own intercalary list (position 'after' each
   *  `insertAfter.monthIndex`). Use for worlds whose engine canon is still
   *  being corrected — the wrapper then tracks engine structure across
   *  releases instead of crashing on renamed keys. Explicit slots remain
   *  the right tool for worlds needing 'before' placement or yearDelta
   *  (Greyhawk Needfest). */
  deriveIntercalarySlots?: boolean;

  /** Scheme-migration gate for worlds whose engine canon is being reworked.
   *  `legacyKey` names an intercalary that exists ONLY in the old engine
   *  scheme. While it's present the overlay applies unchanged; once the
   *  engine ships the rework (key absent), `canonSeasons` replaces
   *  `seasons` and event packs listed in `legacyOnlyEventPackKeys` are
   *  dropped (their month/day anchors reference the old layout). */
  schemeProbe?: {
    legacyKey: string;
    canonSeasons?: SeasonDefinition[];
    legacyOnlyEventPackKeys?: string[];
  };

  /** Naming overlays — alternate month-name sets the GM can swap to.
   *  The first overlay (defaultOverlayKey) is canonical from the engine. */
  namingOverlays: NamingOverlay[];
  defaultOverlayKey: string;

  weekdayProgressionMode: WeekdayProgressionMode;
  intercalaryRenderMode: IntercalaryRenderMode;
  dateFormatStyle: DateFormatStyle;

  /** Optional Roll20-side moon system data — flavor fields the engine
   *  doesn't carry (visibilityMode, custom data blobs, etc). The composer
   *  layers this onto engine `Moon` data. */
  moonOverlays?: Partial<MoonSystemDefinition>;
  /** Override moon visibility per-key (engine doesn't ship this). */
  moonVisibility?: Record<string, 'normal' | 'hidden_by_default' | 'visible_window' | 'gm_only'>;
  /** Optional lore strings keyed by moon key. */
  moonLore?: Record<string, string>;
  /** Optional Roll20-only fixed-anchor data per moon key. Carries the
   *  meridian/altitude / phase-angle override the legacy moon module uses
   *  for setting up conjunction anchors (Dragonlance Night of the Eye, etc.).
   *  The engine doesn't surface this — it's a Roll20 rendering concern. */
  moonFixedAnchors?: Record<string, MoonFixedAnchorDefinition>;

  seasons: SeasonDefinition[];
  defaultSeasonKey: string;

  eventPacks?: EventPackDefinition[];

  capabilities: WorldCapabilities;

  setup: SetupDefinition;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Per-world overlays
 * ──────────────────────────────────────────────────────────────────────── */

const eberronOverlay: WrapperOverlay = {
  wrapperKey: 'eberron',
  engineId: 'eberron',
  calendarLabel: 'Galifar',
  worldLabel: 'Eberron',
  continentLabel: 'Khorvaire',
  sunName: 'Arrah',
  intercalarySlots: [],
  namingOverlays: [
    {
      key: 'standard',
      label: 'Galifar',
      monthNames: [
        'Zarantyr', 'Olarune', 'Therendor', 'Eyre',
        'Dravago', 'Nymm', 'Lharvion', 'Barrakas',
        'Rhaan', 'Sypheros', 'Aryth', 'Vult',
      ],
      colorTheme: 'lunar',
    },
    {
      key: 'druidic',
      label: 'Druidic',
      monthNames: [
        'Frostmantle', 'Thornrise', 'Treeborn', 'Rainsong',
        'Arrowfar', 'Sunstride', 'Glitterstream', 'Havenwild',
        'Stormborn', 'Harrowfall', 'Silvermoon', 'Windwhisper',
      ],
      colorTheme: 'druidic',
    },
    {
      key: 'halfling',
      label: 'Halfling',
      monthNames: [
        'Fang', 'Wind', 'Ash', 'Hunt',
        'Song', 'Dust', 'Claw', 'Blood',
        'Horn', 'Heart', 'Spirit', 'Smoke',
      ],
      colorTheme: 'halfling',
    },
    {
      key: 'dwarven',
      label: 'Dwarven',
      monthNames: [
        'Aruk', 'Lurn', 'Ulbar', 'Kharn',
        'Ziir', 'Dwarhuun', 'Jond', 'Sylar',
        'Razagul', 'Thazm', 'Drakhadur', 'Uarth',
      ],
      colorTheme: 'dwarven',
    },
  ],
  defaultOverlayKey: 'standard',
  weekdayProgressionMode: 'continuous_serial',
  intercalaryRenderMode: 'regular_grid',
  dateFormatStyle: 'ordinal_of_month',

  moonOverlays: { anchorStrategy: 'per_moon_anchor' },

  seasons: [
    {
      key: 'eberron',
      names: [
        'Mid-winter', 'Late winter', 'Early spring', 'Mid-spring',
        'Late spring', 'Early summer', 'Mid-summer', 'Late summer',
        'Early autumn', 'Mid-autumn', 'Late autumn', 'Early winter',
      ],
      hemisphereAware: false,
    },
  ],
  defaultSeasonKey: 'eberron',

  eventPacks: [
    {
      key: 'sharn', label: 'Sharn', events: [
        { name: 'Tain Gala', month: 'all', day: 'first far', color: '#F7E7CE', source: 'sharn' },
        { name: 'Crystalfall', month: 2, day: 9, color: '#D7F3FF', source: 'sharn' },
        { name: 'Day of Ashes', month: 5, day: 3, color: '#B0BEC5', source: 'sharn' },
        { name: 'The Race of Eight Winds', month: 7, day: 23, color: '#006D3C', source: 'sharn' },
      ],
    },
    {
      key: 'khorvaire', label: 'Khorvaire', events: [
        { name: 'Day of Mourning', month: 2, day: 20, color: '#9E9E9E', source: 'khorvaire' },
        { name: "Galifar's Throne", month: 6, day: 5, color: '#D4AF37', source: 'khorvaire' },
        { name: 'Thronehold', month: 11, day: 11, color: '#E80001', source: 'khorvaire' },
      ],
    },
    {
      key: 'sovereign host', label: 'Sovereign Host', events: [
        { name: "Onatar's Flame", month: 1, day: 7, color: '#FF6F00', source: 'sovereign host' },
        { name: "Turrant's Gift", month: 2, day: 14, color: '#B8860B', source: 'sovereign host' },
        { name: "Olladra's Feast", month: 2, day: 28, color: '#8BC34A', source: 'sovereign host' },
        { name: "Sun's Blessing", month: 3, day: 15, color: '#FFC107', source: 'sovereign host' },
        { name: "Aureon's Crown", month: 5, day: 26, color: '#283593', source: 'sovereign host' },
        { name: 'Brightblade', month: 6, day: 12, color: '#B71C1C', source: 'sovereign host' },
        { name: "Bounty's Blessing", month: 7, day: 14, color: '#388E3C', source: 'sovereign host' },
        { name: 'The Hunt', month: 8, day: 4, color: '#1B5E20', source: 'sovereign host' },
        { name: "Boldrei's Feast", month: 9, day: 9, color: '#F57C00', source: 'sovereign host' },
        { name: 'Market Day', month: 11, day: 20, color: '#FFD54F', source: 'sovereign host' },
      ],
    },
    {
      key: 'dark six', label: 'The Dark Six', events: [
        { name: "Shargon's Bargain", month: 4, day: 13, color: '#006064', source: 'dark six' },
        { name: 'Second Skin', month: 6, day: 11, color: '#809E62', source: 'dark six' },
        { name: 'Wildnight', month: 10, day: '18-19', color: '#AD1457', source: 'dark six' },
        { name: 'Long Shadows', month: 12, day: '26-28', color: '#0D0D0D', source: 'dark six' },
      ],
    },
    {
      key: 'silver flame', label: 'Silver Flame', events: [
        { name: 'Rebirth Eve', month: 1, day: 14, color: '#EAF2FF', source: 'silver flame' },
        { name: "Bright Souls' Day", month: 2, day: 18, color: '#FFF2C6', source: 'silver flame' },
        { name: 'Tirasday', month: 3, day: 5, color: '#DCEBFF', source: 'silver flame' },
        { name: 'Initiation Day', month: 4, day: 11, color: '#C7E3FF', source: 'silver flame' },
        { name: "Baker's Night", month: 5, day: 6, color: '#D8B98F', source: 'silver flame' },
        { name: 'Promisetide', month: 5, day: 28, color: '#BDE3FF', source: 'silver flame' },
        { name: 'First Dawn', month: 6, day: 21, color: '#FFD1A6', source: 'silver flame' },
        { name: 'Silvertide', month: 7, day: 14, color: '#F2F7FF', source: 'silver flame' },
        { name: 'Victory Day', month: 8, day: 9, color: '#B3E5FC', source: 'silver flame' },
        { name: "Fathen's Fall", month: 8, day: 25, color: '#E7ECF5', source: 'silver flame' },
        { name: 'The Ascension', month: 10, day: 1, color: '#E6F0FF', source: 'silver flame' },
        { name: "Saint Valtros's Day", month: 10, day: 25, color: '#E8ECFF', source: 'silver flame' },
        { name: 'Rampartide', month: 11, day: 24, color: '#D6F5D6', source: 'silver flame' },
        { name: 'Khybersef', month: 12, day: 27, color: '#111827', source: 'silver flame' },
        { name: 'Day of Cleansing Fire', month: 'all', day: 'all sul', color: '#F2F7FF', source: 'silver flame' },
      ],
    },
    {
      key: 'stormreach', label: 'Stormreach', events: [
        { name: 'The Burning Titan', month: 3, day: 1, color: '#FF5722', source: 'stormreach' },
        { name: "Pirate's Moon", month: 5, day: 20, color: '#0E7490', source: 'stormreach' },
        { name: 'The Annual Games', month: 6, day: '1-14', color: '#2E7D32', source: 'stormreach' },
        { name: 'Shacklebreak', month: 11, day: 1, color: '#455A64', source: 'stormreach' },
      ],
    },
  ],

  capabilities: { moons: true, planes: true },
  setup: {},
};

const faerunOverlay: WrapperOverlay = {
  wrapperKey: 'faerunian',
  engineId: 'faerun',
  calendarLabel: 'Harptos Calendar',
  worldLabel: 'Toril',
  continentLabel: 'Faerun',
  weekdayAbbr: {
    Firstday: '1st', Secondday: '2nd', Thirdday: '3rd', Fourthday: '4th',
    Fifthday: '5th', Sixthday: '6th', Seventhday: '7th', Eighthday: '8th',
    Ninthday: '9th', Tenthday: '10th',
  },
  /* Harptos layout: festivals interleaved between the canonical months.
   * Wrapper sequence (structural), matching engine canon as of 0.24.0:
   *   Hammer · Midwinter · Alturiak · Ches · Tarsakh · Greengrass ·
   *   Mirtul · Kythorn · Flamerule · Midsummer · Shieldmeet · Eleasis ·
   *   Eleint · Highharvestide · Marpenoth · Uktar · Feast of the Moon ·
   *   Nightal
   * These positions MUST match the engine's `insertAfter` data — the
   * wrapper serializes dates with this order while moon phases re-serialize
   * through the engine's order, so a mismatch makes lunar output
   * discontinuous across the festivals. Guarded by test/canon-structure. */
  intercalarySlots: [
    { key: 'midwinter',         position: 'after', monthIndex: 0 },
    { key: 'greengrass',        position: 'after', monthIndex: 3 },
    { key: 'midsummer',         position: 'after', monthIndex: 6 },
    { key: 'shieldmeet',        position: 'after', monthIndex: 6 },
    { key: 'highharvestide',    position: 'after', monthIndex: 8 },
    { key: 'feast_of_the_moon', position: 'after', monthIndex: 10 },
  ],
  namingOverlays: [
    {
      key: 'standard',
      label: 'Standard (Dalereckoning)',
      monthNames: [
        'Hammer', 'Alturiak', 'Ches', 'Tarsakh',
        'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis',
        'Eleint', 'Marpenoth', 'Uktar', 'Nightal',
      ],
      colorTheme: 'seasons',
    },
  ],
  defaultOverlayKey: 'standard',
  weekdayProgressionMode: 'month_reset',
  intercalaryRenderMode: 'festival_strip',
  dateFormatStyle: 'ordinal_of_month',

  moonOverlays: { anchorStrategy: 'per_moon_anchor', label: 'Faerunian Moons' },
  moonLore: {
    selune: 'Full at midnight Hammer 1, 1372 DR. Trailed by the Tears of Selûne. Associated with lycanthropy, divination, navigation, and tides.',
  },

  seasons: [
    {
      key: 'faerun',
      names: [
        'Winter', 'Winter', 'Spring', 'Spring', 'Spring',
        'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter',
      ],
      hemisphereAware: true,
    },
  ],
  defaultSeasonKey: 'faerun',
  capabilities: { moons: true, planes: false },
  setup: {},
};

const gregorianOverlay: WrapperOverlay = {
  wrapperKey: 'gregorian',
  engineId: 'gregorian',
  calendarLabel: 'Gregorian Calendar',
  worldLabel: 'Earth',
  weekdayAbbr: {
    Sunday: 'Sun', Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
    Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
  },
  /* Wrapper models Gregorian leap day as a synthetic intercalary slot inserted
   * after February. Engine encodes it as Feb.leapEvery=4 (29 days on leap years).
   * The composer recognizes this overlay flag and synthesizes a 'leap_day' slot. */
  intercalarySlots: [
    /* Synthetic — engine doesn't ship a 'leap_day' intercalary; composer
     * generates it from Feb's leapEvery. */
    { key: '__gregorian_leap_day', position: 'after', monthIndex: 1 },
  ],
  namingOverlays: [
    {
      key: 'standard',
      label: 'Standard',
      monthNames: [
        'January', 'February', 'March', 'April',
        'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December',
      ],
      colorTheme: 'birthstones',
    },
  ],
  defaultOverlayKey: 'standard',
  weekdayProgressionMode: 'continuous_serial',
  intercalaryRenderMode: 'banner_day',
  dateFormatStyle: 'month_day_year',

  moonOverlays: { anchorStrategy: 'per_moon_anchor', label: 'Luna' },

  seasons: [
    {
      key: 'gregorian',
      names: [
        'Winter', 'Winter', 'Spring', 'Spring', 'Spring',
        'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter',
      ],
      hemisphereAware: true,
      transitions: [
        { mi: 2, day: 20, season: 'Spring' },
        { mi: 5, day: 21, season: 'Summer' },
        { mi: 8, day: 22, season: 'Autumn' },
        { mi: 11, day: 21, season: 'Winter' },
      ],
      transitionsSouth: [
        { mi: 2, day: 20, season: 'Autumn' },
        { mi: 5, day: 21, season: 'Winter' },
        { mi: 8, day: 22, season: 'Spring' },
        { mi: 11, day: 21, season: 'Summer' },
      ],
    },
  ],
  defaultSeasonKey: 'gregorian',
  eventPacks: [
    {
      key: 'gregorian_seasons', label: 'Gregorian Seasons', events: [
        { name: 'First Day of Winter', month: 12, day: 21, color: '#A8DADC', source: 'gregorian' },
        { name: 'Winter Solstice', month: 12, day: 21, color: '#A8DADC', source: 'gregorian' },
        { name: 'First Day of Spring', month: 3, day: 20, color: '#A8E6A3', source: 'gregorian' },
        { name: 'Spring Equinox', month: 3, day: 20, color: '#A8E6A3', source: 'gregorian' },
        { name: 'First Day of Summer', month: 6, day: 21, color: '#FFD166', source: 'gregorian' },
        { name: 'Summer Solstice', month: 6, day: 21, color: '#FFD166', source: 'gregorian' },
        { name: 'First Day of Autumn', month: 9, day: 22, color: '#F4A261', source: 'gregorian' },
        { name: 'Autumn Equinox', month: 9, day: 22, color: '#F4A261', source: 'gregorian' },
      ],
    },
  ],
  capabilities: { moons: true, planes: false },
  setup: {},
};

const greyhawkOverlay: WrapperOverlay = {
  wrapperKey: 'greyhawk',
  engineId: 'greyhawk',
  calendarLabel: 'Dozenmonth of Luna',
  worldLabel: 'Oerth',
  weekdayAbbr: {
    Starday: 'Sta', Sunday: 'Sun', Moonday: 'Mon',
    Godsday: 'God', Waterday: 'Wat', Earthday: 'Ear', Freeday: 'Fre',
  },
  /* Wrapper structure: Needfest precedes Fireseek (start-of-year position).
   * Engine: needfest@insertAfter mi 11 (end-of-year position). The composer
   * uses `position: 'before' monthIndex: 0` to put Needfest first in the
   * wrapper's flat months array — the adapter then maps wrapper-year Y
   * Needfest to engine-year (Y-1) needfest for serial math. */
  intercalarySlots: [
    { key: 'needfest',  position: 'before', monthIndex: 0 },
    { key: 'growfest',  position: 'after',  monthIndex: 2 },
    { key: 'richfest',  position: 'after',  monthIndex: 5 },
    { key: 'brewfest',  position: 'after',  monthIndex: 8 },
  ],
  namingOverlays: [
    {
      key: 'standard',
      label: 'Common',
      monthNames: [
        'Fireseek', 'Readying', 'Coldeven', 'Planting',
        'Flocktime', 'Wealsun', 'Reaping', 'Goodmonth',
        'Harvester', 'Patchwall', "Ready'reat", 'Sunsebb',
      ],
      colorTheme: 'greyhawk',
    },
  ],
  defaultOverlayKey: 'standard',
  weekdayProgressionMode: 'continuous_serial',
  intercalaryRenderMode: 'week_block',
  dateFormatStyle: 'ordinal_of_month',

  moonOverlays: { anchorStrategy: 'per_moon_anchor', label: 'Oerth Moons' },
  moonLore: {
    luna: 'Luna is Oerth\'s larger moon. Its 28-day cycle aligns perfectly with the calendar months.',
    celene: 'Celene is Oerth\'s smaller, aquamarine-hued moon. Its 91-day cycle is watched by druids and astrologers.',
  },

  seasons: [
    {
      key: 'greyhawk',
      names: [
        'Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer',
        'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter',
      ],
      hemisphereAware: false,
    },
  ],
  defaultSeasonKey: 'greyhawk',
  eventPacks: [
    {
      key: 'greyhawk_festivals', label: 'Greyhawk Festivals', events: [
        { name: 'Needfest begins', month: 1, day: 1, color: '#E0C68A', source: 'greyhawk' },
        { name: 'Growfest begins', month: 4, day: 1, color: '#A8E6A3', source: 'greyhawk' },
        { name: 'Richfest begins', month: 7, day: 1, color: '#FFD700', source: 'greyhawk' },
        { name: 'Midsummer', month: 7, day: 4, color: '#FFD700', source: 'greyhawk' },
        { name: 'Brewfest begins', month: 10, day: 1, color: '#D2691E', source: 'greyhawk' },
      ],
    },
  ],
  capabilities: { moons: true, planes: false },
  setup: {},
};

const dragonlanceOverlay: WrapperOverlay = {
  wrapperKey: 'dragonlance',
  engineId: 'dragonlance',
  calendarLabel: 'Krynnish Calendar',
  worldLabel: 'Krynn',
  weekdayAbbr: {
    Linaras: 'Lin', Palast: 'Pal', Majetag: 'Maj',
    Kirinor: 'Kir', Misham: 'Mis', Bakukal: 'Bak', Bracha: 'Bra',
  },
  intercalarySlots: [],
  namingOverlays: [
    {
      key: 'standard',
      label: 'Solamnic',
      monthNames: [
        'Winter Come', 'Winter Deep', 'Spring Dawning', 'Spring Rain',
        'Spring Blossom', 'Summer Home', 'Summer Run', 'Summer End',
        'Autumn Harvest', 'Autumn Twilight', 'Autumn Dark', 'Winter Night',
      ],
      colorTheme: 'dragonlance',
    },
  ],
  defaultOverlayKey: 'standard',
  weekdayProgressionMode: 'continuous_serial',
  intercalaryRenderMode: 'regular_grid',
  dateFormatStyle: 'ordinal_of_month',

  moonOverlays: { anchorStrategy: 'conjunction_anchor', label: 'Moons of Krynn' },
  moonLore: {
    solinari: 'Solinari governs Good magic on Krynn. Its 36-day cycle determines the power of White Robed wizards. Named for the god Solinari, son of Paladine.',
    lunitari: 'Lunitari governs Neutral magic on Krynn. Its 28-day cycle matches the calendar months. Named for the goddess Lunitari, daughter of Gilean.',
    nuitari: 'Nuitari governs Evil magic on Krynn. Its rapid 8-day cycle is invisible to all but those who serve darkness. Named for the god Nuitari, son of Takhisis. Only Black Robed wizards can see its dark disk against the stars.',
  },
  moonVisibility: { nuitari: 'hidden_by_default' },
  /* All three Krynnish moons share a conjunction anchor at Summer Run 7, 346 PC
   * (the canonical "Night of the Eye"). Roll20-only — the engine surfaces
   * canonical phases without this anchor concept. */
  moonFixedAnchors: {
    solinari: {
      referenceDate: { year: 346, month: 7, day: 7 },
      timeFrac: 0,
      phaseAngleDeg: 180,
      skyLongDeg: 6.428571428571429,
      overheadAtAnchor: false,
      observerLatitudeDeg: 30,
    },
    lunitari: {
      referenceDate: { year: 346, month: 7, day: 7 },
      timeFrac: 0,
      phaseAngleDeg: 180,
      skyLongDeg: 6.428571428571429,
      overheadAtAnchor: false,
      observerLatitudeDeg: 30,
    },
    nuitari: {
      referenceDate: { year: 346, month: 7, day: 7 },
      timeFrac: 0,
      phaseAngleDeg: 180,
      skyLongDeg: 6.428571428571429,
      overheadAtAnchor: false,
      observerLatitudeDeg: 30,
    },
  },

  seasons: [
    {
      key: 'dragonlance',
      names: [
        'Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer',
        'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter',
      ],
      hemisphereAware: false,
    },
  ],
  defaultSeasonKey: 'dragonlance',
  eventPacks: [
    {
      key: 'dragonlance_calendar', label: 'Krynnish Calendar Events', events: [
        { name: 'Yule', month: 1, day: 1, color: '#A8DADC', source: 'dragonlance' },
        { name: 'Spring Dawning', month: 3, day: 1, color: '#A8E6A3', source: 'dragonlance' },
        { name: 'Midsummer', month: 6, day: 14, color: '#FFD700', source: 'dragonlance' },
        { name: 'Harvest Home', month: 9, day: 14, color: '#F4A261', source: 'dragonlance' },
      ],
    },
  ],
  capabilities: { moons: true, planes: false },
  setup: {
    extraSteps: [
      {
        key: 'nightOfTheEye',
        label: 'Night of the Eye Anchor',
        type: 'choice',
        options: [
          { key: 'default', label: 'Use the default Night of the Eye (recommended)' },
          { key: 'manual', label: 'Set manually after setup' },
        ],
        default: 'default',
      },
    ],
  },
};

const exandriaOverlay: WrapperOverlay = {
  wrapperKey: 'exandria',
  engineId: 'exandria',
  calendarLabel: 'Exandrian Calendar',
  worldLabel: 'Exandria',
  weekdayAbbr: {
    Miresen: 'Mir', Grissen: 'Gri', Whelsen: 'Whe',
    Conthsen: 'Con', Folsen: 'Fol', Yulisen: 'Yul', "Da'leysen": 'Dal',
  },
  intercalarySlots: [],
  namingOverlays: [
    {
      key: 'standard',
      label: 'Exandrian',
      monthNames: [
        'Horisal', 'Misuthar', 'Dualahei', 'Thunsheer',
        'Unndilar', 'Brussendar', 'Sydenstar', 'Fessuran',
        "Quen'pillar", 'Cuersaar', 'Duscar',
      ],
      colorTheme: 'exandria',
    },
  ],
  defaultOverlayKey: 'standard',
  weekdayProgressionMode: 'continuous_serial',
  intercalaryRenderMode: 'regular_grid',
  dateFormatStyle: 'ordinal_of_month',

  moonOverlays: { anchorStrategy: 'seed_only', label: 'Moons of Exandria' },
  moonLore: {
    catha: "Catha is Exandria's primary moon, associated with the Moonweaver, Sehanine. Its cycle drifts between 29 and 39 days.",
    ruidus: 'Ruidus is a small reddish-purple moon shrouded in mystery. It appears full when visible and is considered an ill omen. Its true nature is connected to Predathos.',
  },
  moonVisibility: { ruidus: 'visible_window' },

  seasons: [
    {
      key: 'exandria',
      names: [
        'Winter', 'Winter', 'Spring', 'Spring', 'Summer',
        'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter',
      ],
      hemisphereAware: false,
    },
  ],
  defaultSeasonKey: 'exandria',
  eventPacks: [
    {
      key: 'exandria_holidays', label: 'Exandrian Holidays', events: [
        { name: 'New Dawn', month: 1, day: 1, color: '#FFD700', source: 'exandria' },
        { name: 'Hillsgold', month: 1, day: 27, color: '#DAA520', source: 'exandria' },
        { name: 'Day of Challenging', month: 3, day: 7, color: '#CD5C5C', source: 'exandria' },
        { name: "Harvest's Close", month: 8, day: 3, color: '#F4A261', source: 'exandria' },
        { name: 'Zenith', month: 7, day: 26, color: '#FFD700', source: 'exandria' },
        { name: 'The Crystalheart', month: 11, day: 11, color: '#87CEEB', source: 'exandria' },
      ],
    },
  ],
  capabilities: { moons: true, planes: false },
  setup: {},
};

const mystaraOverlay: WrapperOverlay = {
  wrapperKey: 'mystara',
  engineId: 'mystara',
  calendarLabel: 'Thyatian Calendar',
  worldLabel: 'Mystara',
  /* NOTE: the engine ships canonical Mystara weekdays
   * (Lunadain/Gromdain/Tserdain/Moldain/Nytdain/Soladain/Loshdain). The
   * legacy wrapper had a typo (two Moldain) — we accept the engine
   * canon and update abbreviations accordingly. */
  weekdayAbbr: {
    Lunadain: 'Lun', Gromdain: 'Gro', Tserdain: 'Tse',
    Moldain: 'Mol', Nytdain: 'Nyt', Soladain: 'Sol', Loshdain: 'Los',
  },
  intercalarySlots: [],
  namingOverlays: [
    {
      key: 'standard',
      label: 'Thyatian',
      monthNames: [
        'Nuwmont', 'Vatermont', 'Thaumont', 'Flaurmont',
        'Yarthmont', 'Klarmont', 'Felmont', 'Fyrmont',
        'Ambyrmont', 'Sviftmont', 'Eirmont', 'Kaldmont',
      ],
      colorTheme: 'mystara',
    },
  ],
  defaultOverlayKey: 'standard',
  weekdayProgressionMode: 'continuous_serial',
  intercalaryRenderMode: 'regular_grid',
  dateFormatStyle: 'ordinal_of_month',

  moonOverlays: { anchorStrategy: 'per_moon_anchor', label: 'Moons of Mystara' },
  moonLore: {
    matera: 'Matera is the primary visible moon of Mystara. Its 28-day cycle governs tides and is the basis of the common month.',
    patera: "Patera is the invisible moon of Mystara, home to the Ee'aar. Only visible to those with special sight or powerful magic. Its existence is known to few.",
  },
  moonVisibility: { patera: 'hidden_by_default' },

  seasons: [
    {
      key: 'mystara',
      names: [
        'Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer',
        'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter',
      ],
      hemisphereAware: false,
    },
  ],
  defaultSeasonKey: 'mystara',
  eventPacks: [
    {
      key: 'mystara_holidays', label: 'Mystaran Holidays', events: [
        { name: 'New Year', month: 1, day: 1, color: '#FFD700', source: 'mystara' },
        { name: 'Vernal Equinox', month: 3, day: 14, color: '#A8E6A3', source: 'mystara' },
        { name: 'Summer Solstice', month: 6, day: 14, color: '#FFD166', source: 'mystara' },
        { name: 'Autumnal Equinox', month: 9, day: 14, color: '#F4A261', source: 'mystara' },
        { name: 'Winter Solstice', month: 12, day: 14, color: '#A8DADC', source: 'mystara' },
      ],
    },
  ],
  capabilities: { moons: true, planes: false },
  setup: {},
};

const birthrightOverlay: WrapperOverlay = {
  wrapperKey: 'birthright',
  engineId: 'birthright',
  calendarLabel: 'Cerilian Calendar',
  worldLabel: 'Aebrynis',
  /* Covers both engine schemes: the legacy weekday set
   * (Firlen…Achlen) and the canon-rework set (Firlen, Relen, Dielen,
   * Varilen, Branlen, Barlen, Mierlen, Taelen). Unmatched keys are
   * harmless — the renderer only looks up names the engine ships. */
  weekdayAbbr: {
    Firlen: 'Fir', Dielen: 'Die', Trielen: 'Tri', Fiaren: 'Fia',
    Quinlen: 'Qui', Seislen: 'Sei', Seplen: 'Sep', Achlen: 'Ach',
    Relen: 'Rel', Varilen: 'Var', Branlen: 'Bra', Barlen: 'Bar',
    Mierlen: 'Mie', Taelen: 'Tae',
  },
  /* Birthright's engine canon is being corrected (the legacy scheme had
   * the wrong month order, non-canon months, and Erntenir/Haelynir demoted
   * to intercalaries; the rework promotes them to months and adds
   * Day of Rebirth / Night of Fire / Veneration of the Sleeping /
   * Eve of the Dead). Structure and month names are DERIVED from the
   * engine so the wrapper tracks whichever scheme the installed engine
   * ships instead of crashing on renamed intercalary keys. */
  deriveIntercalarySlots: true,
  intercalarySlots: [],
  namingOverlays: [
    {
      key: 'standard',
      label: 'Anuirean',
      monthNames: [],
      useEngineMonthNames: true,
      colorTheme: 'birthright',
    },
  ],
  defaultOverlayKey: 'standard',
  schemeProbe: {
    legacyKey: 'erntenir',
    /* Canon rework opens the year at the vernal equinox (Day of Rebirth →
     * Sarimiere 1), so seasons run Spring(0-2) · Summer(3-5) ·
     * Autumn(6-8) · Winter(9-11), matching the engine's season table. */
    canonSeasons: [
      {
        key: 'birthright',
        names: [
          'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer',
          'Autumn', 'Autumn', 'Autumn', 'Winter', 'Winter', 'Winter',
        ],
        hemisphereAware: false,
      },
    ],
    /* The legacy festival pack anchors month indexes into the OLD layout;
     * under the rework those point at the wrong months. Canon festival
     * content arrives via the engine-holiday mirror (separate change). */
    legacyOnlyEventPackKeys: ['birthright_festivals'],
  },
  weekdayProgressionMode: 'continuous_serial',
  intercalaryRenderMode: 'regular_grid',
  dateFormatStyle: 'ordinal_of_month',

  moonOverlays: { anchorStrategy: 'per_moon_anchor', label: 'Moon of Aebrynis' },
  moonLore: {
    aelies: 'Aelies is the single moon of Aebrynis. Its 32-day cycle matches the regular months of the Cerilian calendar.',
  },

  seasons: [
    {
      key: 'birthright',
      names: [
        'Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer',
        'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter',
      ],
      hemisphereAware: false,
    },
  ],
  defaultSeasonKey: 'birthright',
  eventPacks: [
    {
      key: 'birthright_festivals', label: 'Cerilian Festivals', events: [
        { name: 'Erntenir (Harvest Festival)', month: 2, day: 1, color: '#DAA520', source: 'birthright' },
        { name: 'Haelynir (Day of the Sun)', month: 5, day: 1, color: '#FFD700', source: 'birthright' },
        { name: 'Midsummer', month: 8, day: 1, color: '#FF6347', source: 'birthright' },
        { name: 'Midwinter', month: 11, day: 1, color: '#87CEEB', source: 'birthright' },
      ],
    },
  ],
  capabilities: { moons: true, planes: false },
  setup: {},
};

/* ──────────────────────────────────────────────────────────────────────────
 * Registry
 * ──────────────────────────────────────────────────────────────────────── */

export const OVERLAYS: Record<string, WrapperOverlay> = {
  eberron:     eberronOverlay,
  faerunian:   faerunOverlay,
  gregorian:   gregorianOverlay,
  greyhawk:    greyhawkOverlay,
  dragonlance: dragonlanceOverlay,
  exandria:    exandriaOverlay,
  mystara:     mystaraOverlay,
  birthright:  birthrightOverlay,
};

/** Display-order list of wrapper keys for menus and setup. */
export const OVERLAY_ORDER: string[] = [
  'eberron', 'faerunian',
  'greyhawk', 'dragonlance', 'exandria', 'mystara', 'birthright',
  'gregorian',
];
