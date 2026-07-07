// Sections 2-3: Default State Factory + State & Settings
import { date as engineDate } from '@partybuff/calendar-engine';
import { CALENDAR_SYSTEMS, CONFIG_DEFAULTS, CONFIG_MONTH_LENGTHS, CONFIG_START_DATE } from './config.js';
import { CALENDAR_STRUCTURE_SETS, COLOR_THEMES, DEFAULT_EVENTS, DEFAULT_EVENT_SOURCE_CALENDARS, LABELS, SEASON_SETS, script_name, state_name } from './constants.js';
import { getEngineId, getStructuralSlot, getWorld } from './worlds/index.js';
import { colorsAPI, resolveColor } from './color.js';
import { _invalidateSerialCache } from './date-math.js';
import { DaySpec, Parse } from './parsing.js';
import { compareEvents, currentDefaultKeySet, defaultKeyFor, mergeInNewDefaultEvents } from './events.js';
import { clamp, esc } from './rendering.js';
import { sendToAll, sendToGM } from './messaging.js';
import { _getSeasonLabel, currentDateLabel, sendCurrentDate } from './ui.js';


/* ============================================================================
 * 2) DEFAULT STATE FACTORY
 * ==========================================================================*/

/** Copy the optional year-cadence fields (engine `year_cadence` holidays)
 *  from a source event onto a reconstructed record. Kept lean — the fields
 *  are only present on cadence events (Night of the Eye), so ordinary
 *  records stay two fields smaller in persisted state. */
export function _withCadence(rec, src){
  if (src && src.everyYears){
    rec.everyYears = src.everyYears|0;
    rec.anchorYear = src.anchorYear|0;
  }
  return rec;
}

export function _flattenSources(map){
  var out = [];
  Object.keys(map).forEach(function(src){
    (map[src]||[]).forEach(function(e){
      out.push(_withCadence({
        name: String(e.name||''),
        month: e.month,
        day: e.day,
        color: e.color,
        source: src
      }, e));
    });
  });
  return out;
}

export function _sourceAllowedForCalendar(sourceKey, calendarSystem){
  var src = String(sourceKey || '').toLowerCase();
  var sys = String(calendarSystem || '').toLowerCase();
  var allow = DEFAULT_EVENT_SOURCE_CALENDARS[src];
  if (!allow || !allow.length) return true;
  for (var i = 0; i < allow.length; i++){
    if (String(allow[i] || '').toLowerCase() === sys) return true;
  }
  return false;
}

export var defaults = {
  current: {
    month:              CONFIG_START_DATE.month,
    day_of_the_month:   CONFIG_START_DATE.day_of_the_month,
    day_of_the_week:    CONFIG_START_DATE.day_of_the_week,
    year:               CONFIG_START_DATE.year
  },
  months: CONFIG_MONTH_LENGTHS.slice(),
  events: _flattenSources(DEFAULT_EVENTS)
};

/* ============================================================================
 * 3) STATE & SETTINGS
 * ==========================================================================*/

export function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

function _setupRoot(){
  if (!state[state_name]) state[state_name] = {};
  return state[state_name];
}

function _hasMeaningfulSetupData(root){
  if (!root || typeof root !== 'object') return false;
  if (root.calendar && (
    root.calendar.current ||
    (Array.isArray(root.calendar.months) && root.calendar.months.length) ||
    (Array.isArray(root.calendar.weekdays) && root.calendar.weekdays.length) ||
    (Array.isArray(root.calendar.events) && root.calendar.events.length)
  )) return true;
  if (root.settings && Object.keys(root.settings).length) return true;
  if (root.moons || root.planes) return true;
  if (root.suppressedDefaults && Object.keys(root.suppressedDefaults).length) return true;
  if (root.suppressedSources && Object.keys(root.suppressedSources).length) return true;
  if (root.manualSuppressedSources && Object.keys(root.manualSuppressedSources).length) return true;
  if (root.autoSuppressedSources && Object.keys(root.autoSuppressedSources).length) return true;
  return false;
}

export function ensureSetupState(){
  var root = _setupRoot();
  if (!root.setup || typeof root.setup !== 'object'){
    root.setup = {
      status: _hasMeaningfulSetupData(root) ? 'complete' : 'uninitialized',
      draft: {}
    };
  }
  var setup = root.setup;
  setup.status = String(setup.status || '').toLowerCase();
  if (!/^(uninitialized|dismissed|in_progress|complete)$/.test(setup.status)){
    setup.status = _hasMeaningfulSetupData(root) ? 'complete' : 'uninitialized';
  }
  if (!setup.draft || typeof setup.draft !== 'object') setup.draft = {};
  return setup;
}

