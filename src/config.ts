/* ============================================================================
 * ★ USER CONFIGURATION ★
 *
 * The Roll20 wrapper now consumes canonical world data from
 * `@partybuff/calendar-engine` (see `src/worlds/`). The constants in this
 * file are the Roll20-side defaults and presentation glue — anything that
 * was canonical month / weekday / moon data has moved into the engine.
 * ==========================================================================*/

import { WORLDS, WORLD_ORDER, getStructuralArray } from './worlds/index.js';

/* --- Era label ------------------------------------------------------------*/
// Appended after the year number everywhere it appears, e.g. "998 YK".
// Default mirrors the default world's era label; users can override the
// runtime era via the wizard. Left as Eberron's "YK" for backwards
// compatibility with serialized state.
export var CONFIG_ERA_LABEL = 'YK';

/* --- Starting Date --------------------------------------------------------*/
// Boot defaults for `state.PartyBuffCalendar.calendar.current`. The setup
// wizard normally replaces these on first install. month is 0-based.
const _eberronDefault = WORLDS.eberron && WORLDS.eberron.defaultDate;
export var CONFIG_START_DATE = {
  month:            _eberronDefault ? _eberronDefault.month : 0,
  day_of_the_month: _eberronDefault ? _eberronDefault.day   : 1,
  day_of_the_week:  0,
  year:             _eberronDefault ? _eberronDefault.year  : 998,
};

