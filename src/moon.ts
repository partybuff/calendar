// Section 20: Moon System
import { moons as engineMoons } from '@partybuff/calendar-engine/lite';
import type { MoonPhase as EngineMoonPhase } from '@partybuff/calendar-engine/lite';
import { CONTRAST_MIN_HEADER, STYLES } from './constants.js';
import { defaults, ensureSettings, getCal, titleCase } from './state.js';
import { _contrast, applyBg } from './color.js';
import { fromSerial, toSerial, todaySerial } from './date-math.js';
import { button, esc } from './rendering.js';
import { _displayMonthDayParts, _legendLine, _menuBox, _serialToDateSpec, _shiftSerialByMonth, dateLabelFromSerial, formalDateLabelFromSerial, parseDatePrefixForAdd } from './ui.js';
import { send, whisper, whisperParts } from './commands.js';
import { _getPlaneData, getPlanarState } from './planes.js';
import { getStructuralArray, getWorld } from './worlds/index.js';
import { getEngineWorld, getEngineWorldId, getMoonOpts, serialToCalendarDate } from './engine-opts.js';

/* ============================================================================
 * SECTION 20) MOON SYSTEM
 * ==========================================================================*/

// ---------------------------------------------------------------------------
// 20a) Moon data
// ---------------------------------------------------------------------------
//
// Wrapper overlay merged on top of the engine's per-world `moons.bodies`.
// The engine supplies name, title, color, associatedMonth, and the cycle
// length. The wrapper adds `plane` (Eberron planar tagging) and serves as
// a fallback for worlds without engine moon data. Per-moon orbital
// constants (diameter, inclination, eccentricity, albedo, epochSeed,
// nodePrecession) and per-moon lore notes lived here historically but
// were never read at runtime — removed in the post-#159 cleanup.

export var MOON_SYSTEMS = {
  eberron: {
    moons: [
      { name:'Zarantyr',  title:'The Storm Moon',     color:'#F5F5FA', associatedMonth:1,  plane:'Kythri',    synodicPeriod:27.32 },
      { name:'Olarune',   title:'The Sentinel Moon',  color:'#FFC68A', associatedMonth:2,  plane:'Lamannia',  synodicPeriod:30.8052 },
      { name:'Therendor', title:"The Healer's Moon",  color:'#D3D3D3', associatedMonth:3,  plane:'Syrania',   synodicPeriod:34.7350 },
      { name:'Eyre',      title:'The Anvil',          color:'#C0C0C0', associatedMonth:4,  plane:'Fernia',    synodicPeriod:39.1661 },
      { name:'Dravago',   title:"The Herder's Moon",  color:'#E6E6FA', associatedMonth:5,  plane:'Risia',     synodicPeriod:44.1625 },
      { name:'Nymm',      title:'The Crown',          color:'#FFD96B', associatedMonth:6,  plane:'Daanvi',    synodicPeriod:49.7962 },
      { name:'Lharvion',  title:'The Eye',            color:'#F5F5F5', associatedMonth:7,  plane:'Xoriat',    synodicPeriod:56.1487 },
      { name:'Barrakas',  title:'The Lantern',        color:'#F0F8FF', associatedMonth:8,  plane:'Irian',     synodicPeriod:63.3115 },
      { name:'Rhaan',     title:'The Book',           color:'#9AC0FF', associatedMonth:9,  plane:'Thelanis',  synodicPeriod:71.3881 },
      { name:'Sypheros',  title:'The Shadow',         color:'#696969', associatedMonth:10, plane:'Mabar',     synodicPeriod:80.4950 },
      { name:'Aryth',     title:'The Gateway',        color:'#FF4500', associatedMonth:11, plane:'Dolurrh',   synodicPeriod:90.7637 },
      { name:'Vult',      title:'The Warding Moon',   color:'#A9A9A9', associatedMonth:12, plane:'Shavarath', synodicPeriod:102.3424 }
    ]
  },

  faerunian: {
    moons: [
      { name:'Selûne', title:'The Moonmaiden', color:'#C8D8F0', associatedMonth:null, synodicPeriod:30.4375 }
    ]
  },

  gregorian: {
    moons: [
      { name:'Luna', title:'The Moon', color:'#DCDCDC', associatedMonth:null, synodicPeriod:29.53059 }
    ]
  },

  greyhawk: {
    moons: [
      { name:'Luna',   title:'The Great Moon', color:'#F5F5DC', associatedMonth:null, synodicPeriod:28 },
      { name:'Celene', title:'The Handmaiden', color:'#B0E0E6', associatedMonth:null, synodicPeriod:91 }
    ]
  },

  dragonlance: {
    moons: [
      { name:'Solinari', title:'The Silver Moon', color:'#E8E8E8', associatedMonth:null, synodicPeriod:36 },
      { name:'Lunitari', title:'The Red Moon',    color:'#CD5C5C', associatedMonth:null, synodicPeriod:28 },
      { name:'Nuitari',  title:'The Black Moon',  color:'#1A1A2E', associatedMonth:null, synodicPeriod:8 }
    ]
  },

  exandria: {
    moons: [
      { name:'Catha',  title:'The Guiding Light', color:'#F0E6D6', associatedMonth:null, synodicPeriod:29 },
      { name:'Ruidus', title:'The Bloody Eye',    color:'#8B0000', associatedMonth:null, synodicPeriod:164 }
    ]
  },

  mystara: {
    moons: [
      { name:'Matera', title:'The Visible Moon',   color:'#F5F5DC', associatedMonth:null, synodicPeriod:28 },
      { name:'Patera', title:'The Invisible Moon', color:'#4A4A6A', associatedMonth:null, synodicPeriod:32 }
    ]
  },

  birthright: {
    moons: [
      { name:'Aelies', title:'The Silver Moon', color:'#C0C0C0', associatedMonth:null, synodicPeriod:32 }
    ]
  }
};