export function getSetupState(){
  return ensureSetupState();
}

export function setupIsComplete(){
  return ensureSetupState().status === 'complete';
}

export function getManualSuppressedSources(){
  var root = _setupRoot();
  if (!root.manualSuppressedSources || typeof root.manualSuppressedSources !== 'object'){
    root.manualSuppressedSources = {};
  }
  if (root.suppressedSources && typeof root.suppressedSources === 'object'){
    Object.keys(root.suppressedSources).forEach(function(key){
      if (root.suppressedSources[key]) root.manualSuppressedSources[key] = 1;
    });
    delete root.suppressedSources;
  }
  return root.manualSuppressedSources;
}

export function getAutoSuppressedSources(){
  var root = _setupRoot();
  if (!root.autoSuppressedSources || typeof root.autoSuppressedSources !== 'object'){
    root.autoSuppressedSources = {};
  }
  return root.autoSuppressedSources;
}

export function effectiveSuppressedSources(){
  var out = {};
  var manual = getManualSuppressedSources();
  var auto = getAutoSuppressedSources();
  Object.keys(auto).forEach(function(key){ if (auto[key]) out[key] = 1; });
  Object.keys(manual).forEach(function(key){ if (manual[key]) out[key] = 1; });
  return out;
}

export function sourceSuppressionState(sourceKey){
  var key = String(sourceKey || '').toLowerCase();
  var manual = !!getManualSuppressedSources()[key];
  var auto = !!getAutoSuppressedSources()[key];
  return {
    manual: manual,
    auto: auto,
    effective: manual || auto
  };
}

/* Event source keys are world-prefixed ('eberron:sharn') because engine
 * source names collide across worlds ('historical' ships in five). The
 * prefix is INTERNAL — display and the `!cal source …` command surface
 * use the bare name via sourceDisplayLabel / resolveSourceKeyInput. */
var DEFAULT_EVENT_SOURCE_PRIORITY_BY_SYSTEM = {
  eberron: [
    'eberron:khorvaire', 'eberron:sovereign host', 'eberron:sharn',
    'eberron:dark six', 'eberron:silver flame', 'eberron:stormreach',
  ]
};

/** Bare display name for a (possibly world-prefixed) source key. */
export function sourceDisplayLabel(rawKey){
  var s = String(rawKey || '');
  var i = s.indexOf(':');
  return i >= 0 ? s.slice(i + 1) : s;
}

/** Resolve user input ("Sharn", "dark six") to the internal source key.
 *  Tries the name verbatim first, then prefixed with the active world. */
export function resolveSourceKeyInput(name){
  var key = String(name || '').trim().toLowerCase();
  if (!key) return key;
  if (DEFAULT_EVENT_SOURCE_CALENDARS[key]) return key;
  var sys = String(ensureSettings().calendarSystem || CONFIG_DEFAULTS.calendarSystem).toLowerCase();
  var prefixed = sys + ':' + key;
  if (DEFAULT_EVENT_SOURCE_CALENDARS[prefixed]) return prefixed;
  return key;
}

function _defaultEventSourcePriorityForSystem(calendarSystem){
  var key = String(calendarSystem || CONFIG_DEFAULTS.calendarSystem).toLowerCase();
  return (DEFAULT_EVENT_SOURCE_PRIORITY_BY_SYSTEM[key] || []).slice();
}

function _normalizeEventSourcePriority(priority, calendarSystem){
  var out = [];
  var seen = {};
  (Array.isArray(priority) ? priority : []).forEach(function(sourceKey){
    var key = String(sourceKey || '').trim().toLowerCase();
    if (!key || seen[key]) return;
    out.push(key);
    seen[key] = 1;
  });
  _defaultEventSourcePriorityForSystem(calendarSystem).forEach(function(sourceKey){
    if (seen[sourceKey]) return;
    out.push(sourceKey);
    seen[sourceKey] = 1;
  });
  return out;
}

