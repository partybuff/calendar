// Initialization + Test Exports
import { CALENDAR_SYSTEMS, CONFIG_DEFAULTS } from './config.js';
import { CALENDAR_STRUCTURE_SETS, SEASON_SETS, script_name, state_name } from './constants.js';
import { applyCalendarSystem, applySeasonSet, checkInstall, colorForMonth, deepClone, ensureSettings, getCal, refreshCalendarState, titleCase, weekLength } from './state.js';
import { _contrast, _relLum, _stableHash, colorsAPI, resolveColor, sanitizeHexColor, textColor } from './color.js';
import { _daysBeforeMonthInYear, _daysBeforeYear, _invalidateSerialCache, _isGregorianLeapYear, _leapsBefore, daysPerYear, fromSerial, toSerial, todaySerial, weekStartSerial, weekdayIndex } from './date-math.js';
import { monthIndexByName } from './parsing.js';
import { compareEvents, eventKey, eventsAPI, getEventColor, getEventsFor, isDefaultEvent, renderAPI } from './events.js';
import { _ordinal, clamp, esc, formatDateLabel } from './rendering.js';
import { _displayMonthDayParts, currentDateLabel, setDate, stepDays } from './ui.js';
import { _todayAllHtml } from './today.js';
import { notifySetupStatusOnReady } from './setup.js';
import { register } from './boot-register.js';
import { MOON_SYSTEMS, _moonHashStr, moonEnsureSequences, moonPhaseAt } from './moon.js';


/* ============================================================================
 * INITIALIZATION
 * ==========================================================================*/

on("ready", function(){
  checkInstall();
  refreshCalendarState(true);
  register();
  var currentDate = currentDateLabel();
  var stReady = ensureSettings();
  var sysReady = CALENDAR_SYSTEMS[stReady.calendarSystem] || {};
  var sysLabelReady = String(sysReady.label || 'Calendar');
  log(sysLabelReady + ' Running, current date: ' + currentDate);
  notifySetupStatusOnReady();
});


export var _public: Record<string, any> = {
  checkInstall: checkInstall,
  register: register,
  render: renderAPI,
  events: eventsAPI,
  colors: colorsAPI
};

// ── Test-only exports ─────────────────────────────────────────────────────
// When __CALENDAR_TEST_MODE__ is set (by test/roll20-shim.js), expose
// internal functions so tests can exercise core logic directly.
if (typeof globalThis !== 'undefined' && (globalThis as any).__CALENDAR_TEST_MODE__) {
  (_public as any)._test = {
    // date / serial math
    toSerial:            toSerial,
    fromSerial:          fromSerial,
    weekdayIndex:        weekdayIndex,
    daysPerYear:         daysPerYear,
    _daysBeforeYear:     _daysBeforeYear,
    _daysBeforeMonthInYear: _daysBeforeMonthInYear,
    _isGregorianLeapYear: _isGregorianLeapYear,
    _leapsBefore:        _leapsBefore,
    _invalidateSerialCache: _invalidateSerialCache,
    todaySerial:         todaySerial,

    // state helpers
    getCal:              getCal,
    ensureSettings:      ensureSettings,
    deepClone:           deepClone,
    checkInstall:        checkInstall,
    refreshCalendarState: refreshCalendarState,

    // calendar systems
    CALENDAR_SYSTEMS:    CALENDAR_SYSTEMS,
    applyCalendarSystem: applyCalendarSystem,
    applySeasonSet:      applySeasonSet,

    // date navigation
    stepDays:            stepDays,
    setDate:             setDate,
    currentDateLabel:    currentDateLabel,
    formatDateLabel:     formatDateLabel,
    monthIndexByName:    monthIndexByName,

    // events
    getEventsFor:        getEventsFor,
    eventKey:            eventKey,
    compareEvents:       compareEvents,
    getEventColor:       getEventColor,
    isDefaultEvent:      isDefaultEvent,

    // utilities
    _stableHash:         _stableHash,
    clamp:               clamp,
    esc:                 esc,
    titleCase:           titleCase,
    sanitizeHexColor:    sanitizeHexColor,
    resolveColor:        resolveColor,
    textColor:           textColor,
    _relLum:             _relLum,
    _contrast:           _contrast,
    weekLength:          weekLength,
    colorForMonth:       colorForMonth,

    // moons
    _moonHashStr:        _moonHashStr,
    moonPhaseAt:         moonPhaseAt,
    moonEnsureSequences: moonEnsureSequences,
    MOON_SYSTEMS:        MOON_SYSTEMS,

    // today-view helpers
    _todayAllHtml:          _todayAllHtml,

    // harptos
    weekStartSerial:         weekStartSerial,
    _ordinal:                _ordinal,
    _displayMonthDayParts:   _displayMonthDayParts,
    CALENDAR_STRUCTURE_SETS: CALENDAR_STRUCTURE_SETS,

    // constants
    state_name:          state_name,
    CONFIG_DEFAULTS:     CONFIG_DEFAULTS,
    SEASON_SETS:         SEASON_SETS,
  };
}