/**
 * Central moon-system accessor.
 * Returns the moon system for the active calendarSystem, or null if the world
 * has no moons defined. Eliminates the old Eberron-fallback pattern.
 */
export function _getMoonSys(sysKeyOverride?){
  var key = sysKeyOverride || ensureSettings().calendarSystem;
  var world = getWorld(String(key || '').toLowerCase());
  if (world && world.moons && Array.isArray(world.moons.bodies) && world.moons.bodies.length){
    var legacy = MOON_SYSTEMS[key] || null;
    var legacyByName = Object.create(null);
    if (legacy && Array.isArray(legacy.moons)){
      legacy.moons.forEach(function(moon){
        legacyByName[moon.name] = moon;
      });
    }
    return {
      moons: world.moons.bodies.map(function(body: any){
        var prior = legacyByName[body.name] || {};
        return Object.assign({}, prior, body, {
          key: body.key || prior.key || String(body.name || '').toLowerCase(),
          name: body.name || prior.name,
          title: body.title || prior.title,
          color: body.color || prior.color,
          associatedMonth: body.associatedMonth == null ? (prior.associatedMonth == null ? null : prior.associatedMonth) : body.associatedMonth,
          synodicPeriod: Number(body.synodicPeriod || body.baseCycleDays || prior.synodicPeriod || 28),
          baseCycleDays: Number(body.baseCycleDays || body.synodicPeriod || prior.synodicPeriod || 28)
        });
      })
    };
  }
  return MOON_SYSTEMS[key] || null;
}

// Dragonlance Night-of-the-Eye and per-moon fixed-anchor resolution
// previously lived here. Both are engine-owned as of PR 2c. Per #198,
// `getMoonOpts()` always returns `{}` — moons are canon-only, with no
// GM-tunable anchors — so the wrapper never resolves or threads anchors
// locally, and no `state.imported` anchor data is read here at all.

// ---------------------------------------------------------------------------
// 20b) State helpers
// ---------------------------------------------------------------------------

// `state.PartyBuffCalendar.moons` (and its `getMoonState()` accessor) was
// removed in the post-#159/#198 cleanup: the engine carries no per-wrapper
// moon state, and the last resident — a `recentHistory.bySerial` chat-
// history cache — was write-only. It was populated on every date change
// but no render path ever read it; the actual moon-icon stamping (Today
// dashboard, Moons panel) always queried `moonPhaseAt` / `_moonPeakPhaseDay`
// live. See CLAUDE.md's persisted-state guidance — Roll20 serializes
// `state.PartyBuffCalendar` as JSON on every write, so a write-only cache
// was pure bloat.

export function _moonHashStr(str){
  // String -> deterministic float 0..1
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h / 4294967296;
}

// Seeded dice roller — deterministic from serial + salt string.
// Returns 1..sides (inclusive). Recognizably D&D: d4, d6, d8, d10, d12, d20, d100.

// ---------------------------------------------------------------------------
// 20c) Constants surfaced to other modules
// ---------------------------------------------------------------------------

// `MOON_PREDICTION_LIMITS.highMaxDays` bounds the engine's `nextEvent`
// horizon scan; the wrapper used to pre-generate two years of phases at
// init, but the engine computes phases closed-form, so this is now
// purely a forecast-lookahead cap. `MOON_PRE_GENERATE_YEARS` is kept as a
// no-op compatibility export — no pre-generation happens any more.
export var MOON_PRE_GENERATE_YEARS = 2;
export var MOON_PREDICTION_LIMITS = {
  lowDays: 2,
  mediumMaxDays: 280,
  highMaxDays: 672
};

// ---------------------------------------------------------------------------
// 20g) Ensure sequences are generated / up to date
// ---------------------------------------------------------------------------

// No-op shim. The legacy wrapper pre-generated a multi-year buffer of
// full/new inflection points per moon and ran festival nudges /
// anti-phase coupling / planar pulls across it; all of that math now
// lives in `@partybuff/calendar-engine` and is computed closed-form
// per phaseOf() call. Callers can keep invoking moonEnsureSequences()
// freely — it's free.
//
// Kept exported because ui.ts / today.ts / commands.ts still call it
// before render to mirror the old "warm the cache" pattern. Removing
// those call sites is a follow-up cleanup; until then this empty body
// satisfies the contract.
export function moonEnsureSequences(_focusSerial?, _horizonExtraDays?){
  return;
}