export function ensureSettings(){
  var root = state[state_name];
  if (!root.settings){
    root.settings = {
      calendarSystem:      CONFIG_DEFAULTS.calendarSystem,
      calendarVariant:     CONFIG_DEFAULTS.calendarVariant,
      seasonVariant:       CONFIG_DEFAULTS.seasonVariant,
      colorTheme:          CONFIG_DEFAULTS.colorTheme,
      groupEventsBySource: false,
      showSourceLabels:    false,
      uiDensity:           CONFIG_DEFAULTS.uiDensity,
      autoButtons:         CONFIG_DEFAULTS.autoButtons,
      eventsEnabled:       CONFIG_DEFAULTS.eventsEnabled,
      planesDisplayMode:   CONFIG_DEFAULTS.planesDisplayMode,
      subsystemVerbosity:  CONFIG_DEFAULTS.subsystemVerbosity,
      eventSourcePriority: _defaultEventSourcePriorityForSystem(CONFIG_DEFAULTS.calendarSystem)
    };
  }
  var s = root.settings;
  // Migration: old format used monthSet/weekdaySet/etc. Convert to new system.
  if (!s.calendarSystem && (s.monthSet || s.weekdaySet)){
    var oldSet = (s.monthSet || '').toLowerCase();
    var sysMap = { druidic:'eberron', halfling:'eberron', dwarven:'eberron',
                   faerunian:'faerunian', gregorian:'gregorian' };
    var varMap = { druidic:'druidic', halfling:'halfling', dwarven:'dwarven',
                   faerunian:'standard', gregorian:'standard' };
    s.calendarSystem  = sysMap[oldSet]  || 'eberron';
    s.calendarVariant = varMap[oldSet]  || 'standard';
    s.seasonVariant   = s.seasonSet || CONFIG_DEFAULTS.seasonVariant;
    if (!s.colorTheme) s.colorTheme = null;
    // Remove old fields to avoid confusion.
    delete s.monthSet; delete s.weekdaySet; delete s.seasonSet;
    delete s.monthLengthSet; delete s.structureSet;
  }
  // Migrate renamed season variants.
  var _svMig = s.seasonVariant;
  if (_svMig === 'northern'){
    var _w = getWorld(s.calendarSystem);
    s.seasonVariant = _w ? _w.defaultSeasonKey : 'eberron';
  } else if (_svMig === 'southern'){
    var _w2 = getWorld(s.calendarSystem);
    s.seasonVariant = _w2 ? _w2.defaultSeasonKey : 'faerun';
    s.hemisphere = 'south';
  } else if (_svMig === 'tropic' || _svMig === 'tropical_monsoon'){
    s.seasonVariant = 'tropical';
  }
  // Backfill for any missing fields.
  if (!s.calendarSystem)      s.calendarSystem      = CONFIG_DEFAULTS.calendarSystem;
  if (!s.calendarVariant)     s.calendarVariant     = CONFIG_DEFAULTS.calendarVariant;
  if (!s.seasonVariant)       s.seasonVariant       = CONFIG_DEFAULTS.seasonVariant;
  if (!s.hemisphere)          s.hemisphere          = CONFIG_DEFAULTS.hemisphere;
  s.eventSourcePriority = _normalizeEventSourcePriority(s.eventSourcePriority, s.calendarSystem || CONFIG_DEFAULTS.calendarSystem);
  if (s.uiDensity !== 'compact' && s.uiDensity !== 'normal') s.uiDensity = CONFIG_DEFAULTS.uiDensity;
  if (s.autoButtons   === undefined) s.autoButtons   = CONFIG_DEFAULTS.autoButtons;
  if (s.eventsEnabled  === undefined) s.eventsEnabled  = CONFIG_DEFAULTS.eventsEnabled;
  if (s.moonsEnabled   === undefined) s.moonsEnabled   = CONFIG_DEFAULTS.moonsEnabled;
  if (s.planesEnabled  === undefined) s.planesEnabled  = CONFIG_DEFAULTS.planesEnabled;
  if (s.offCyclePlanes === undefined) s.offCyclePlanes = CONFIG_DEFAULTS.offCyclePlanes;

  // Auto-toggle subsystems based on world capabilities.
  // The GM can always override manually.
  // Only apply auto-toggle when the setting has never been explicitly touched.
  var _worldCaps = (getWorld(s.calendarSystem) || {}).capabilities;
  if (s._planesAutoToggle !== false){
    var _worldHasPlanes = !!(_worldCaps && _worldCaps.planes);
    if (s.planesEnabled === undefined || s._planesAutoToggle === undefined){
      s.planesEnabled = _worldHasPlanes;
      s._planesAutoToggle = true; // mark as auto-set so manual overrides stick
    }
  }
  if (s._moonsAutoToggle !== false){
    var _worldHasMoons = !!(_worldCaps && _worldCaps.moons);
    if (s.moonsEnabled === undefined || s._moonsAutoToggle === undefined){
      s.moonsEnabled = _worldHasMoons;
      s._moonsAutoToggle = true;
    }
  }
  if (!/^(calendar|list|both)$/.test(String(s.planesDisplayMode || '').toLowerCase()))
    s.planesDisplayMode = CONFIG_DEFAULTS.planesDisplayMode;
  s.subsystemVerbosity = String(s.subsystemVerbosity || CONFIG_DEFAULTS.subsystemVerbosity).toLowerCase();
  if (s.subsystemVerbosity !== 'minimal' && s.subsystemVerbosity !== 'normal')
    s.subsystemVerbosity = CONFIG_DEFAULTS.subsystemVerbosity;
  return s;
}