/* --- Default month lengths ------------------------------------------------*/
// The wrapper still ships a 12×28 baseline so a brand-new install has
// something coherent until `applyCalendarSystem` rebuilds the structure.
// Derived from the default world's engine month days.
const _eberronStructural = getStructuralArray('eberron') || [];
export var CONFIG_MONTH_LENGTHS: number[] = (function(){
  const out: number[] = [];
  for (const s of _eberronStructural) if (!s.isIntercalary) out.push(s.days);
  if (out.length) return out;
  // Defensive fallback if the engine lookup failed for some reason.
  return [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
}());

/* --- Default settings -----------------------------------------------------*/
// Applied on first install and after a full reset (!cal resetcalendar).
// These are the starting-point choices for name sets, seasons, and color theme.
// All are changeable live via !cal calendar / !cal seasons / !cal theme.
export var CONFIG_DEFAULTS: Record<string, any> = {
  calendarSystem:    'eberron',
  calendarVariant:   'standard',
  seasonVariant:     'eberron',
  hemisphere:        'north',
  colorTheme:        null,
  moonsEnabled:      true,
  planesEnabled:     true,
  planesDisplayMode: 'calendar',
  uiDensity:         'normal',
  autoButtons:       false,
};

/* --- Calendar systems (legacy presentation glue) --------------------------*/
//
// Historically this object carried the full per-system data (month names,
// weekdays, etc.). The wrapper now derives that information from the engine
// via `src/worlds/`. We keep the shape so the many call sites that read
// `CALENDAR_SYSTEMS[sysKey].monthDays` etc. continue to work, but the data
// itself is composed lazily from `WORLDS`.

function _systemFromWorld(sysKey: string){
  const w = WORLDS[sysKey];
  if (!w) return null;
  const variants: Record<string, any> = {};
  w.calendar.namingOverlays.forEach(function(overlay){
    variants[overlay.key] = {
      label:       (overlay.label && overlay.label !== sysKey)
        ? overlay.label + (overlay.key === 'standard' && w.calendar.label ? '' : '')
        : (w.calendar.label || overlay.label),
      description: '',
      monthNames:  overlay.monthNames.slice(),
      colorTheme:  overlay.colorTheme,
    };
  });
  /* Provide a system-level label that matches the wrapper's previous one
   * ("Galifar Calendar", "Harptos Calendar", etc.) on the default variant. */
  const defaultVariant = variants[w.calendar.defaultOverlayKey] || variants[Object.keys(variants)[0] || 'standard'];
  if (defaultVariant && !defaultVariant.label) defaultVariant.label = w.calendar.label;
  return {
    label:          w.label,
    worldLabel:     (w as any).worldLabel || w.label,
    continentLabel: (w as any).continentLabel || undefined,
    description:    w.description,
    weekdays:       w.calendar.weekdays.slice(),
    weekdayAbbr:    w.calendar.weekdayAbbr,
    monthDays:      w.calendar.monthDays.slice(),
    /* `structure` is the lookup key into CALENDAR_STRUCTURE_SETS.
     * Worlds without intercalaries return null here so applyCalendarSystem
     * takes the fast path that builds months directly from monthDays. */
    structure:      (w.calendar.structure || []).some(function(s){ return s.isIntercalary; }) ? sysKey : null,
    defaultSeason:  w.defaultSeasonKey,
    defaultVariant: w.calendar.defaultOverlayKey,
    variants,
  };
}

export var CALENDAR_SYSTEMS: Record<string, any> = (function(){
  const out: Record<string, any> = {};
  for (const key of WORLD_ORDER){
    const sys = _systemFromWorld(key);
    if (sys) out[key] = sys;
  }
  /* Patch in the wrapper-side `worldLabel` / `continentLabel` that the
   * setup wizard reads — these aren't on WorldDefinition itself; the
   * overlays carry them. We pull from OVERLAYS here without importing it
   * directly to keep this module's import surface small. */
  // Eberron / Faerûn / etc. have specific labels — derive from world.label.
  // The overlay file is the single source of truth; we mirror the well-known
  // strings here for the setup wizard's "default calendar of X, on Y" prose.
  const labels: Record<string, { worldLabel?: string; continentLabel?: string; description?: string }> = {
    eberron:     { worldLabel: 'Eberron',    continentLabel: 'Khorvaire',
                   description: 'Campaign setting with 12 months of 28 days and a 7-day week.' },
    faerunian:   { worldLabel: 'Toril',      continentLabel: 'Faerun',
                   description: 'Campaign setting using the Harptos calendar on Faerun.' },
    gregorian:   { worldLabel: 'Earth',
                   description: 'Earth setting using the Gregorian calendar.' },
    greyhawk:    { worldLabel: 'Oerth',
                   description: '12 months of 28 days with 4 intercalary festival weeks. 7-day week. Common Year reckoning.' },
    dragonlance: { worldLabel: 'Krynn',
                   description: '12 months of 28 days (336-day year). 7-day week. Three moons govern magic.' },
    exandria:    { worldLabel: 'Exandria',
                   description: '11 months of 29-32 days (328-day year). 7-day week. Exandrian calendar from Critical Role.' },
    mystara:     { worldLabel: 'Mystara',
                   description: '12 months of 28 days (336-day year). 7-day week. Known World / BECMI setting.' },
    barovia:     { worldLabel: 'Barovia' },
    birthright:  { worldLabel: 'Aebrynis',
                   description: '12 months of 32 days plus 4 festival days (388-day year). 8-day week. Deismaar reckoning.' },
  };
  for (const k of Object.keys(out)){
    const meta = labels[k]; if (!meta) continue;
    if (meta.worldLabel)     out[k].worldLabel = meta.worldLabel;
    if (meta.continentLabel) out[k].continentLabel = meta.continentLabel;
    if (meta.description)    out[k].description = meta.description;
  }
  /* Hand-tuned variant descriptions and system-level labels that the wrapper
   * historically surfaced verbatim in the setup wizard. */
  if (out.eberron) {
    if (out.eberron.variants.standard) {
      out.eberron.variants.standard.label = 'Galifar Calendar';
      out.eberron.variants.standard.description = 'The default civil calendar of Khorvaire, on Eberron.';
    }
    if (out.eberron.variants.druidic)  { out.eberron.variants.druidic.label = 'Druidic Calendar';   out.eberron.variants.druidic.description  = 'A druidic month-name variant.'; }
    if (out.eberron.variants.halfling) { out.eberron.variants.halfling.label = 'Halfling Calendar'; out.eberron.variants.halfling.description = 'A halfling month-name variant.'; }
    if (out.eberron.variants.dwarven)  { out.eberron.variants.dwarven.label = 'Dwarven Calendar';   out.eberron.variants.dwarven.description  = 'A dwarven month-name variant.'; }
  }
  if (out.faerunian && out.faerunian.variants.standard) {
    out.faerunian.variants.standard.label = 'Harptos Calendar';
    out.faerunian.variants.standard.description = 'The default calendar of Faerun, on Toril, in the Forgotten Realms.';
  }
  if (out.gregorian && out.gregorian.variants.standard) {
    out.gregorian.variants.standard.label = 'Gregorian Calendar';
    out.gregorian.variants.standard.description = 'The standard civil calendar used on Earth.';
  }
  if (out.greyhawk && out.greyhawk.variants.standard) {
    out.greyhawk.variants.standard.label = 'Dozenmonth of Luna';
    out.greyhawk.variants.standard.description = 'The common Oerthian calendar with 12 months and 4 festival weeks.';
  }
  if (out.dragonlance && out.dragonlance.variants.standard) {
    out.dragonlance.variants.standard.label = 'Krynnish Calendar';
    out.dragonlance.variants.standard.description = 'The Solamnic calendar of Krynn, with seasonal month names.';
  }
  if (out.exandria && out.exandria.variants.standard) {
    out.exandria.variants.standard.label = 'Exandrian Calendar';
    out.exandria.variants.standard.description = 'The standard calendar of Exandria from Critical Role.';
  }
  if (out.mystara && out.mystara.variants.standard) {
    out.mystara.variants.standard.label = 'Thyatian Calendar';
    out.mystara.variants.standard.description = 'The Thyatian calendar used across the Known World of Mystara.';
  }
  if (out.birthright && out.birthright.variants.standard) {
    out.birthright.variants.standard.label = 'Cerilian Calendar';
    out.birthright.variants.standard.description = 'The Anuirean calendar of Cerilia, on Aebrynis.';
  }
  return out;
}());

export var CALENDAR_SYSTEM_ORDER: string[] = WORLD_ORDER.slice();

/* --- Display tuning -------------------------------------------------------*/
// How many days before/after the displayed month boundary trigger an adjacent
// strip of context days. 0 = no strip ever. 7 = always show a full border row.
export var CONFIG_NEARBY_DAYS = 5;