// ---------------------------------------------------------------------------
// 20h) Phase interpolation & display helpers
// ---------------------------------------------------------------------------

// Resolve a wrapper moon name (e.g. "Olarune") to the engine's lowercase
// moon key (e.g. "olarune"). The engine's `worlds.get(id).moons` array
// is the canonical key→name mapping; we cache one lookup per (world,
// name) pair so the rendering hot path stays cheap.
var _moonKeyByNameCache: { [world: string]: { [name: string]: string } } = {};
function _moonKeyForName(moonName: string): string | null {
  try {
    var world = getEngineWorld();
    var byName = _moonKeyByNameCache[world.id];
    if (!byName){
      byName = Object.create(null);
      for (var i = 0; i < world.moons.length; i++){
        byName[world.moons[i].name] = world.moons[i].key;
      }
      _moonKeyByNameCache[world.id] = byName;
    }
    return byName[moonName] || null;
  } catch (_e){
    return null;
  }
}

// Internal alias kept so external imports of `_moonPhaseAtRaw` (init.ts
// REPL surface, legacy callers) still resolve to the new shim.
export function _moonPhaseAtRaw(moonName, serial){
  return moonPhaseAt(moonName, serial);
}

// Public moonPhaseAt — delegate to the engine.
// Returns the legacy `{illum, waxing}` shape augmented with the engine's
// canonical `label` and inflection flags. `label` IS the engine's verdict —
// callers must read `ph.label` (and map it through `_moonPhaseEmoji` for an
// icon) rather than re-deriving Full/New from `ph.illum` themselves. That
// re-derivation is exactly the bug this shape exists to prevent: see
// `_moonPhaseEmoji` below for the single label→emoji mapping.
export function moonPhaseAt(moonName, serial): any {
  var key = _moonKeyForName(moonName);
  if (!key) return { illum:0.5, waxing:true, label:'New', isFull:false, isNew:false };
  try {
    var worldId = getEngineWorldId();
    var date = serialToCalendarDate(serial);
    var phase: EngineMoonPhase = engineMoons.phaseOf(worldId, key, date, getMoonOpts());
    return {
      illum: phase.illumination,
      waxing: phase.waxing,
      label: phase.label,
      isFull: phase.isFull,
      isNew: phase.isNew,
    };
  } catch (_e){
    return { illum:0.5, waxing:true, label:'New', isFull:false, isNew:false };
  }
}

// Returns the engine's inflection-day verdict for this moon on this serial.
// Returns 'full', 'new', or null. Single-day inflections: no multi-day
// spans regardless of cycle length.
export function _moonPeakPhaseDay(moonName, serial){
  var key = _moonKeyForName(moonName);
  if (!key) return null;
  try {
    var worldId = getEngineWorldId();
    var date = serialToCalendarDate(serial);
    var phase = engineMoons.phaseOf(worldId, key, date, getMoonOpts());
    if (phase.isFull) return 'full';
    if (phase.isNew) return 'new';
    return null;
  } catch (_e){
    return null;
  }
}

// Engine model is inflection-only — every full/new is a single day, so
// "Day X of Y" suffixes don't apply. Kept exported so callers that still
// reference these get a stable no-op return shape during the migration.
export function _moonPhaseSpan(_moonName, _serial){
  return null;
}

export function _moonPhaseSpanSuffix(_moonName, _serial){
  return '';
}

// Look ahead from `serial` for the next inflection day of either type
// in the next `maxDays` days. Returns `{ type:'full'|'new', days:N }`
// for the nearer of the two, or null.
export function _moonNextThresholdEntry(moonName, serial, maxDays){
  maxDays = Math.max(0, maxDays|0);
  if (maxDays <= 0) return null;
  var key = _moonKeyForName(moonName);
  if (!key) return null;
  try {
    var worldId = getEngineWorldId();
    var fromDate = serialToCalendarDate(serial);
    var opts = getMoonOpts();
    var nextFull = engineMoons.nextEvent(worldId, key, fromDate, 'full', maxDays, opts);
    var nextNew  = engineMoons.nextEvent(worldId, key, fromDate, 'new',  maxDays, opts);
    var fullSer = null;
    if (nextFull){
      var wFull = _calendarDateToWrapper(nextFull);
      fullSer = toSerial(wFull.year, wFull.mi, 'day' in nextFull ? nextFull.day : 1);
    }
    var newSer = null;
    if (nextNew){
      var wNew = _calendarDateToWrapper(nextNew);
      newSer = toSerial(wNew.year, wNew.mi, 'day' in nextNew ? nextNew.day : 1);
    }
    var picked: { type: string; ser: number } | null = null;
    if (fullSer != null) picked = { type: 'full', ser: fullSer };
    if (newSer != null && (picked == null || newSer < picked.ser)) picked = { type: 'new', ser: newSer };
    if (!picked) return null;
    var d = picked.ser - serial;
    if (d <= 0) return null;
    return { type: picked.type, days: d };
  } catch (_e){
    return null;
  }
}