export function getCal(){ return state[state_name].calendar; }

export function titleCase(s){
  return String(s||'')
    .split(/\s+/).map(function(w){ return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; })
    .join(' ');
}

export function weekLength(){
  var cal = getCal();
  var n = (cal && cal.weekdays && cal.weekdays.length) | 0;
  return n > 0 ? n : 7;
}

export function colorForMonth(mi){
  var st  = ensureSettings();
  var cal = getCal();
  var pal = COLOR_THEMES[effectiveColorTheme()];

  // For intercalary months, find the nearest preceding regular month for theming.
  // This keeps festival days visually anchored to their adjacent month.
  var themeIdx = mi;
  if (cal.months[mi] && cal.months[mi].isIntercalary){
    for (var k = mi - 1; k >= 0; k--){
      if (!cal.months[k].isIntercalary){ themeIdx = k; break; }
    }
  }
  // Use regularIndex to look up the theme color so themes stay consistent
  // regardless of how many intercalary slots exist before this month.
  var m = cal.months[themeIdx];
  var palIdx = (m && typeof m.regularIndex === 'number') ? m.regularIndex : themeIdx;
  var themeCol = pal && pal[palIdx] ? pal[palIdx] : null;
  var monthCol = (cal.months[mi] && cal.months[mi].color) || null;
  return resolveColor(themeCol || monthCol) || '#EEE';
}

// Rebuild the months array from a CALENDAR_STRUCTURE_SETS template,
// populating regular slots with names/lengths from current settings.
// Intercalary slots keep their own names and days.
// Internal helpers — called by applyCalendarSystem and the seasons command.
// These operate directly on cal.months and cal.weekdays.

export function _seasonNames(setName){
  // Returns the names array for a season set key, or null if not found.
  var entry = SEASON_SETS[String(setName||'').toLowerCase()];
  if (!entry) return null;
  return Array.isArray(entry) ? entry : (entry.names || null);
}

export function applySeasonSet(setName){
  var cal   = getCal();
  var entry = SEASON_SETS[String(setName||'').toLowerCase()];
  if (!entry) return false;
  var names = Array.isArray(entry) ? entry : (entry.names || null);
  if (!names) return false;
  var regular = cal.months.filter(function(m){ return !m.isIntercalary; });
  if (names.length !== regular.length) return false;

  // Hemisphere-aware sets (faerun) shift season names by 6 for southern campaigns.
  // Transition-based sets (gregorian) don't need name shifting — _getSeasonLabel
  // picks the right transition array at display time.
  var hem = ensureSettings().hemisphere || CONFIG_DEFAULTS.hemisphere;
  var shift = (entry.hemisphereAware && !entry.transitions && hem === 'south') ? 6 : 0;

  var ri = 0;
  for (var i = 0; i < cal.months.length; i++){
    if (!cal.months[i].isIntercalary){
      cal.months[i].season = names[(ri + shift) % names.length];
      ri++;
    } else if (i > 0){
      cal.months[i].season = cal.months[i-1].season || null;
    }
  }
  return true;
}

export function applyStructureSet(setName){
  if (!setName) return false;
  var template = CALENDAR_STRUCTURE_SETS[String(setName).toLowerCase()];
  if (!template) return false;
  var cal = getCal();
  var st = ensureSettings();
  // Build a baseline lengths array for regular months.
  var sys2 = CALENDAR_SYSTEMS[st.calendarSystem] || {};
  var lengthSet = sys2.monthDays ? sys2.monthDays.slice() : CONFIG_MONTH_LENGTHS.slice();
  // Collect existing regular month names so we can re-apply names after rebuild.
  // (The name set will be re-applied afterward via applyMonthSet.)
  cal.months = template.map(function(slot){
    if (slot.isIntercalary){
      return { name: slot.name, days: slot.days|0, isIntercalary: true,
               leapEvery: slot.leapEvery || null, season: null };
    }
    var ri = slot.regularIndex|0;
    return { name: '', days: (ri < lengthSet.length ? lengthSet[ri] : 28),
             regularIndex: ri, season: null };
  });
  _invalidateSerialCache();
  return true;
}

