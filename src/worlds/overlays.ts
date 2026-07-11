/**
 * Roll20 wrapper overlays for engine worlds.
 *
 * The engine ships canonical world data (months, intercalaries, moons,
 * holidays). The Roll20 wrapper needs extra per-world data that the engine
 * does not carry: naming overlays for month aliases, color themes per overlay,
 * default render modes, date format styles, weekday abbreviations, capability
 * flags, and a structural index map that interleaves engine intercalaries
 * into the wrapper's flat `cal.months` array. Event content is NOT hosted
 * here — it is generated from engine `world.holidays` at compose time.
 *
 * Anything that's "canon" — month names, day counts, weekday names, moon
 * data, holiday anchors — comes from the engine. Anything that's Roll20-side
 * presentation lives here.
 */
import type { World } from '@partybuff/calendar-engine/lite';
import type {
  WeekdayProgressionMode,
  IntercalaryRenderMode,
  DateFormatStyle,
  NamingOverlay,
  SeasonDefinition,
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
   *  `seasons`. */
  schemeProbe?: {
    legacyKey: string;
    canonSeasons?: SeasonDefinition[];
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

  /* No eventPacks here by design: the wrapper hosts NO event content.
   * Every event is generated from engine `world.holidays` at compose
   * time (see worlds/index.ts eventPacksFromEngine). */

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
      colorTheme: 'woodland',
    },
    {
      key: 'halfling',
      label: 'Halfling',
      monthNames: [
        'Fang', 'Wind', 'Ash', 'Hunt',
        'Song', 'Dust', 'Claw', 'Blood',
        'Horn', 'Heart', 'Spirit', 'Smoke',
      ],
      colorTheme: 'plains',
    },
    {
      key: 'dwarven',
      label: 'Dwarven',
      monthNames: [
        'Aruk', 'Lurn', 'Ulbar', 'Kharn',
        'Ziir', 'Dwarhuun', 'Jond', 'Sylar',
        'Razagul', 'Thazm', 'Drakhadur', 'Uarth',
      ],
      colorTheme: 'gemstones',
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
  /* Harptos layout: festivals interleaved between the canonical months,
   * DERIVED from the engine's `insertAfter` data. Positions must match the
   * engine exactly — the wrapper serializes dates with its structural order
   * while moon phases re-serialize through the engine's order, so any
   * mismatch makes lunar output discontinuous across the festivals.
   * Engine 0.24.0 canon-corrected two anchors (Highharvestide: after Uktar
   * → after Eleint; Feast of the Moon: after Nightal → after Uktar);
   * deriving keeps the wrapper agreeing with whichever engine version is
   * installed, and the checkInstall migration remaps persisted campaign
   * indexes when the layout shifts. Guarded by test/canon-structure. */
  deriveIntercalarySlots: true,
  intercalarySlots: [],
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
      colorTheme: 'meadow',
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
      colorTheme: 'twilight',
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
      colorTheme: 'pastel',
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
      colorTheme: 'seaglass',
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
      colorTheme: 'harvest',
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
  capabilities: { moons: true, planes: false },
  setup: {},
};

/* Barovia — Ravenloft / Curse of Strahd. Weekless (no weekday cycle): dates
 * are "Nth Night of the Mth Moon" (dateFormatStyle 'nights'). 12 moons × 28
 * days; one moon, full on the 1st of every moon. Primary month names come
 * from the engine ("First Moon" … "Twelfth Moon"); the Slavic proper names
 * are a swappable variant. No seasons (gloom demiplane), no holidays. */
const baroviaOverlay: WrapperOverlay = {
  wrapperKey: 'barovia',
  engineId: 'barovia',
  calendarLabel: 'Barovian Calendar',
  worldLabel: 'Barovia',
  // No weekdays — time is reckoned in nights of the moon, not weekdays.
  weekdayAbbr: {},
  intercalarySlots: [],
  namingOverlays: [
    { key: 'standard', label: 'Moons', monthNames: [], colorTheme: 'lunar', useEngineMonthNames: true },
    {
      key: 'slavic', label: 'Slavic Months', colorTheme: 'lunar',
      // source: community reconstruction (Russian month transliterations).
      monthNames: [
        'Yinvar', 'Fivral', 'Mart', 'Apryl', 'Mai', 'Eyune',
        'Eyule', 'Avgust', 'Sintyavr', 'Octyavr', 'Neyavr', 'Dekavr',
      ],
    },
  ],
  defaultOverlayKey: 'standard',
  weekdayProgressionMode: 'continuous_serial',
  intercalaryRenderMode: 'regular_grid',
  dateFormatStyle: 'nights',
  moonOverlays: { anchorStrategy: 'per_moon_anchor', label: 'The Moon' },
  moonLore: {
    moon:
      'Barovia reckons time in moons rather than months: each moon opens on a ' +
      'full moon and closes on the next, twelve to the year. The overcast sky ' +
      'rarely reveals it, yet its full nights still stir the wolves.',
  },
  seasons: [],
  defaultSeasonKey: '',
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
  barovia:     baroviaOverlay,
  birthright:  birthrightOverlay,
};

/** Display-order list of wrapper keys for menus and setup. */
export const OVERLAY_ORDER: string[] = [
  'eberron', 'faerunian',
  'greyhawk', 'dragonlance', 'exandria', 'mystara', 'barovia', 'birthright',
  'gregorian',
];