// Engine CalendarDate → wrapper (structural-mi, year). Used inside
// _moonNextThresholdEntry / _moonNextEvent so we can return a wrapper
// serial. Reverse of `serialToCalendarDate` (src/engine-opts.ts): that
// function ADDS the structural slot's `yearDelta` when it builds an
// intercalary engine date from a wrapper (year, mi) pair
// (`year: wrapped.year + slot.translation.yearDelta`), so converting an
// engine date back must SUBTRACT that same delta, not pass `date.year`
// through unchanged. `cal.months[i]` (the runtime, mutable array) never
// carries `engineMonthIndex` / `intercalaryKey` — those translation
// fields live only in the world registry's structural-slot cache
// (`getStructuralArray`, src/worlds/index.ts) — so look the match up
// there, not on `getCal().months`.
export function _calendarDateToWrapper(date: any): { mi: number; year: number } {
  var sysKey = String(ensureSettings().calendarSystem || 'eberron');
  var arr = getStructuralArray(sysKey);
  if (arr){
    for (var i = 0; i < arr.length; i++){
      var t = arr[i].translation as any;
      if (date.kind === 'month'){
        if (t.kind === 'month' && t.engineMonthIndex === date.monthIndex) return { mi: i, year: date.year };
      } else {
        if (t.kind === 'intercalary' && t.intercalaryKey === date.intercalaryKey) return { mi: i, year: date.year - t.yearDelta };
      }
    }
  }
  // Fallback: name/index-based structural lookup for older calendar blobs
  // that predate the structural-translation cache. No yearDelta info is
  // available here, so an intercalary slot with a nonzero delta may land
  // a year off on legacy state — the primary lookup above should always
  // hit first on any campaign running off the current world registry.
  var slot = _structuralSlotIndex(sysKey, date);
  return { mi: slot != null ? slot : 0, year: date.year };
}

function _structuralSlotIndex(sysKey: string, date: any): number | null {
  var months = getCal().months;
  // Best-effort name-based match for legacy state blobs.
  if (date.kind === 'month'){
    for (var i = 0; i < months.length; i++){
      var m = months[i] as any;
      if (m.isIntercalary) continue;
      if (m.regularIndex === date.monthIndex) return i;
    }
  } else {
    for (var j = 0; j < months.length; j++){
      var m2 = months[j] as any;
      if (!m2.isIntercalary) continue;
      if ((m2.key || '').toLowerCase() === String(date.intercalaryKey).toLowerCase()) return j;
    }
  }
  void sysKey;
  return null;
}

// Label -> emoji. The ONLY place phase iconography is decided. The
// engine's `MoonPhase.label` (read via `moonPhaseAt(...).label`) is the
// single source of truth for what phase a moon is in -- "Full" / "New"
// land on exactly the engine's one inflection day per cycle, never a day
// early from an illumination threshold. This function does no illum/
// waxing math of its own; it only maps the engine's label string to the
// icon that has always represented it. Every UI call site must derive
// both label and emoji from the SAME `MoonPhase` (i.e. the same
// `moonPhaseAt(...)` call) so the dashboard chip and the Lunar Current
// panel can never disagree for the same moon/day.
//
// Retired: `MOON_FULL_THRESHOLD` / `MOON_NEW_THRESHOLD` (0.98 / 0.02) and
// the `_moonPhaseLabel(illum, waxing)` re-derivation they backed. That
// threshold called a moon "Full" whenever it was >=98% lit -- which, for
// slower-cycle moons especially, lands a day (or several) before the
// engine's actual crossing. Deleted rather than deprecated: keeping it
// around invites a future call site to reach for it again.
export function _moonPhaseEmoji(label){
  switch (label){
    case 'Full':            return '\uD83C\uDF15';  // Full
    case 'Waxing Gibbous':  return '\uD83C\uDF14';  // Waxing Gibbous
    case 'Waning Gibbous':  return '\uD83C\uDF16';  // Waning Gibbous
    case 'First Quarter':   return '\uD83C\uDF13';  // First Quarter
    case 'Last Quarter':    return '\uD83C\uDF17';  // Last Quarter
    case 'Waxing Crescent': return '\uD83C\uDF12';  // Waxing Crescent
    case 'Waning Crescent': return '\uD83C\uDF18';  // Waning Crescent
    case 'New':             return '\uD83C\uDF11';  // New
    default:                return '\uD83C\uDF11';  // fallback (unknown label)
  }
}

export function _moonNextEvent(moonName, serial, type){
  // Returns the wrapper serial of the next inflection of `type` strictly
  // after `serial`, or null if none within MOON_PREDICTION_LIMITS.highMaxDays.
  var key = _moonKeyForName(moonName);
  if (!key) return null;
  try {
    var worldId = getEngineWorldId();
    var fromDate = serialToCalendarDate(serial);
    var horizon = MOON_PREDICTION_LIMITS.highMaxDays;
    var result = engineMoons.nextEvent(worldId, key, fromDate, type, horizon, getMoonOpts());
    if (!result) return null;
    var w = _calendarDateToWrapper(result);
    return toSerial(w.year, w.mi, 'day' in result ? result.day : 1);
  } catch (_e){
    return null;
  }
}