// Suppress or restore a named default event source without going through the
// !cal source command. Used by applyCalendarSystem for calendar-paired sources.
export function _autoToggleCalendarSource(sourceKey, enable){
  var root = state[state_name];
  var autoSuppressedSources = getAutoSuppressedSources();

  if (enable){
    delete autoSuppressedSources[sourceKey];
    mergeInNewDefaultEvents(getCal());
  } else {
    autoSuppressedSources[sourceKey] = 1;
    var cal = getCal();
    // Build a key set of all default events from the target source,
    // ignoring calendar-system filtering (we're removing the source precisely
    // because it doesn't belong to the current calendar).
    var lim = Math.max(1, cal.months.length);
    var sourceDefaults = {};
    deepClone(defaults.events).forEach(function(de){
      var src = (de.source != null) ? String(de.source).toLowerCase() : null;
      if (src !== sourceKey) return;
      var months = (String(de.month).toLowerCase()==='all')
        ? (function(){ var a=[]; for (var i=1;i<=lim;i++) a.push(i); return a; })()
        : [ clamp(parseInt(de.month,10)||1, 1, lim) ];
      months.forEach(function(m){
        var maxD = cal.months[m-1] ? (cal.months[m-1].days|0) : 28;
        var norm = DaySpec.canonicalForKey(de.day, maxD);
        sourceDefaults[ defaultKeyFor(m, norm, de.name) ] = 1;
      });
    });
    cal.events = cal.events.filter(function(e){
      var src = (e.source != null) ? String(e.source).toLowerCase() : null;
      if (src !== sourceKey) return true;
      var mobj = cal.months[e.month - 1];
      var maxD = mobj ? (mobj.days|0) : 28;
      var norm = DaySpec.canonicalForKey(e.day, maxD);
      var k    = defaultKeyFor(e.month, norm, e.name);
      return !sourceDefaults[k];
    });
  }
}

// Apply a complete calendar system (and variant) in one call.
// This is the single public entry point for switching calendars.
// Season and color-theme can be overridden afterward by the user.
export function applyCalendarSystem(sysKey, varKey?){
  var sys = CALENDAR_SYSTEMS[String(sysKey||'').toLowerCase()];
  if (!sys) return false;

  var vk = String(varKey || sys.defaultVariant || 'standard').toLowerCase();
  var variant = sys.variants && sys.variants[vk];
  if (!variant){
    // Fall back to the first variant if the requested one doesn't exist.
    var first = sys.variants && Object.keys(sys.variants)[0];
    variant = first ? sys.variants[first] : null;
    vk = first || 'standard';
  }
  if (!variant) return false;

  var st = ensureSettings();
  var cal = getCal();

  // --- Structure (intercalary days) -----------------------------------------
  if (sys.structure){
    st.structureSet = sys.structure;
    applyStructureSet(sys.structure);
  } else {
    st.structureSet = null;
    cal.months = sys.monthDays.map(function(d, i){ return { days: d, regularIndex: i }; });
  }

  // --- Month lengths ---------------------------------------------------------
  // Apply directly from system definition (no named set lookup needed).
  var ri = 0;
  for (var i = 0; i < cal.months.length; i++){
    var mo = cal.months[i];
    if (!mo.isIntercalary){
      var idx = (typeof mo.regularIndex === 'number') ? mo.regularIndex : ri;
      if (idx < sys.monthDays.length) mo.days = sys.monthDays[idx];
      ri++;
    }
  }

  // --- Month names ----------------------------------------------------------
  var names = variant.monthNames;
  ri = 0;
  for (var j = 0; j < cal.months.length; j++){
    if (!cal.months[j].isIntercalary) cal.months[j].name = names[ri++] || ('Month '+(ri));
  }

  // --- Weekdays -------------------------------------------------------------
  cal.weekdays = sys.weekdays.slice();

  // --- Seasons (derived, not selectable) ------------------------------------
  // The season *set* is no longer a user optionality — the picker and
  // `!cal seasons` command were retired. Each world's season labels are a
  // fixed, canonical property; always apply the world's default set. The
  // derived season label still shows on the panel (and hemisphere still
  // shifts the gregorian transition table); only the *choice* is gone.
  var _prevSys2 = st.calendarSystem || '';
  var _isNewSys = _prevSys2 !== sysKey;
  st.seasonVariant = sys.defaultSeason || CONFIG_DEFAULTS.seasonVariant;
  applySeasonSet(st.seasonVariant);

  // --- Color theme ----------------------------------------------------------
  // colorForMonth() calls effectiveColorTheme() which reads st.colorTheme
  // (manual override) or falls back to variant.colorTheme automatically.
  // Nothing to do here — just reset the colorsAPI cache so it recomputes.
  colorsAPI.reset();

  // Record in settings before event-source reconciliation.
  var _prevSys = st.calendarSystem || '';
  st.calendarSystem  = sysKey;
  st.calendarVariant = vk;
  st.eventSourcePriority = _normalizeEventSourcePriority(st.eventSourcePriority, sysKey);

  // Auto-toggle subsystems based on world capabilities when switching.
  // Only auto-toggle if the previous toggle was also automatic (not manual).
  var _switchCaps = (getWorld(sysKey) || {}).capabilities;
  if (st._planesAutoToggle !== false){
    st.planesEnabled = !!(_switchCaps && _switchCaps.planes);
    st._planesAutoToggle = true;
  }
  if (st._moonsAutoToggle !== false){
    st.moonsEnabled = !!(_switchCaps && _switchCaps.moons);
    st._moonsAutoToggle = true;
  }

  // Enforce source calendar scopes without overwriting GM manual suppressions.
  Object.keys(DEFAULT_EVENT_SOURCE_CALENDARS).forEach(function(srcKey){
    if (_sourceAllowedForCalendar(srcKey, sysKey)) _autoToggleCalendarSource(srcKey, true);
    else _autoToggleCalendarSource(srcKey, false);
  });

  _invalidateSerialCache();

  // Refresh the era suffix to the active world (DR / CY / AC / PD / MR / CE /
  // YK / …) on every apply, so a reload of a saved non-Eberron world doesn't
  // keep rendering "YK". Sourced from the engine world's eraLabel.
  var _wActive = getWorld(sysKey);
  if (_wActive && _wActive.eraLabel) LABELS.era = _wActive.eraLabel;

  // On a genuine WORLD change, adopt that world's canonical engine default
  // date — otherwise the year stays on the previous world's (e.g. Faerûn
  // would open on 998 instead of 1372 DR, Greyhawk on Needfest instead of
  // Fireseek 1). Gated on _isNewSys so a same-world re-apply (checkInstall
  // reloads, variant swaps) never clobbers the GM's saved date. Token setup,
  // when it existed, called setDate() immediately after — this is the
  // canonical default the calendar always loads a fresh world into.
  if (_isNewSys && _wActive && _wActive.defaultDate){
    cal.current.year             = _wActive.defaultDate.year | 0;
    cal.current.month            = _wActive.defaultDate.month | 0;
    cal.current.day_of_the_month = _wActive.defaultDate.day | 0;
  }

  // Align the weekday anchor with engine canon. Continuous-serial weekday
  // math derives everything from cal.current.day_of_the_week, so anchor it
  // to the engine's weekday for the current date — otherwise ordinal-
  // weekday events ("third monday", "every sul") and the grid header can
  // sit a day off from the web app. month_reset worlds ignore the anchor.
  (function(){
    try {
      var slot = getStructuralSlot(String(sysKey||'').toLowerCase(), cal.current.month|0);
      if (!slot) return;
      var t = slot.translation;
      var mObj = cal.months[cal.current.month|0] || {};
      var dayClamped = Math.max(1, Math.min(cal.current.day_of_the_month|0, mObj.days|0 || 1));
      var ed = (t.kind === 'month')
        ? { kind: 'month', year: cal.current.year|0, monthIndex: t.engineMonthIndex, day: dayClamped }
        : { kind: 'intercalary', year: (cal.current.year|0) + t.yearDelta, intercalaryKey: t.intercalaryKey, day: dayClamped };
      var wd = engineDate.weekdayIndex(getEngineId(String(sysKey||'').toLowerCase()), ed as any);
      if (typeof wd === 'number' && wd >= 0 && wd < cal.weekdays.length){
        cal.current.day_of_the_week = wd;
      }
    } catch (err) {
      /* Engine validation rejects out-of-range dates (e.g. Shieldmeet in a
       * non-leap year mid-transition) — keep the existing anchor. */
    }
  }());
  return true;
}

// Returns the effective color theme key for the current calendar state.
// If the user has manually set a theme (st.colorTheme non-null), that wins.
// Otherwise falls back to the variant default.
export function effectiveColorTheme(){
  var st = ensureSettings();
  if (st.colorTheme && COLOR_THEMES[st.colorTheme]) return st.colorTheme;
  var sys = CALENDAR_SYSTEMS[st.calendarSystem];
  var variant = sys && sys.variants && sys.variants[st.calendarVariant];
  return (variant && variant.colorTheme) || 'lunar';
}