// Returns the wrapper serial of the most recent inflection of `type`
// strictly before `serial`, or null if none within ~2 cycles.
//
// The engine's `nextEvent` is forward-only by design (the synodic-period
// math is closed-form, so any "previous" semantics would be a thin
// wrapper anyway). We scan day-by-day backward up to twice the longest
// supported cycle (Eberron Vult is ~28d; multi-month worlds top out
// well under 70d). Engine `phaseOf` is O(1) per call so this is cheap.
export function _moonLastEvent(moonName, serial, type){
  var key = _moonKeyForName(moonName);
  if (!key) return null;
  var maxLookback = 70;
  for (var d = 1; d <= maxLookback; d++){
    var s = serial - d;
    if (_moonPeakPhaseDay(moonName, s) === type) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 20i) Moon forecast helpers
// ---------------------------------------------------------------------------

// Format a "next event" string. Players and the GM see the same forecast.
export function _moonNextEventStr(moon, today, type, _tier, horizonDays){
  var exact = _moonNextEvent(moon.name, today, type);
  if (exact === null) return null;
  var d = Math.ceil(exact - today);
  if (d <= 0) return null;

  var label = (type === 'full') ? 'Full' : 'New';
  var cap = MOON_PREDICTION_LIMITS.highMaxDays;
  var horizon = parseInt(horizonDays, 10);
  if (!isFinite(horizon) || horizon < 1){
    horizon = 84;
  }
  horizon = Math.min(cap, horizon);
  function inDays(n){
    return (n === 1) ? 'in 1 day' : ('in ' + n + ' days');
  }
  if (d > horizon){
    return label + ': beyond prediction';
  }

  return label + ' ' + inDays(d);
}

// Render a single moon row. Players and the GM see the same content.
export function _moonRowHtml(moon, today, _tier, horizonDays){
  var ph       = moonPhaseAt(moon.name, today);
  var label    = ph.label;
  var emoji    = _moonPhaseEmoji(ph.label);
  var pct      = Math.round(ph.illum * 100);

  // Find next event to display
  var nextFull = _moonNextEventStr(moon, today, 'full', 'high', horizonDays);
  var nextNew  = _moonNextEventStr(moon, today, 'new', 'high', horizonDays);
  var nextStr  = '';

  // Pick the closer event
  var dFull = _moonNextEvent(moon.name, today, 'full');
  var dNew  = _moonNextEvent(moon.name, today, 'new');
  if (dFull !== null && (dNew === null || dFull <= dNew))
    nextStr = nextFull || '';
  else if (dNew !== null)
    nextStr = nextNew || '';

  var dot = '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;'+
            'background:'+esc(moon.color||'#aaa')+';border:1px solid rgba(0,0,0,.3);'+
            'margin-right:3px;vertical-align:middle;"></span>';
  var nameStyle = '';

  // Moon ascendancy: brighter when associated plane is coterminous, dimmer when remote.
  // Lharvion (Xoriat) is never marked "dim" because Xoriat is always remote — there is
  // no baseline vs dim distinction; it only has ascendant (named month) and normal.
  // A moon can be both dim (plane remote) AND ascendant (named month) simultaneously.
  var ascendTag = '';
  var planarTag = '';
  var monthTag = '';
  if (moon.plane && ensureSettings().planesEnabled !== false){
    try {
      var _plSt = getPlanarState(moon.plane, today);
      if (_plSt && _plSt.phase === 'coterminous')
        planarTag = ' <span style="' +
          applyBg('font-size:.75em;padding:0 3px;border-radius:3px;', '#FFE8A3', CONTRAST_MIN_HEADER) +
          '" title="'+esc(moon.plane)+' coterminous">✨ ascendant</span>';
      else if (_plSt && _plSt.phase === 'remote' && moon.name !== 'Lharvion')
        planarTag = ' <span style="opacity:.4;font-size:.75em;" title="'+esc(moon.plane)+' remote">◌ dim</span>';
    } catch(e){ /* planar system not ready */ }
  }
  // Also ascendant during its associated month
  if (moon.associatedMonth){
    try {
      var _curCal = getCal().current;
      if (_curCal && (_curCal.month + 1) === moon.associatedMonth)
        monthTag = ' <span style="' +
          applyBg('font-size:.75em;padding:0 3px;border-radius:3px;', '#FFE8A3', CONTRAST_MIN_HEADER) +
          '">✨ ascendant</span>';
    } catch(e){}
  }
  // Combine: show both if both apply (dim plane + ascendant month)
  ascendTag = planarTag + (monthTag && monthTag !== planarTag ? monthTag : (!planarTag ? monthTag : ''));

  // Phase + illumination + next/secondary event.
  var infoParts = [emoji + ' ' + esc(label) + ' (' + pct + '%)'];

  var result = '<div style="margin:3px 0;line-height:1.4;">'+
    dot+
    '<b style="min-width:82px;display:inline-block;'+nameStyle+'">'+esc(moon.name)+'</b>'+
    '<span style="opacity:.9;">'+infoParts.join('')+'</span>'+
    ascendTag;

  if (nextStr){
    result += '<span style="opacity:.45;font-size:.82em;margin-left:8px;">'+esc(nextStr)+'</span>';
  }

  // Show the secondary event too.
  var secStr = '';
  if (dFull !== null && (dNew === null || dFull <= dNew))
    secStr = nextNew || '';
  else
    secStr = nextFull || '';
  if (secStr){
    result += '<span style="opacity:.35;font-size:.78em;margin-left:6px;">'+esc(secStr)+'</span>';
  }

  result += '</div>';
  return result;
}

// ---------------------------------------------------------------------------
// Single-moon mini-calendar — shows one moon's phases across a month.
// Cells are color-filled with the phase emoji; no dots needed.
// ---------------------------------------------------------------------------

// Phase-to-color mapping for single-moon cells.


export function _moonTodaySummaryHtml(today, _tier, horizonDays){
  var st = ensureSettings();
  var sys = _getMoonSys();
  if (!sys || !sys.moons || !sys.moons.length) return '';
  var horizon = parseInt(horizonDays, 10);
  if (!isFinite(horizon) || horizon < 1){
    horizon = 84;
  }
  var horizonEnd = today + horizon;

  var fullNow = [];
  var newNow = [];
  var best = null;

  for (var i = 0; i < sys.moons.length; i++){
    var moon = sys.moons[i];
    var ph = moonPhaseAt(moon.name, today);
    if (!ph) continue;
    var _pt = _moonPeakPhaseDay(moon.name, today);
    if (_pt === 'full'){
      var _sp = _moonPhaseSpan(moon.name, today);
      fullNow.push(moon.name + ((_sp && _sp.totalDays > 1) ? ' Day ' + _sp.dayNum + '/' + _sp.totalDays : ''));
    }
    if (_pt === 'new'){
      var _sp2 = _moonPhaseSpan(moon.name, today);
      newNow.push(moon.name + ((_sp2 && _sp2.totalDays > 1) ? ' Day ' + _sp2.dayNum + '/' + _sp2.totalDays : ''));
    }

    var fSer = _moonNextEvent(moon.name, today, 'full');
    var nSer = _moonNextEvent(moon.name, today, 'new');
    if (fSer != null && fSer > today && fSer <= horizonEnd && (!best || fSer < best.serial)){
      best = { serial:fSer, moon:moon.name, type:'full', str:_moonNextEventStr(moon, today, 'full', 'high', horizon) };
    }
    if (nSer != null && nSer > today && nSer <= horizonEnd && (!best || nSer < best.serial)){
      best = { serial:nSer, moon:moon.name, type:'new', str:_moonNextEventStr(moon, today, 'new', 'high', horizon) };
    }
  }

  var bits = [];
  if (fullNow.length) bits.push('🌕 Full Moons: ' + fullNow.join(', '));
  if (newNow.length) bits.push('🌑 New Moons: ' + newNow.join(', '));
  if (best){
    bits.push('Next: ' + (best.str || (best.moon + ' ' + titleCase(best.type))));
  }
  if (!bits.length) return '';
  return '<div style="font-size:.8em;opacity:.72;margin:2px 0 6px 0;">'+esc(bits.join(' · '))+'</div>';
}

function _moonCompactStatusLines(today){
  var sys = _getMoonSys();
  if (!sys || !sys.moons || !sys.moons.length) return [];
  var lines = [];
  for (var i = 0; i < sys.moons.length; i++){
    var moon = sys.moons[i];
    var ph = moonPhaseAt(moon.name, today);
    if (!ph) continue;
    var emoji = _moonPhaseEmoji(ph.label);
    var peakType = _moonPeakPhaseDay(moon.name, today);
    if (peakType === 'full'){
      lines.push(emoji + ' <b>' + esc(moon.name) + '</b> is Full' + esc(_moonPhaseSpanSuffix(moon.name, today)));
      continue;
    }
    if (peakType === 'new'){
      lines.push(emoji + ' <b>' + esc(moon.name) + '</b> is New' + esc(_moonPhaseSpanSuffix(moon.name, today)));
      continue;
    }
    var nextEntry = _moonNextThresholdEntry(moon.name, today, 2);
    if (nextEntry){
      lines.push(
        (nextEntry.type === 'full' ? '🌕' : '🌑') +
        ' <b>' + esc(moon.name) + '</b> ' +
        (nextEntry.type === 'full' ? 'Full ' : 'New ') +
        (nextEntry.days === 1 ? 'tomorrow' : 'in 2 days')
      );
    }
  }
  return lines;
}

export function moonSummaryHtml(isGM, serialOverride?){
  var st = ensureSettings();
  if (st.moonsEnabled === false){
    return _menuBox('\uD83C\uDF19 Moon Summary',
      '<div style="opacity:.7;">Moon system is disabled.</div>' +
      (isGM ? '<div style="margin-top:4px;font-size:.85em;">Enable: <code>!cal settings moons on</code></div>' : '')
    );
  }

  var today = isFinite(serialOverride) ? (serialOverride|0) : todaySerial();
  moonEnsureSequences(today, MOON_PREDICTION_LIMITS.highMaxDays);

  // Date already appears in the _menuBox title below; skip repeating it in the body.
  var body = '';

  var notableLines = _moonCompactStatusLines(today);
  if (notableLines.length){
    body += '<div style="font-size:.85em;line-height:1.6;">' + notableLines.join('<br>') + '</div>';
  } else {
    body += '<div style="font-size:.82em;opacity:.55;">No moons at full or new today.</div>';
  }

  body += '<div style="margin-top:6px;">' +
    button('Full View', 'moon') +
  '</div>';

  return _menuBox('\uD83C\uDF19 Moon Summary \u2014 ' + esc(formalDateLabelFromSerial(today)), body);
}

// ---------------------------------------------------------------------------
// 20j) Moon panel HTML
// ---------------------------------------------------------------------------

// GM panel. Players see the same content (no knowledge tiers in Roll20).
// Returns an array of HTML parts to send as separate messages (avoids Roll20 size limits).
export function moonPanelParts(serialOverride?){
  var st = ensureSettings();
  if (st.moonsEnabled === false){
    return [_menuBox('\uD83C\uDF19 Moons',
      '<div style="opacity:.7;">Moon system is disabled.</div>'+
      '<div style="margin-top:4px;font-size:.85em;">Enable: <code>!cal settings moons on</code></div>'
    )];
  }

  var cal = getCal();
  var cur = cal.current;
  var today = isFinite(serialOverride) ? (serialOverride|0) : toSerial(cur.year, cur.month, cur.day_of_the_month);
  moonEnsureSequences(today, MOON_PREDICTION_LIMITS.highMaxDays);
  var dateLabel = dateLabelFromSerial(today);

  var sys = _getMoonSys();
  if (!sys){
    return [_menuBox('\uD83C\uDF19 Moons', '<div style="opacity:.7;">No moon data for this calendar system.</div>')];
  }

  var prevSer = _shiftSerialByMonth(today, -1);
  var nextSer = _shiftSerialByMonth(today, 1);
  var navRow = '<div style="margin:3px 0 6px 0;">'+
    button('◂ Prev Moon','moon on '+_serialToDateSpec(prevSer))+' '+
    button('Next Moon ▸','moon on '+_serialToDateSpec(nextSer))+
    '</div>';

  var parts = [];

  // Text list: nav + today summary + moon rows + ascendant/dim
  {
    var rows = sys.moons.map(function(moon){
      return _moonRowHtml(moon, today, 'high', MOON_PREDICTION_LIMITS.highMaxDays);
    });
    var listSections = [rows.join('')];

    // Ascendant Moons / Dim Moons (Eberron only)
    if (ensureSettings().planesEnabled !== false){
      var ascendantMoons = [];
      var dimMoons = [];
      for (var ai = 0; ai < sys.moons.length; ai++){
        var aMoon = sys.moons[ai];
        if (!aMoon.plane) continue;
        try {
          var plSt = getPlanarState(aMoon.plane, today);
          if (plSt && plSt.phase === 'coterminous') ascendantMoons.push(aMoon.name);
          else if (plSt && plSt.phase === 'remote') dimMoons.push(aMoon.name);
        } catch(ea){}
      }
      for (var ai2 = 0; ai2 < sys.moons.length; ai2++){
        var aMoon2 = sys.moons[ai2];
        if (aMoon2.associatedMonth && (cur.month + 1) === aMoon2.associatedMonth){
          if (ascendantMoons.indexOf(aMoon2.name) < 0) ascendantMoons.push(aMoon2.name);
        }
      }
      if (ascendantMoons.length){
        listSections.push('<div style="font-size:.85em;margin-top:4px;">✨ <b>Ascendant Moons:</b> ' + ascendantMoons.map(esc).join(', ') + '</div>');
      }
      if (dimMoons.length){
        listSections.push('<div style="font-size:.85em;margin-top:2px;opacity:.7;">◌ <b>Dim Moons:</b> ' + dimMoons.map(esc).join(', ') + '</div>');
      }
    }

    var calBody = navRow +
      _moonTodaySummaryHtml(today, 'high', MOON_PREDICTION_LIMITS.highMaxDays) +
      listSections.join('');
    parts.push(_menuBox('🌙 Moons — ' + esc(dateLabel), calBody));
  }

  // GM controls (separate message to stay within Roll20 size limits)
  {
    // Per-moon anchors (Night of the Eye, full/new phase shifts, reseed)
    // are web-app-only — pasted into Roll20 via `!cal token`. Roll20 only
    // exposes the toggle.
    var manageChoices = 'Toggle Moons On/Off,toggle';
    var gmControls = '<div style="margin:4px 0;">' +
      button('Management','moon manage ?{Action|' + manageChoices + '}') +
      '</div>';
    gmControls +=
      '<div style="margin-top:7px;">' + button('⬅️ Back','show') + '</div>';
    parts.push(_menuBox('🌙 GM Controls', gmControls));
  }

  return parts;
}

// Player panel -- same text list as GM, no knowledge tiers in Roll20
export function moonPlayerPanelHtml(serialOverride?){
  var st = ensureSettings();
  if (st.moonsEnabled === false){
    return _menuBox('🌙 Moons', '<div style="opacity:.7;">Moon system is not active.</div>');
  }

  var cal = getCal();
  var cur = cal.current;
  var today = isFinite(serialOverride) ? (serialOverride|0) : toSerial(cur.year, cur.month, cur.day_of_the_month);
  moonEnsureSequences(today, MOON_PREDICTION_LIMITS.highMaxDays);
  var dateLabel = dateLabelFromSerial(today);

  var sys = _getMoonSys();
  if (!sys){
    return _menuBox('🌙 Moons', '<div style="opacity:.7;">No moon data for this calendar system.</div>');
  }

  var prevSer = _shiftSerialByMonth(today, -1);
  var nextSer = _shiftSerialByMonth(today, 1);
  var navRow = '<div style="margin:3px 0 6px 0;">'+
    button('◂ Prev Moon','moon on '+_serialToDateSpec(prevSer))+' '+
    button('Next Moon ▸','moon on '+_serialToDateSpec(nextSer))+
    '</div>';

  var rows = sys.moons.map(function(moon){
    return _moonRowHtml(moon, today, 'high', MOON_PREDICTION_LIMITS.highMaxDays);
  });

  var body = navRow +
    _moonTodaySummaryHtml(today, 'high', MOON_PREDICTION_LIMITS.highMaxDays) +
    rows.join('');

  return _menuBox('🌙 Moons — ' + esc(dateLabel), body);
}

// ---------------------------------------------------------------------------
// 20j) Moon command handler  (!cal moon ...)
// ---------------------------------------------------------------------------

export function _moonParseMoonName(str, sys){
  // Case-insensitive match against moon names
  var s = str.toLowerCase();
  for (var i = 0; i < sys.moons.length; i++){
    if (sys.moons[i].name.toLowerCase() === s) return sys.moons[i].name;
  }
  return null;
}

export function _normDeg(n){
  n = n % 360;
  return (n < 0) ? (n + 360) : n;
}

export function handleMoonCommand(m, args){
  // args[0]='moon', args[1]=subcommand, args[2+]=params
  var sub = String(args[1] || '').toLowerCase();
  var st  = ensureSettings();

  // Temporary compatibility alias. Keep silent for now, then prune once
  // downstream notes/buttons stop pointing at the older branch.
  if (sub === 'phases') sub = 'summary';

  if (sub === 'summary'){
    moonEnsureSequences();
    return whisper(m.who, moonSummaryHtml(playerIsGM(m.playerid)));
  }

  // Anyone can view — Roll20 shows the same info to GM and players.
  if (!sub || sub === 'show'){
    moonEnsureSequences();
    if (playerIsGM(m.playerid)){
      return whisperParts(m.who, moonPanelParts());
    } else {
      return whisper(m.who, moonPlayerPanelHtml());
    }
  }

  // !cal moon on <dateSpec> — inspect moon states on a specific day (GM + players)
  if (sub === 'on' || sub === 'date'){
    var dateToksOn = args.slice(2).map(function(t){ return String(t||'').trim(); }).filter(Boolean);
    var prefOn = parseDatePrefixForAdd(dateToksOn);
    if (!prefOn){
      return whisper(m.who, 'Usage: <code>!cal moon on &lt;dateSpec&gt;</code> (example: <code>!cal moon on Rhaan 14 998</code>)');
    }
    var serialOn = toSerial(prefOn.year, prefOn.mHuman - 1, prefOn.day);
    moonEnsureSequences(serialOn, MOON_PREDICTION_LIMITS.highMaxDays);
    if (playerIsGM(m.playerid)){
      return whisperParts(m.who, moonPanelParts(serialOn));
    }
    return whisper(m.who, moonPlayerPanelHtml(serialOn));
  }

  // Beyond this point, GM-only management. Players fall through to usage help.
  if (!playerIsGM(m.playerid)){
    return whisper(m.who,
      'Moon: <code>!cal moon</code> &nbsp;·&nbsp; <code>!cal moon on &lt;dateSpec&gt;</code>'
    );
  }

  // Management dropdown emits `!cal moon manage <action>`; we forward to
  // the matching subcommand. Only `toggle` survives the engine swap —
  // the `reseed`, `eye`, and `reset` family relied on the wrapper's
  // pre-generated sequence buffer and GM-anchor blob, both deleted in
  // PR 2c. Anchors now flow exclusively through `!cal token`.
  if (sub === 'manage'){
    var manageAction = String(args[2] || '').toLowerCase();
    if (!manageAction){
      return whisper(m.who, 'Moon management: use the dropdown to select an action.');
    }
    return handleMoonCommand(m, ['moon', manageAction].concat(args.slice(3)));
  }

  if (sub === 'toggle'){
    st.moonsEnabled = (st.moonsEnabled === false);
    st._moonsAutoToggle = false;
    return whisperParts(m.who, moonPanelParts());
  }

  whisper(m.who,
    'Moon: <code>!cal moon</code> &nbsp;·&nbsp; ' +
    '<code>!cal moon on &lt;dateSpec&gt;</code>'
  );
}