export function checkInstall(){
  if(!state[state_name]) state[state_name] = {};
  ensureSetupState();
  ensureSettings();

  if(!state[state_name].calendar ||
     !Array.isArray(state[state_name].calendar.weekdays) ||
     !Array.isArray(state[state_name].calendar.months)){
    state[state_name].calendar = deepClone(defaults);
  }

  if (!state[state_name].suppressedDefaults) state[state_name].suppressedDefaults = {};
  getManualSuppressedSources();
  getAutoSuppressedSources();

  var cal = state[state_name].calendar;

  if (!Array.isArray(cal.weekdays) || !cal.weekdays.length){
    var st = ensureSettings();
    var sys3 = CALENDAR_SYSTEMS[st.calendarSystem || CONFIG_DEFAULTS.calendarSystem] || CALENDAR_SYSTEMS.eberron;
    cal.weekdays = (sys3.weekdays || []).slice();
  }

  if (!cal.current) cal.current = deepClone(defaults.current);

  if(!Array.isArray(cal.events)){
    var lim = Math.max(1, cal.months.length);
    var out = [];
    deepClone(defaults.events).forEach(function(e){
      var monthsList;
      if (String(e.month).toLowerCase() === 'all') {
        monthsList = []; for (var i=1;i<=lim;i++) monthsList.push(i);
      } else {
        var m = clamp(parseInt(e.month,10)||1, 1, lim);
        monthsList = [m];
      }
      monthsList.forEach(function(m){
        out.push(_withCadence({
          name: String(e.name||''),
          month: m,
          day: e.day,
          year: null,
          color: resolveColor(e.color) || null,
          source: (e.source != null) ? String(e.source) : null
        }, e));
      });
    });
    cal.events = out;
  } else {
    cal.events = cal.events.map(function(e){
      var lim = Math.max(1, cal.months.length);
      var m = clamp(parseInt(e.month,10)||1, 1, lim);
      var yr = (isFinite(parseInt(e.year,10)) ? (parseInt(e.year,10)|0) : null);
      return _withCadence({
        name: String(e.name||''),
        month: m,
        day: e.day,
        year: yr,
        color: resolveColor(e.color) || null,
        source: (e.source != null) ? String(e.source) : null
      }, e);
    });

    // backfill colors from defaults if missing
    var defColorByKey = {};
    var lim2 = Math.max(1, cal.months.length);
    defaults.events.forEach(function(de){
      var col = resolveColor(de.color) || null;
      if (String(de.month).toLowerCase() === 'all') {
        for (var i=1; i<=lim2; i++) defColorByKey[i + '|' + String(de.day)] = col;
      } else {
        var m = clamp(parseInt(de.month,10)||1, 1, lim2);
        defColorByKey[m + '|' + String(de.day)] = col;
      }
    });
    cal.events.forEach(function(e){
      if (!e.color){
        var key = e.month + '|' + String(e.day);
        var col = defColorByKey[key];
        if (col) e.color = col;
      }
    });
  }

  // normalize months (support numbers = days-only) and stamp regularIndex
  for (var i = 0; i < cal.months.length; i++){
    var m = cal.months[i];
    if (typeof m === 'number'){
      cal.months[i] = { days: (m|0) || 28 };
    } else {
      cal.months[i] = cal.months[i] || {};
      if (!cal.months[i].days) cal.months[i].days = 28;
    }
    // Backfill regularIndex for non-intercalary months so length sets work.
    if (!cal.months[i].isIntercalary && typeof cal.months[i].regularIndex !== 'number'){
      cal.months[i].regularIndex = i;
    }
  }

  // Apply the active calendar system (rebuilds months, weekdays, seasons, names).
  var s = ensureSettings();
  applyCalendarSystem(s.calendarSystem || CONFIG_DEFAULTS.calendarSystem,
                      s.calendarVariant || CONFIG_DEFAULTS.calendarVariant);

  mergeInNewDefaultEvents(cal);
  _invalidateSerialCache();

  // clamp current date within the month it landed on
  var mdays = cal.months[cal.current.month].days;
  if (cal.current.day_of_the_month > mdays){
    cal.current.day_of_the_month = mdays;
  }

  // ── CONFIG sanity checks ───────────────────────────────────────────
  // Warn if user-editable arrays have mismatched lengths.
  (function(){
    var warnings = [];
    var sys = CALENDAR_SYSTEMS[s.calendarSystem || CONFIG_DEFAULTS.calendarSystem];
    if (sys){
      var vk = s.calendarVariant || sys.defaultVariant || 'standard';
      var variant = sys.variants && sys.variants[vk];
      if (variant && variant.monthNames && sys.monthDays &&
          variant.monthNames.length !== sys.monthDays.length){
        warnings.push('Month names ('+variant.monthNames.length+') vs month days ('+sys.monthDays.length+') mismatch in calendar system "'+
          (s.calendarSystem||CONFIG_DEFAULTS.calendarSystem)+'" variant "'+vk+'".');
      }
    }
    if (CONFIG_MONTH_LENGTHS.length !== cal.months.length){
      warnings.push('CONFIG_MONTH_LENGTHS ('+CONFIG_MONTH_LENGTHS.length+') does not match active calendar month count ('+cal.months.length+').');
    }
    for (var w=0; w<warnings.length; w++){
      log('[Galifar Calendar] ⚠ CONFIG WARNING: '+warnings[w]);
    }
  }());
}

export function refreshCalendarState(silent){
  checkInstall();
  var cal = getCal();

  cal.events = (cal.events || []).map(function(e){
    var m = clamp(e.month, 1, cal.months.length);
    var ow = Parse.ordinalWeekday.fromSpec(e.day);
    var daySpec = ow
      ? String(e.day).toLowerCase().trim()
      : (DaySpec.normalize(e.day, cal.months[m-1].days) || String(DaySpec.first(e.day)));
    var yr = (e.year==null) ? null : (parseInt(e.year,10)|0);
    return _withCadence({
      name: String(e.name||''),
      month: m,
      day: daySpec,
      year: yr,
      color: resolveColor(e.color) || null,
      source: (e.source != null) ? String(e.source) : null
    }, e);
  });

  // deduplicate
  var seen = {};
  cal.events = cal.events.filter(function(e){
    var y = (e.year==null) ? 'ALL' : (e.year|0);
    var k = e.month+'|'+e.day+'|'+y+'|'+String(e.name||'').trim().toLowerCase();
    if (seen[k]) return false; seen[k]=true; return true;
  });

  cal.events.sort(compareEvents);

  if (!silent) sendChat(script_name, '/w gm Calendar state refreshed ('+cal.events.length+' events).', null, { noarchive: true });
}

export function refreshAndSend(){
  refreshCalendarState(true);
  sendCurrentDate(null, true);
}

function _worldDateLabel(){
  var s = state[state_name] && state[state_name].settings;
  var sysKey = (s && s.calendarSystem) || CONFIG_DEFAULTS.calendarSystem;
  var sys = CALENDAR_SYSTEMS[sysKey] || CALENDAR_SYSTEMS.eberron;
  var world = (sys && (sys.worldLabel || sys.label)) || sysKey;
  return world + ', ' + currentDateLabel();
}

export function resetToDefaults(){
  // Snapshot the live "World, Date" line before wiping so the chat-history
  // anchor can show the old date alongside the new one. If state was already
  // empty (no calendar present), oldLabel stays null and we omit the "Was:"
  // half rather than emit something misleading.
  var oldLabel = null;
  try {
    var cal = state[state_name] && state[state_name].calendar;
    if (cal && cal.current && Array.isArray(cal.months) && cal.months.length){
      oldLabel = _worldDateLabel();
    }
  } catch (_e){ oldLabel = null; }

  // Wipe and rehydrate to campaign defaults so the post-reset state is
  // immediately usable AND the "Now: <default>" line in the announcement
  // reflects actual state. The setup wizard still fires on next !cal
  // (status stays 'uninitialized') so a GM who wants a different world
  // or starting date gets the guided path.
  delete state[state_name];
  state[state_name] = {};
  checkInstall();
  var newLabel = _worldDateLabel();

  // Public, archived: this is the in-game timestamp anchor the GM scrolls
  // back to months later. Single line, no buttons (/direct strips them).
  var publicLine =
    '<b>📅 Calendar reset.</b><br>' +
    (oldLabel ? 'Was: <i>' + esc(oldLabel) + '</i><br>' : '') +
    'Now: <i>' + esc(newLabel) + '</i> (campaign default).';
  sendToAll(publicLine);

  // GM-only operational ack (not archived).
  sendToGM('Calendar state wiped and reset to <i>' + esc(newLabel) +
           '</i>. Use <code>!cal</code> to reconfigure or accept the defaults.');
}
