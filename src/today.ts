// Today — Combined detail from all subsystems
import { CALENDAR_SYSTEMS, CONFIG_DEFAULTS } from './config.js';
import { COLOR_THEMES, SEASON_SETS, STYLES, script_name, state_name } from './constants.js';
import { _sourceAllowedForCalendar, applyCalendarSystem, applySeasonSet, defaults, ensureSettings, getAutoSuppressedSources, getCal, refreshAndSend, refreshCalendarState, resetToDefaults, resolveSourceKeyInput, sourceDisplayLabel, sourceSuppressionState, titleCase, weekLength } from './state.js';
import { handleTokenCommand } from './token.js';
import { colorsAPI } from './color.js';
import { _invalidateSerialCache, _isLeapMonth, fromSerial, toSerial, todaySerial } from './date-math.js';
import { DaySpec, Parse } from './parsing.js';
import { _deliverAdditionalCalendarRange, _deliverTopLevelCalendarRange, buildAdditionalRangesCommand, buildCalendarsHtmlForSpec, defaultKeyFor, eventDisplayName, getEventColor, mergeInNewDefaultEvents, occurrencesInRange } from './events.js';
import { button, clamp, esc, eventLineHtml, _monthRangeFromSerial } from './rendering.js';
import { _displayMonthDayParts, _menuBox, _serialToDateSpec, _shiftSerialByMonth, additionalHubHtml, calendarSystemListHtml, currentDateLabel, dateLabelFromSerial, formalCurrentDateLabel, helpCalendarSystemMenu, helpEventColorsMenu, helpRootMenu, helpThemesMenu, nextForDayOnly, sendCurrentDate, setDate, stepDays, taskCardHtml, themeListHtml } from './ui.js';
import { _normalizePackedWords, _playerTodayHtml, _showDefaultCalView, send, whisper, whisperUi } from './commands.js';
import { _getMoonSys, _moonLastEvent, _moonNextEvent, _moonPeakPhaseDay, _moonPhaseEmoji, _moonPhaseLabel, handleMoonCommand, invalidateMoonModel, moonEnsureSequences, moonPhaseAt } from './moon.js';
import { getPlanarState, _getAllPlaneData, _getPlaneData, handlePlanesCommand } from './planes.js';
import { enginePlanes, getPlanePositions, serialToCalendarDate } from './engine-opts.js';
import { engineEventDescription } from './worlds/index.js';


// ── Today — Combined detail from all subsystems ────────────────────────

function _todayEventSummaryHtml(serial){
  try {
    var occ = occurrencesInRange(serial, serial);
    if (!occ.length){
      return '<div style="font-size:.82em;opacity:.6;margin-top:2px;">📅 No calendar events today.</div>';
    }
    var seenNames = {};
    var names = [];
    for (var oi = 0; oi < occ.length; oi++){
      var nm = eventDisplayName(occ[oi].e);
      var keyNm = String(nm || '').toLowerCase();
      if (!seenNames[keyNm]){
        seenNames[keyNm] = 1;
        names.push(nm);
      }
    }
    var shown = names.slice(0, 3).map(esc).join(', ');
    var more = names.length > 3 ? (' <span style="opacity:.65;">+' + (names.length - 3) + ' more</span>') : '';
    return '<div style="font-size:.82em;opacity:.75;margin-top:2px;">🎉 ' + shown + more + '</div>';
  } catch(eOcc){
    return '';
  }
}

export function _todayAllHtml(){
  var st = ensureSettings();
  var today = todaySerial();
  var cal = getCal(), c = cal.current;
  var lines = [];
  var sp = '<div style="height:6px;"></div>';

  // ── Minical (Events minical) ───────────────────────────────────────────
  try {
    var mr = _monthRangeFromSerial(today);
    var miniCalHtml = buildCalendarsHtmlForSpec({
      start: mr.start, end: mr.end,
      months: [{ y: mr.year, mi: mr.mi }],
      title: cal.months[mr.mi].name + ' ' + mr.year
    });
    lines.push(miniCalHtml);
  } catch(eMini){}

  // ── Text Info ──────────────────────────────────────────────────────────
  // Current Date
  lines.push('<div style="font-weight:bold;margin:3px 0;">' + esc(formalCurrentDateLabel()) + '</div>');

  lines.push(sp);

  // Events/Holidays
  var occNow = [];
  try { occNow = occurrencesInRange(today, today); } catch(e3){}
  var eventNames = [];
  var eventSeen = {};
  for (var oi = 0; oi < occNow.length; oi++){
    var nm = eventDisplayName(occNow[oi].e);
    var key = String(nm || '').toLowerCase();
    if (!eventSeen[key]){ eventSeen[key] = 1; eventNames.push(nm); }
  }
  if (eventNames.length){
    lines.push('<div style="font-size:.85em;margin:1px 0;">🎉 ' + eventNames.map(esc).join(', ') + '</div>');
  }

  lines.push(sp);

  // Moons: Ascendant, New, Full
  if (st.moonsEnabled !== false){
    try {
      moonEnsureSequences();
      var moonSys = _getMoonSys();
      if (moonSys && moonSys.moons){
        var newMoons = [], fullMoons = [];
        moonSys.moons.forEach(function(moon){
          var verdict = _moonPeakPhaseDay(moon.name, today);
          if (verdict === 'full') fullMoons.push(moon.name);
          else if (verdict === 'new') newMoons.push(moon.name);
        });
        var moonLines = [];
        if (newMoons.length) moonLines.push('\uD83C\uDF11 <b>New:</b> ' + newMoons.map(esc).join(', '));
        if (fullMoons.length) moonLines.push('\uD83C\uDF15 <b>Full:</b> ' + fullMoons.map(esc).join(', '));
        if (moonLines.length){
          lines.push('<div style="font-size:.82em;opacity:.8;line-height:1.5;">' + moonLines.join('<br>') + '</div>');
        }
      }
    } catch(e5){}
  }

  lines.push(sp);

  // Planes: Coterminous, Remote
  if (st.planesEnabled !== false){
    try {
      var allPlanes = _getAllPlaneData();
      var ypd = 336; // typical year days
      var coterminous = [], remote = [];
      for (var pi = 0; pi < allPlanes.length; pi++){
        if (allPlanes[pi].type === 'fixed') continue;
        var ps2 = getPlanarState(allPlanes[pi].name, today);
        if (!ps2) continue;
        if (ps2.phaseDuration != null && ps2.phaseDuration > ypd) continue;
        if (ps2.phase === 'coterminous') coterminous.push(ps2.plane.name);
        else if (ps2.phase === 'remote') remote.push(ps2.plane.name);
      }
      var planeLines = [];
      if (coterminous.length) planeLines.push('🔴 <b>Coterminous:</b> ' + coterminous.map(esc).join(', '));
      if (remote.length) planeLines.push('🔵 <b>Remote:</b> ' + remote.map(esc).join(', '));
      if (planeLines.length){
        lines.push('<div style="font-size:.82em;opacity:.8;line-height:1.5;">' + planeLines.join('<br>') + '</div>');
      }
    } catch(e6){}
  }

  // ── Buttons ────────────────────────────────────────────────────────────
  var btns = [];

  // Date step arrows
  btns.push('<div style="margin:3px 0;">' + button('Back','retreat 1') + ' ' + button('Forward','advance 1') + '</div>');

  // Send Today View to Players
  btns.push('<div style="margin:3px 0;">' + button('Send Today View to Players','send') + '</div>');

  // Subsystems dropdown
  btns.push('<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Subsystems', 'today options ?{Subsystem|Events,events|Moons,moon|Planes,planes}') +
    '</div>');

  // Management dropdown (GM only)
  btns.push('<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Management', 'today manage ?{Action|Enable/Disable Moons,moon toggle|Enable/Disable Planes,planes toggle|Theme,help themes|Name Variants,help calendarsystems|Hemisphere,help hemisphere|Reset Calendar,help resetconfirm}') +
    '</div>');

  return _menuBox('Today — ' + esc(_displayMonthDayParts(c.month, c.day_of_the_month).label),
    lines.join('') + btns.join(''));
}

export var USAGE = {
  'events.add':     'Usage: !cal add [MM DD [YYYY] | <MonthName> DD [YYYY] | DD] NAME [#COLOR|color] (DD may be an ordinal like 1st or fourteenth)',
  'events.remove':  'Usage: !cal remove [list | key <KEY> | series <KEY> | <name fragment>]',
  'events.restore': 'Usage: !cal restore [all] [exact] <name...> | restore key <KEY> | restore series <KEY>',
  'date.set':       'Usage: !cal set <Month> DD [YYYY] — Month is a real-month number (1–12) or any month name; DD may be an ordinal (1st, fourteenth). Set an intercalary festival by name: !cal set Midwinter or !cal set Growfest 3'
};

export function usage(key, m){ whisper(m.who, USAGE[key]); }

export function invokeEventSub(m, sub, args){
  var cfg = EVENT_SUB[sub];
  if (!cfg) return whisper(m.who, 'Unknown events subcommand. Try: add | addmonthly | addyearly | remove | restore | list');
  if (cfg.usage && (!args || args.length === 0)) return usage(cfg.usage, m);
  return cfg.run(m, args || []);
}

export var EVENT_SUB = {
  // §5.5 Events Current — Past | Today | Upcoming with week-length
  // spillover into adjacent months. Every line carries an explicit
  // month label (no "events this month" title).
  current: {
    usage: null,
    run: function(m){
      whisper(m.who, _eventsCurrentHtml());
    }
  },
  // §5.5 Events All — year listing organized by month. Default year
  // is the current calendar year; an explicit yyyy can override.
  all: {
    usage: null,
    run: function(m, args){
      var y = parseInt(String(args[0] || ''), 10);
      if (!isFinite(y)) y = getCal().current.year;
      whisper(m.who, _eventsAllHtml(y));
    }
  },
  panel: {
    usage: null,
    run: function(m, args){
      whisper(m.who, _eventsPanelHtml(args[0] || null));
    }
  },
  ranges: {
    usage: null,
    run: function(m, args){
      _deliverAdditionalCalendarRange({
        who: m.who,
        args: args,
        dest: 'whisper',
        render: _eventsRangeHtml
      });
    }
  }
};

// ── Events Panel ──────────────────────────────────────────────────────────
function _eventsPanelHtml(serialArg){
  var cal = getCal(), c = cal.current;
  var today = todaySerial();

  // Determine which month to display
  var displaySerial = today;
  if (serialArg){
    var parsed = parseInt(serialArg, 10);
    if (isFinite(parsed)) displaySerial = parsed;
  }
  var dd = fromSerial(displaySerial);
  var mobj = cal.months[dd.mi];
  if (!mobj) return '';

  var monthStart = toSerial(dd.year, dd.mi, 1);
  var monthEnd = toSerial(dd.year, dd.mi, mobj.days | 0);

  // Minical
  var spec = {
    start: monthStart,
    end: monthEnd,
    months: [{ y: dd.year, mi: dd.mi }],
    title: mobj.name + ' ' + dd.year
  };
  var calHtml = buildCalendarsHtmlForSpec(spec);

  // Text Info
  var lines = [];
  lines.push('<div style="font-weight:bold;margin:3px 0;"><b>Current Date:</b> ' + esc(currentDateLabel()) + '</div>');

  // Bulleted events only if displayed month is the current month
  if (dd.year === c.year && dd.mi === c.month){
    try {
      var occ = occurrencesInRange(today, today);
      if (occ.length){
        var seen = {};
        var evList = [];
        for (var i = 0; i < occ.length; i++){
          var nm = eventDisplayName(occ[i].e);
          var k = String(nm || '').toLowerCase();
          if (!seen[k]){ seen[k] = 1; evList.push(nm); }
        }
        lines.push('<ul style="margin:4px 0;padding-left:18px;">');
        for (var j = 0; j < evList.length; j++){
          lines.push('<li style="font-size:.85em;">' + esc(evList[j]) + '</li>');
        }
        lines.push('</ul>');
      }
    } catch(e0){}
  }

  // Buttons
  var prevSer = _shiftSerialByMonth(displaySerial, -1);
  var nextSer = _shiftSerialByMonth(displaySerial, 1);

  var btns = [];
  btns.push('<div style="margin:6px 0 3px 0;">');
  btns.push(button('Show Previous','events panel ' + prevSer) + ' ');
  btns.push(button('Show Next','events panel ' + nextSer));
  btns.push('</div>');
  btns.push('<div style="margin:3px 0;">' + button('Send to Players','send ' + mobj.name + ' ' + dd.year) + '</div>');

  // Additional Ranges
  btns.push('<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Additional Ranges', buildAdditionalRangesCommand('events ranges', displaySerial)) +
    '</div>');

  return _menuBox('Events — ' + esc(mobj.name + ' ' + dd.year),
    calHtml + lines.join('') + btns.join(''));
}

// ── §5.5 Events Current ──────────────────────────────────────────────────
//
// Three sections: Past | Today | Upcoming. The active month is always
// fully included; adjacent months spill in for events within the week
// length (so a 7-day-week world includes one week of prior/next month
// events). Year boundaries are crossed transparently. Every line
// carries an explicit month label via `eventLineHtml(..., includeYear=true)`.
function _eventsCurrentHtml(){
  var cal = getCal();
  var c = cal.current;
  var today = todaySerial();
  var weekDays = Math.max(1, weekLength());

  // Window: full current month + week-of-spillover on each side.
  var monthStart = toSerial(c.year, c.month, 1);
  var monthEnd = toSerial(c.year, c.month, cal.months[c.month].days | 0);
  var windowStart = monthStart - weekDays;
  var windowEnd = monthEnd + weekDays;

  var occ = [];
  try { occ = occurrencesInRange(windowStart, windowEnd); } catch(_e){}

  // Bucket into past / today / upcoming preserving the engine's sort.
  var past = [], onToday = [], upcoming = [];
  for (var i = 0; i < occ.length; i++){
    var o = occ[i];
    if (o.serial < today) past.push(o);
    else if (o.serial === today) onToday.push(o);
    else upcoming.push(o);
  }

  function renderBucket(label, list, emptyHint){
    var html = '<div style="font-weight:bold;font-size:.92em;margin:6px 0 2px 0;opacity:.85;">' + esc(label) + '</div>';
    if (!list.length){
      return html + '<div style="font-size:.82em;opacity:.6;margin:2px 0;">' + esc(emptyHint) + '</div>';
    }
    var rows = [];
    for (var k = 0; k < list.length; k++){
      var x = list[k];
      var name = eventDisplayName(x.e);
      rows.push(eventLineHtml(x.y, x.m, x.d, name, /*includeYear=*/true, (x.serial === today), getEventColor(x.e)));
    }
    return html + rows.join('');
  }

  var body = '';
  body += renderBucket('Past', past, 'No recent events.');
  body += renderBucket('Today', onToday, 'Nothing today.');
  body += renderBucket('Upcoming', upcoming, 'Nothing on the horizon.');

  body += '<div style="margin-top:8px;">' + button('⬅️ Back', 'additional') + '</div>';

  return _menuBox('Events — Current', body);
}

// ── §5.5 Events All ──────────────────────────────────────────────────────
//
// Full year listing organized by month section header, chronological
// within each month. Mixed canon + custom events; the wrapper doesn't
// distinguish source (canon-only after PR 2c retires custom events).
function _eventsAllHtml(year){
  var cal = getCal();
  var months = cal.months;
  var yearStart = toSerial(year, 0, 1);
  var lastMi = months.length - 1;
  var yearEnd = toSerial(year, lastMi, months[lastMi].days | 0);
  var today = todaySerial();

  var occ = [];
  try { occ = occurrencesInRange(yearStart, yearEnd); } catch(_e){}

  // Group by structural month index. Engine sort already gives
  // chronological order; we just bucket on the way out.
  var byMonth: any = {};
  for (var i = 0; i < occ.length; i++){
    var key = String(occ[i].m | 0);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(occ[i]);
  }

  var sections = [];
  for (var mi = 0; mi < months.length; mi++){
    var bucket = byMonth[String(mi)] || [];
    if (!bucket.length) continue;
    var header = '<div style="font-weight:bold;font-size:.96em;margin:8px 0 3px 0;">' +
      esc(months[mi].name) + '</div>';
    var rows = [];
    for (var k = 0; k < bucket.length; k++){
      var x = bucket[k];
      var name = eventDisplayName(x.e);
      // includeYear=false inside a year-scoped panel — the title bar
      // states the year.
      rows.push(eventLineHtml(x.y, x.m, x.d, name, /*includeYear=*/false, (x.serial === today), getEventColor(x.e)));
    }
    sections.push(header + rows.join(''));
  }

  if (!sections.length){
    sections.push('<div style="font-size:.82em;opacity:.6;margin:4px 0;">No events in ' + esc(String(year)) + '.</div>');
  }

  // Year nav + Back.
  var prevY = button('◀ ' + (year - 1), 'events all ' + (year - 1));
  var nextY = button((year + 1) + ' ▶', 'events all ' + (year + 1));
  var nav = '<div style="margin:8px 0 0 0;">' + prevY + ' ' + nextY + '</div>';
  var back = '<div style="margin-top:6px;">' + button('⬅️ Back', 'additional') + '</div>';

  return _menuBox('Events — ' + esc(String(year)), sections.join('') + nav + back);
}

// ── §5.5 Lunar Current ───────────────────────────────────────────────────
//
// One row per moon. Columns:
//   • Name + active phase emoji
//   • Phase label
//   • Synodic period (cycle days)
//   • Last full / new (whichever was more recent), with date
//   • Next full / new (whichever sooner), with day countdown
function _lunarCurrentHtml(){
  var sys = _getMoonSys();
  if (!sys || !sys.moons || !sys.moons.length){
    return _menuBox('Lunar — Current',
      '<div style="opacity:.7;">No moon data for this calendar system.</div>' +
      '<div style="margin-top:8px;">' + button('⬅️ Back', 'additional') + '</div>'
    );
  }
  var today = todaySerial();

  var rows = sys.moons.map(function(moon){
    var ph = moonPhaseAt(moon.name, today);
    var emoji = _moonPhaseEmoji(ph.illum, ph.waxing);
    var label = ph.label || _moonPhaseLabel(ph.illum, ph.waxing);
    var period = moon.synodicPeriod || moon.baseCycleDays || null;

    // Most recent inflection (full or new), whichever was more recent.
    var lastFull = _moonLastEvent(moon.name, today, 'full');
    var lastNew = _moonLastEvent(moon.name, today, 'new');
    var lastSer = null, lastType = null;
    if (lastFull != null && (lastNew == null || lastFull >= lastNew)){
      lastSer = lastFull; lastType = 'Full';
    } else if (lastNew != null){
      lastSer = lastNew; lastType = 'New';
    }
    var lastTxt = (lastSer != null)
      ? esc(lastType + ' on ' + dateLabelFromSerial(lastSer))
      : '<span style="opacity:.55;">no recent event</span>';

    // Next inflection.
    var nextFull = _moonNextEvent(moon.name, today, 'full');
    var nextNew = _moonNextEvent(moon.name, today, 'new');
    var nextSer = null, nextType = null;
    if (nextFull != null && (nextNew == null || nextFull <= nextNew)){
      nextSer = nextFull; nextType = 'Full';
    } else if (nextNew != null){
      nextSer = nextNew; nextType = 'New';
    }
    var nextTxt;
    if (nextSer != null){
      var days = nextSer - today;
      var dLbl = days === 1 ? '1 day' : (days + ' days');
      nextTxt = esc(nextType + ' in ' + dLbl + ' (' + dateLabelFromSerial(nextSer) + ')');
    } else {
      nextTxt = '<span style="opacity:.55;">no upcoming event</span>';
    }

    var dot = moon.color
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + esc(String(moon.color)) + ';margin-right:4px;"></span>'
      : '';
    return '<div style="margin:6px 0;">' +
      '<div>' + dot + esc(emoji + ' ') + '<b>' + esc(moon.name) + '</b> &mdash; ' + esc(label) +
        (period ? ' <span style="opacity:.65;">(cycle ' + esc(String(period)) + 'd)</span>' : '') +
        '</div>' +
      '<div style="font-size:.85em;opacity:.85;margin-left:14px;">Last: ' + lastTxt + '</div>' +
      '<div style="font-size:.85em;opacity:.85;margin-left:14px;">Next: ' + nextTxt + '</div>' +
      '</div>';
  });

  var back = '<div style="margin-top:8px;">' + button('⬅️ Back', 'additional') + '</div>';
  return _menuBox('Lunar — Current', rows.join('') + back);
}

// ── §5.5 Lunar All ───────────────────────────────────────────────────────
//
// Year listing organized by month section header, chronological within.
// Mixes moons within a month — readers want "when does the sky have an
// event" across all moons at once, not "what does Olarune do across the
// year".
function _lunarAllHtml(year){
  var sys = _getMoonSys();
  if (!sys || !sys.moons || !sys.moons.length){
    return _menuBox('Lunar — ' + esc(String(year)),
      '<div style="opacity:.7;">No moon data for this calendar system.</div>' +
      '<div style="margin-top:8px;">' + button('⬅️ Back', 'additional') + '</div>'
    );
  }
  var cal = getCal();
  var months = cal.months;
  var yearStart = toSerial(year, 0, 1);
  var lastMi = months.length - 1;
  var yearEnd = toSerial(year, lastMi, months[lastMi].days | 0);

  // Walk forward across all moons accumulating (serial, moon, type)
  // tuples. Engine `nextEvent` is closed-form so each call is cheap;
  // we iterate per moon to avoid an O(year × moons) day scan.
  var entries: { serial: number; moonName: string; moonColor: string; type: 'Full' | 'New' }[] = [];
  for (var mi = 0; mi < sys.moons.length; mi++){
    var moon = sys.moons[mi];
    (['full', 'new'] as const).forEach(function(t){
      var cursor = yearStart - 1;
      while (true){
        var next = _moonNextEvent(moon.name, cursor, t);
        if (next == null || next > yearEnd) break;
        entries.push({ serial: next, moonName: moon.name, moonColor: moon.color || '#888888', type: t === 'full' ? 'Full' : 'New' });
        cursor = next;
      }
    });
  }
  entries.sort(function(a, b){ return a.serial - b.serial; });

  // Bucket into structural-mi sections.
  var byMonth: { [mi: string]: typeof entries } = {};
  for (var i = 0; i < entries.length; i++){
    var di = fromSerial(entries[i].serial);
    var key = String(di.mi);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(entries[i]);
  }

  var sections = [];
  for (var mi2 = 0; mi2 < months.length; mi2++){
    var bucket = byMonth[String(mi2)] || [];
    if (!bucket.length) continue;
    var header = '<div style="font-weight:bold;font-size:.96em;margin:8px 0 3px 0;">' +
      esc(months[mi2].name) + '</div>';
    var rowsLA = bucket.map(function(x){
      var di2 = fromSerial(x.serial);
      var dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + esc(x.moonColor) + ';margin-right:6px;"></span>';
      var weight = (x.serial === todaySerial()) ? 'font-weight:bold;' : '';
      return '<div style="margin:2px 0 2px 14px;font-size:.86em;' + weight + '">' + dot +
        esc(String(di2.day)) + ' &mdash; ' + esc(x.moonName) + ' ' + esc(x.type) + '</div>';
    });
    sections.push(header + rowsLA.join(''));
  }

  if (!sections.length){
    sections.push('<div style="font-size:.82em;opacity:.6;margin:4px 0;">No lunar events in ' + esc(String(year)) + '.</div>');
  }

  var prevY = button('◀ ' + (year - 1), 'lunar all ' + (year - 1));
  var nextY = button((year + 1) + ' ▶', 'lunar all ' + (year + 1));
  var nav = '<div style="margin:8px 0 0 0;">' + prevY + ' ' + nextY + '</div>';
  var back = '<div style="margin-top:6px;">' + button('⬅️ Back', 'additional') + '</div>';

  return _menuBox('Lunar — ' + esc(String(year)), sections.join('') + nav + back);
}

// ── §5.5 Planar Current ──────────────────────────────────────────────────
//
// Past | Today | Upcoming transitions, week-length spillover, explicit
// month labels per line. Eberron-only.
//
// Transition line shapes (per DESIGN.md §5.5):
//   phase-in:  "16 — Fernia Coterminous for 7 days"
//   phase-out: "22 — Fernia Coterminous Ends"  (dimmer, no countdown)
//
// "Phase-in" means the transition is INTO a non-neutral phase
// (coterminous or remote); the FROM side was neutral. "Phase-out"
// means the transition is OUT of a non-neutral phase (TO side is
// neutral); the FROM phase ends.
function _planarCurrentHtml(){
  var st = ensureSettings();
  if (String(st.calendarSystem || '').toLowerCase() !== 'eberron'){
    return _menuBox('Planar — Current',
      '<div style="opacity:.7;">Planar canon is Eberron-only.</div>' +
      '<div style="margin-top:8px;">' + button('⬅️ Back', 'additional') + '</div>'
    );
  }
  var cal = getCal();
  var c = cal.current;
  var today = todaySerial();
  var weekDays = Math.max(1, weekLength());

  // Window: current month ± week-length spillover, same as events current.
  var monthStart = toSerial(c.year, c.month, 1);
  var monthEnd = toSerial(c.year, c.month, cal.months[c.month].days | 0);
  var windowStart = monthStart - weekDays;
  var windowEnd = monthEnd + weekDays;

  // Engine returns transitions for upcoming(from, withinDays). We start
  // at windowStart so past transitions fall inside the returned set.
  var transitions: { plane: any; from: string; to: string; on: any }[] = [];
  try {
    var fromDate = serialToCalendarDate(windowStart);
    var span = Math.max(1, windowEnd - windowStart);
    transitions = (enginePlanes.upcoming(fromDate, span, getPlanePositions()) as any) || [];
  } catch(_e){}

  // Normalize each transition into a wrapper serial + line spec, then
  // bucket past / today / upcoming.
  function dateSerial(d: any){
    return toSerial(d.year, _calendarDateMonthIndexFor(d), d.day || 1);
  }
  // A phase-OUT transition (to neutral) is dated by the engine on the first
  // NEUTRAL day — i.e. the day AFTER the phase's last active day. Since the
  // wrapper labels it "<phase> Ends", show it on the last ACTIVE day so a
  // Vult 26–28 coterminous "Ends" on Vult 28, not Zarantyr 1. Phase-in lines
  // are unchanged. Used for both display and past/today/upcoming bucketing.
  function transitionSerial(t: any){
    return dateSerial(t.on) - (t.to === 'neutral' ? 1 : 0);
  }
  function lineHtml(t: any, isToday: boolean){
    var ser = transitionSerial(t);
    var di = fromSerial(ser);
    var monthName = cal.months[di.mi] ? cal.months[di.mi].name : '';
    var planeName = t.plane && (t.plane.name || t.plane.key) || '';
    var planeKey = String(t.plane && (t.plane.name || t.plane.key) || '');
    var enriched = _getPlaneData(planeKey);
    var color = (enriched && enriched.color) || '#888888';
    var dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + esc(color) + ';margin-right:6px;"></span>';
    var label = esc(String(di.day) + ' ' + monthName) + ' &mdash; <b>' + esc(planeName) + '</b> ' +
      esc(String(t.to).replace(/^./, function(c){return c.toUpperCase();}));
    if (t.to === 'neutral'){
      // Phase-out (going to neutral). Use the FROM phase name and dim
      // the line; no countdown.
      label = esc(String(di.day) + ' ' + monthName) + ' &mdash; <b>' + esc(planeName) + '</b> ' +
        esc(String(t.from).replace(/^./, function(c){return c.toUpperCase();})) + ' Ends';
      return '<div style="margin:2px 0;font-size:.86em;opacity:.55;' + (isToday ? 'font-weight:bold;' : '') + '">' + dot + label + '</div>';
    }
    // Phase-in. Look up phase duration via getPlanarState on the
    // transition day so we can render "for N days".
    var ps = getPlanarState(planeName, ser);
    var dur = (ps && ps.phaseDuration) ? ps.phaseDuration : null;
    var suffix = dur ? (' for ' + dur + ' day' + (dur === 1 ? '' : 's')) : '';
    return '<div style="margin:2px 0;font-size:.86em;' + (isToday ? 'font-weight:bold;' : '') + '">' +
      dot + label + esc(suffix) + '</div>';
  }

  var past: string[] = [], onToday: string[] = [], upcoming: string[] = [];
  for (var i = 0; i < transitions.length; i++){
    var t = transitions[i];
    var ser = transitionSerial(t);
    var html = lineHtml(t, ser === today);
    if (ser < today) past.push(html);
    else if (ser === today) onToday.push(html);
    else upcoming.push(html);
  }

  function bucketHtml(title: string, list: string[], emptyHint: string){
    var header = '<div style="font-weight:bold;font-size:.92em;margin:6px 0 2px 0;opacity:.85;">' + esc(title) + '</div>';
    if (!list.length) return header + '<div style="font-size:.82em;opacity:.6;margin:2px 0;">' + esc(emptyHint) + '</div>';
    return header + list.join('');
  }

  var body = '';
  body += bucketHtml('Past', past, 'No recent transitions.');
  body += bucketHtml('Today', onToday, 'No transitions today.');
  body += bucketHtml('Upcoming', upcoming, 'No upcoming transitions.');
  body += '<div style="margin-top:8px;">' + button('⬅️ Back', 'additional') + '</div>';

  return _menuBox('Planar — Current', body);
}

// ── §5.5 Planar All ──────────────────────────────────────────────────────
//
// Year listing by month with chronological transitions inside. Same
// transition-line shapes as Planar Current; reuses the engine's
// `upcoming` enumeration across the year. Eberron-only.
function _planarAllHtml(year){
  var st = ensureSettings();
  if (String(st.calendarSystem || '').toLowerCase() !== 'eberron'){
    return _menuBox('Planar — ' + esc(String(year)),
      '<div style="opacity:.7;">Planar canon is Eberron-only.</div>' +
      '<div style="margin-top:8px;">' + button('⬅️ Back', 'additional') + '</div>'
    );
  }
  var cal = getCal();
  var months = cal.months;
  var yearStart = toSerial(year, 0, 1);
  var lastMi = months.length - 1;
  var yearEnd = toSerial(year, lastMi, months[lastMi].days | 0);
  var today = todaySerial();

  var transitions: { plane: any; from: string; to: string; on: any }[] = [];
  try {
    var fromDate = serialToCalendarDate(yearStart);
    var span = Math.max(1, yearEnd - yearStart);
    transitions = (enginePlanes.upcoming(fromDate, span, getPlanePositions()) as any) || [];
  } catch(_e){}

  // Group transitions by structural-mi. Phase-OUT transitions are dated by
  // the engine on the first neutral day (last active day + 1); shift them
  // back a day so a "<phase> Ends" line lands on the last ACTIVE day — and
  // in the correct month/section (Vult 28, not Zarantyr 1).
  var byMonth: { [mi: string]: any[] } = {};
  for (var i = 0; i < transitions.length; i++){
    var t = transitions[i];
    var rawSer = toSerial(t.on.year, _calendarDateMonthIndexFor(t.on), t.on.day || 1);
    var ser = rawSer - (t.to === 'neutral' ? 1 : 0);
    var di = fromSerial(ser);
    var key = String(di.mi);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push({ t: t, serial: ser, di: di });
  }

  var sections = [];
  for (var mi = 0; mi < months.length; mi++){
    var bucket = byMonth[String(mi)] || [];
    if (!bucket.length) continue;
    var header = '<div style="font-weight:bold;font-size:.96em;margin:8px 0 3px 0;">' +
      esc(months[mi].name) + '</div>';
    var rowsPA = bucket.map(function(item){
      var t = item.t;
      var ser = item.serial;
      var di = item.di;
      var planeName = t.plane && (t.plane.name || t.plane.key) || '';
      var enriched = _getPlaneData(String(planeName));
      var color = (enriched && enriched.color) || '#888888';
      var dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + esc(color) + ';margin-right:6px;"></span>';
      var weight = (ser === today) ? 'font-weight:bold;' : '';
      if (t.to === 'neutral'){
        return '<div style="margin:2px 0 2px 14px;font-size:.86em;opacity:.55;' + weight + '">' + dot +
          esc(String(di.day)) + ' &mdash; <b>' + esc(planeName) + '</b> ' +
          esc(String(t.from).replace(/^./, function(c){return c.toUpperCase();})) + ' Ends</div>';
      }
      var ps = getPlanarState(planeName, ser);
      var dur = (ps && ps.phaseDuration) ? ps.phaseDuration : null;
      var suffix = dur ? (' for ' + dur + ' day' + (dur === 1 ? '' : 's')) : '';
      return '<div style="margin:2px 0 2px 14px;font-size:.86em;' + weight + '">' + dot +
        esc(String(di.day)) + ' &mdash; <b>' + esc(planeName) + '</b> ' +
        esc(String(t.to).replace(/^./, function(c){return c.toUpperCase();})) + esc(suffix) + '</div>';
    });
    sections.push(header + rowsPA.join(''));
  }

  if (!sections.length){
    sections.push('<div style="font-size:.82em;opacity:.6;margin:4px 0;">No planar transitions in ' + esc(String(year)) + '.</div>');
  }

  var prevY = button('◀ ' + (year - 1), 'planar all ' + (year - 1));
  var nextY = button((year + 1) + ' ▶', 'planar all ' + (year + 1));
  var nav = '<div style="margin:8px 0 0 0;">' + prevY + ' ' + nextY + '</div>';
  var back = '<div style="margin-top:6px;">' + button('⬅️ Back', 'additional') + '</div>';

  return _menuBox('Planar — ' + esc(String(year)), sections.join('') + nav + back);
}

// Helper for the planar panels: engine `CalendarDate` carries either
// `monthIndex` (kind 'month') or `intercalaryKey` (kind 'intercalary');
// translate back to a wrapper structural index. Mirrors moon.ts's
// `_calendarDateMonthIndex` so each subsystem can stand alone.
function _calendarDateMonthIndexFor(date: any): number {
  var months = getCal().months;
  if (date.kind === 'intercalary'){
    for (var j = 0; j < months.length; j++){
      var m2: any = months[j];
      if (m2.isIntercalary && String(m2.key || '').toLowerCase() === String(date.intercalaryKey).toLowerCase()) return j;
    }
    return 0;
  }
  for (var i = 0; i < months.length; i++){
    var m: any = months[i];
    if (m.isIntercalary) continue;
    if (m.engineMonthIndex === date.monthIndex || m.regularIndex === date.monthIndex) return i;
  }
  return 0;
}

function _eventsRangeHtml(spec){
  var rangeSpec = Object.assign({}, spec, { includeAdjacentStrips: false });
  return _menuBox('Events — ' + esc(spec.title || 'Range'),
    buildCalendarsHtmlForSpec(rangeSpec));
}

export var commands = {

  // ── Public ────────────────────────────────────────────────────────────────

  '': function(m, a){
    var restTokens = _normalizePackedWords(a.slice(1).join(' ')).split(/\s+/).filter(Boolean);
    if (!restTokens.length){
      _showDefaultCalView(m);
      return;
    }
    _deliverTopLevelCalendarRange({ who:m.who, args:restTokens, dest:'whisper' });
  },

  show: function(m, a){
    var restTokens = _normalizePackedWords(a.slice(2).join(' ')).split(/\s+/).filter(Boolean);
    if (!restTokens.length){
      _showDefaultCalView(m);
      return;
    }
    _deliverTopLevelCalendarRange({ who:m.who, args:restTokens, dest:'whisper' });
  },

  now: function(m){
    sendCurrentDate(m.who, false, { playerid:m.playerid, compact:true, includeButtons:false });
  },

  // §5.4 Additional hub — whisper-only subsystem launcher. Replaces the
  // legacy "Subsystems" dropdown on the main panel.
  additional: function(m){
    whisper(m.who, additionalHubHtml());
  },

  today: function(m, a){
    var sub = (a[2] || '').toLowerCase();
    // !cal today options <choice> — redirect from Additional Options dropdown
    if (sub === 'options'){
      var choice = (a[3] || '').toLowerCase();
      if (choice === 'events') return invokeEventSub(m, 'panel', []);
      if (choice === 'moon')   return handleMoonCommand(m, ['moon', 'summary']);
      if (choice === 'planes') return handlePlanesCommand(m, ['planes', 'summary']);
      if (choice === 'admin' || choice === 'help') return helpRootMenu(m);
      return helpRootMenu(m);
    }
    // !cal today manage <action> — GM-only Management dropdown
    if (sub === 'manage'){
      var mAction = (a[3] || '').toLowerCase();
      if (!mAction) return helpRootMenu(m);
      // Route management actions to their existing handlers
      var mRest = a.slice(3);
      return commands[mAction] ? (typeof commands[mAction] === 'function' ? commands[mAction](m, ['!cal'].concat(mRest)) : commands[mAction].run(m, ['!cal'].concat(mRest))) : helpRootMenu(m);
    }
    // Both GMs and players get the consolidated Today view.
    // sendCurrentDate handles audience-appropriate output internally.
    _showDefaultCalView(m);
  },

  setup: function(m){
    whisperUi(m.who, 'Setup is already complete.');
  },

  // §10 cross-script setup token consumer. Pasted from the web app's
  // "Copy configuration token" affordance — applies world / date /
  // variant / palette / lunar anchors / planar anchors to the running
  // session in one shot. GM-only; handler does its own playerIsGM gate
  // since it reads msg.content directly (not the args-array path).
  token: function(m){
    handleTokenCommand(m);
  },

  help: function(m, a){
    var page = String(a[2]||'').toLowerCase();
    switch(page){
      case 'eventcolors': return helpEventColorsMenu(m);
      case 'calendar':    return helpCalendarSystemMenu(m);
      case 'themes':      return helpThemesMenu(m);
      case 'root':
      default:            return helpRootMenu(m);
    }
  },

  // ── GM Only ───────────────────────────────────────────────────────────────

  settings: { gm:true, run:function(m,a){
    var key = String(a[2]||'').toLowerCase();
    var val = String(a[3]||'').toLowerCase();
    var st = ensureSettings();
    function _settingsUsage(){
      return whisperUi(m.who,
        'Usage: <code>!cal settings (group|labels|events|moons|planes|offcycle|buttons) (on|off)</code><br>'+
        '<code>!cal settings density (compact|normal)</code> &nbsp;·&nbsp; '+
        '<code>!cal settings mode planes (calendar|list|both)</code><br>'+
        '<code>!cal settings verbosity (normal|minimal)</code>'
      );
    }
    if (!key){
      return _settingsUsage();
    }
    if (key === 'density'){
      if (!/^(compact|normal)$/.test(val)){
        return whisperUi(m.who,'Usage: <code>!cal settings density (compact|normal)</code>');
      }
      st.uiDensity = val;
      refreshAndSend();
      return whisperUi(m.who,'UI density set to <b>'+esc(val)+'</b>.');
    }
    if (key === 'verbosity'){
      if (!/^(normal|minimal)$/.test(val)){
        return whisperUi(m.who,'Usage: <code>!cal settings verbosity (normal|minimal)</code>');
      }
      st.subsystemVerbosity = val;
      refreshAndSend();
      return whisperUi(m.who,'Subsystem detail set to <b>'+esc(titleCase(val))+'</b>.');
    }
    if (key === 'mode'){
      var sysTok = String(a[3] || '').toLowerCase();
      var modeTok = String(a[4] || '').toLowerCase();
      if (!/^(planes|plane|planar)$/.test(sysTok) || !/^(calendar|list|both)$/.test(modeTok)){
        return whisperUi(m.who,'Usage: <code>!cal settings mode planes (calendar|list|both)</code>');
      }
      st.planesDisplayMode = modeTok;
      refreshAndSend();
      return whisperUi(m.who,'Display mode updated: <b>'+esc(titleCase(sysTok))+'</b> → <b>'+esc(titleCase(modeTok))+'</b>.');
    }
    if (!/^(group|labels|events|moons|planes|offcycle|buttons)$/.test(key) || !/^(on|off)$/.test(val)){
      return _settingsUsage();
    }
    if (key==='group')    st.groupEventsBySource = (val==='on');
    if (key==='labels')   st.showSourceLabels    = (val==='on');
    if (key==='events')   st.eventsEnabled       = (val==='on');
    if (key==='moons'){    st.moonsEnabled  = (val==='on'); st._moonsAutoToggle = false; }
    if (key==='planes'){  st.planesEnabled = (val==='on'); st._planesAutoToggle = false; }
    if (key==='offcycle') st.offCyclePlanes      = (val==='on');
    if (key==='buttons')  st.autoButtons         = (val==='on');
    refreshAndSend();
    whisperUi(m.who,'Setting updated.');
  }},

  // §5.5 — `!cal events current` / `!cal events all [yyyy]` / the
  // legacy `panel` and `ranges` whispered surfaces. The GM
  // add/remove/list family was retired when events became canon-pack
  // only; new event content arrives via `!cal token` from the web
  // app. Existing custom-event data in
  // `state.PartyBuffCalendar.calendar.events` continues to render
  // in the panels.
  events: { run:function(m, a){
    var args = a.slice(2);
    var sub  = (args.shift() || 'current').toLowerCase();
    return invokeEventSub(m, sub, args);
  }},

  // Whispered detail card for a single named event — its date(s), source,
  // and engine-sourced lore. Description text is read live from engine
  // `world.holidays`, so editing lore in the engine auto-bumps to Roll20;
  // the wrapper hosts no event copy.
  event: { run:function(m, a){
    var name = a.slice(2).join(' ').trim();
    if (!name){ return whisper(m.who, 'Usage: <code>!cal event &lt;name&gt;</code> — shows an event’s dates and lore.'); }
    var cal = getCal();
    var lc = name.toLowerCase();
    var evs = (cal.events||[]).filter(function(e){ return String(e.name||'').toLowerCase() === lc; });
    if (!evs.length) evs = (cal.events||[]).filter(function(e){ return String(e.name||'').toLowerCase().indexOf(lc) >= 0; });
    if (!evs.length){ return whisper(m.who, 'No event named <b>'+esc(name)+'</b> on this calendar.'); }

    var displayName = String(evs[0].name||'');
    var body = '<div style="font-size:1.05em;"><b>'+esc(displayName)+'</b></div>';
    var srcKey = evs[0].source ? String(evs[0].source) : null;
    if (srcKey){ body += '<div style="font-size:.82em;opacity:.6;">Source: '+esc(titleCase(sourceDisplayLabel(srcKey)))+'</div>'; }

    var seenD = {}, dateLines = [];
    for (var i=0;i<evs.length;i++){
      var e = evs[i];
      var key = e.month+'|'+e.day;
      if (seenD[key]) continue; seenD[key]=1;
      var mObj = cal.months[(e.month|0)-1];
      dateLines.push(esc((mObj ? mObj.name : ('Month '+e.month)) + ' ' + String(e.day)));
    }
    if (dateLines.length){ body += '<div style="font-size:.85em;opacity:.75;margin-top:2px;">'+dateLines.join(' &nbsp;·&nbsp; ')+'</div>'; }

    var desc = engineEventDescription(String(ensureSettings().calendarSystem||''), displayName);
    body += desc
      ? '<div style="font-size:.85em;margin-top:6px;line-height:1.4;">'+esc(desc)+'</div>'
      : '<div style="font-size:.8em;opacity:.5;margin-top:6px;font-style:italic;">No lore recorded for this event yet.</div>';

    return whisper(m.who, _menuBox('📅 '+esc(displayName), body));
  }},

  send: { gm:true, run:function(m, a){
    var restTokens = _normalizePackedWords(a.slice(2).join(' ')).split(/\s+/).filter(Boolean);
    // Public "today" broadcast: force the full default view so the canon event
    // list ("Events this month") is always appended, regardless of the GM's
    // personal density setting. Button-free (/direct strips buttons anyway).
    if (!restTokens.length){ sendCurrentDate(null, false, { playerid:m.playerid, includeButtons:false, density:'normal' }); return; }
    _deliverTopLevelCalendarRange({ who:m.who, args:restTokens, dest:'broadcast' });
  }},

  advance: { gm:true, run:function(m,a){ stepDays( parseInt(a[2],10) || 1); } },
  retreat: { gm:true, run:function(m,a){ stepDays(-(parseInt(a[2],10) || 1)); } },

  set: { gm:true, run:function(m,a){
    var r = Parse.looseMDY(a.slice(2));
    if (!r){ return whisper(m.who, USAGE['date.set']); }
    var cal = getCal(), cur = cal.current, months = cal.months;
    if (r.kind === 'dayOnly'){
      var next = nextForDayOnly(cur, r.day, months.length);
      var d = clamp(r.day, 1, months[next.month].days|0);
      setDate(next.month+1, d, next.year);
      return;
    }
    var y  = (r.year != null) ? r.year : cur.year;
    // Guard: block setting the date to an inactive leap month.
    if (months[r.mi] && months[r.mi].leapEvery && !_isLeapMonth(months[r.mi], y)){
      return whisper(m.who,
        '<b>'+esc(months[r.mi].name)+'</b> only exists in leap years (every '+
        months[r.mi].leapEvery+' years). Year '+y+' is not a leap year.');
    }
    var d2 = clamp(r.day, 1, months[r.mi].days|0);
    setDate(r.mi+1, d2, y);
  }},

  theme: { gm:true, run:function(m, a){
    var sub = String(a[2]||'').toLowerCase();
    if (!sub || sub==='list'){ return whisper(m.who, themeListHtml()); }
    if (sub === 'reset' || sub === 'default'){
      ensureSettings().colorTheme = null;
      colorsAPI.reset();
      refreshAndSend();
      return whisper(m.who, 'Color theme reset to calendar default.');
    }
    if (!COLOR_THEMES[sub]) return whisper(m.who, 'Unknown theme. Try <code>!cal theme list</code>.');
    ensureSettings().colorTheme = sub;
    colorsAPI.reset();
    refreshAndSend();
    whisper(m.who, 'Color theme set to <b>'+esc(sub)+'</b>. Use <code>!cal theme reset</code> to return to calendar default.');
  }},

  calendar: { gm:true, run: function(m, a){
    var sysKey = (a[2]||'').toLowerCase();
    var varKey = (a[3]||'').toLowerCase();
    var curSys = ensureSettings().calendarSystem;
    // No/unknown world → show the current world's name-variant picker.
    if (!sysKey || !CALENDAR_SYSTEMS[sysKey]){
      return whisper(m.who, calendarSystemListHtml());
    }
    // Switching to a DIFFERENT world is not a live setting — it changes the
    // world's dates and data, so it goes through resetcalendar → setup.
    // Only name-variant swaps within the current world stay live.
    if (sysKey !== curSys){
      return whisper(m.who,
        'Switching to <b>'+esc(CALENDAR_SYSTEMS[sysKey].label||titleCase(sysKey))+'</b> '+
        'changes the world and its dates — it isn’t a live setting. '+
        'Reset with <code>!cal resetcalendar</code>, then choose it during setup. '+
        '(Name variants for the current calendar: <code>!cal calendar</code>.)');
    }
    var sys = CALENDAR_SYSTEMS[sysKey];
    if (varKey && !(sys.variants && sys.variants[varKey])){
      return whisper(m.who,
        'Unknown variant <b>'+esc(varKey)+'</b> for '+esc(sys.label||sysKey)+'. '+
        'Available: '+Object.keys(sys.variants||{}).join(', ')+'.');
    }
    var vk = varKey || sys.defaultVariant || 'standard';
    var variant = sys.variants && sys.variants[vk];
    // Reset manual theme override so variant default takes effect.
    ensureSettings().colorTheme = null;
    applyCalendarSystem(sysKey, vk);
    invalidateMoonModel(false);
    _invalidateSerialCache();
    refreshAndSend();
    var msg = 'Setting: <b>'+esc(sys.label||titleCase(sysKey))+'</b>';
    if (variant && (variant.label || '').trim()) msg += ' — '+esc(variant.label||titleCase(vk));
    if (variant && variant.description){
      msg += '.<br><span style="opacity:.78;">'+esc(variant.description)+'</span>';
    } else {
      msg += '.';
    }
    whisper(m.who, msg);
  }},

  hemisphere: { gm:true, run:function(m, a){
    var sub = String(a[2]||'').toLowerCase();
    if (sub !== 'north' && sub !== 'south'){
      var st3 = ensureSettings();
      var cur = st3.hemisphere || CONFIG_DEFAULTS.hemisphere;
      var sv3 = st3.seasonVariant || CONFIG_DEFAULTS.seasonVariant;
      var entry3 = SEASON_SETS[sv3] || {};
      var aware = entry3.hemisphereAware ? 'yes' : 'no (current season set is not hemisphere-aware)';
      return whisper(m.who,
        'Current hemisphere: <b>'+esc(cur)+'</b>. Hemisphere-aware: '+aware+'.<br>'+
        button('North','hemisphere north')+' '+button('South','hemisphere south')
      );
    }
    var st4 = ensureSettings();
    st4.hemisphere = sub;
    // Re-apply the current season set so name arrays are shifted correctly.
    applySeasonSet(st4.seasonVariant || CONFIG_DEFAULTS.seasonVariant);
    refreshAndSend();
    whisper(m.who, 'Hemisphere: <b>'+esc(sub)+'</b>.');
  }},

  source: { gm:true, run: function(m, a){
    var args = a.slice(2).map(function(x){ return String(x).trim(); }).filter(Boolean);
    var sub = (args[0]||'').toLowerCase();
    var autoSuppressedSources = getAutoSuppressedSources();
    var tableStyle = STYLES.table + 'width:100%;max-width:100%;table-layout:auto;margin-right:0;';
    var thStyle = 'border:1px solid #444;padding:4px 6px;text-align:left;white-space:nowrap;';
    var tdStyle = 'border:1px solid #444;padding:4px 6px;vertical-align:middle;white-space:normal;';

    function sourceDefaultKeys(sourceKey){
      var key = String(sourceKey || '').trim().toLowerCase();
      var cal = getCal();
      var sysKey = ensureSettings().calendarSystem || CONFIG_DEFAULTS.calendarSystem;
      var lim = Math.max(1, cal.months.length);
      var out = [];
      defaults.events.forEach(function(de){
        var src = (de.source != null) ? String(de.source).toLowerCase() : null;
        if (src !== key) return;
        if (!_sourceAllowedForCalendar(src, sysKey)) return;
        var monthsList = (String(de.month).toLowerCase() === 'all')
          ? (function(){ var items = []; for (var i = 1; i <= lim; i++) items.push(i); return items; }())
          : [ clamp(parseInt(de.month, 10) || 1, 1, lim) ];
        monthsList.forEach(function(monthHuman){
          var monthObj = cal.months[monthHuman - 1];
          var maxD = monthObj ? (monthObj.days|0) : 28;
          out.push(defaultKeyFor(monthHuman, DaySpec.canonicalForKey(de.day, maxD), de.name));
        });
      });
      return out;
    }

    function sourceVisibility(key){
      var sup = state[state_name].suppressedDefaults || {};
      var defaultKeys = sourceDefaultKeys(key);
      var hidden = 0;
      defaultKeys.forEach(function(defKey){
        if (sup[defKey]) hidden++;
      });
      var total = defaultKeys.length;
      var shown = Math.max(0, total - hidden);
      var mode = 'shown';
      if (total && hidden >= total) mode = 'hidden';
      else if (hidden > 0) mode = 'mixed';
      return { total: total, hidden: hidden, shown: shown, mode: mode };
    }

    // Collect all known source keys → canonical display names.
    function allSources(){
      var cal = getCal(), seen = {};
      defaults.events.forEach(function(de){ if (de.source) seen[String(de.source).toLowerCase()] = String(de.source); });
      cal.events.forEach(function(e){ if (e.source) seen[String(e.source).toLowerCase()] = String(e.source); });
      return seen;
    }

    function listSources(){
      var seen  = allSources();
      var keys  = Object.keys(seen);
      if (!keys.length){ return whisper(m.who, '<div><b>Manage Event Sources</b></div><div style="opacity:.7;">No sources found.</div>'); }

      var pList = ensureSettings().eventSourcePriority;

      // Build display rows sorted by current priority rank, then alphabetically.
      function pRank(k){ var i=pList.indexOf(k); return i>=0 ? i : pList.length; }
      keys.sort(function(a,b){
        var rd = pRank(a) - pRank(b);
        return rd !== 0 ? rd : a.localeCompare(b);
      });

      // Filter out sources that are purely calendar-managed for another system.
      var displayKeys = keys.filter(function(k){
        var suppression = sourceSuppressionState(k);
        if (suppression.auto) return false;
        return sourceDefaultKeys(k).length > 0;
      });
      if (!displayKeys.length){
        return whisper(m.who, '<div><b>Manage Event Sources</b></div><div style="opacity:.7;">No sources are available for this calendar.</div>');
      }

      var head = '<tr>'+
        '<th style="'+thStyle+'">Source</th>'+
        '<th style="'+thStyle+'text-align:center;">Current Status</th>'+
        '<th style="'+thStyle+'text-align:center;">Move</th>'+
        '</tr>';

      var rows = displayKeys.map(function(k, i){
        var label    = titleCase(sourceDisplayLabel(seen[k]));
        var stats = sourceVisibility(k);
        var upBtn    = i > 0
          ? button('↑', 'source up '   + label, {icon:''})
          : '';
        var downBtn  = i < displayKeys.length - 1
          ? button('↓', 'source down ' + label, {icon:''})
          : '';
        var statusCell = '';
        if (stats.mode === 'hidden'){
          statusCell = 'Hidden<br>' + button('Show', 'source enable ' + label, {icon:''});
        } else if (stats.mode === 'mixed'){
          statusCell = 'Partially Hidden<br><span style="opacity:.72;">' + stats.hidden + ' of ' + stats.total + ' hidden</span><br>' +
            button('Show All', 'source enable ' + label, {icon:''}) + ' ' +
            button('Hide All', 'source disable ' + label, {icon:''});
        } else {
          statusCell = 'Shown<br>' + button('Hide', 'source disable ' + label, {icon:''});
        }
        return '<tr>'+
          '<td style="'+tdStyle+'">'+esc(label)+'</td>'+
          '<td style="'+tdStyle+'text-align:center;white-space:nowrap;">'+statusCell+'</td>'+
          '<td style="'+tdStyle+'text-align:center;white-space:nowrap;">'+upBtn+(upBtn && downBtn ? ' ' : '')+downBtn+'</td>'+
          '</tr>';
      }).join('');

      whisper(m.who,
        '<div style="margin:4px 0;"><b>Manage Event Sources</b></div>'+
        '<div style="overflow-x:auto;max-width:100%;"><table style="'+tableStyle+'">'+head+rows+'</table></div>'+
        '<div style="font-size:.8em;opacity:.7;margin-top:4px;">'+
        'Order = priority. Top source sets cell color. Hide/show acts like a bulk toggle for each source&#39;s default events, and hidden entries still appear in the main hide/show list.'+
        '</div>'
      );
    }

    function movePriority(name, dir){
      var key  = resolveSourceKeyInput(name);
      var seen = allSources();
      if (!key || !seen[key]){ whisper(m.who, 'Source not found: '+esc(name)); return; }
      var st   = ensureSettings();
      var pList= st.eventSourcePriority;
      var idx  = pList.indexOf(key);

      if (idx < 0){
        // Not yet ranked: add it. 'up' puts it at front; 'down' appends.
        if (dir === 'up')   pList.unshift(key);
        else                pList.push(key);
      } else {
        var swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= pList.length){ listSources(); return; }
        var tmp = pList[swap]; pList[swap] = pList[idx]; pList[idx] = tmp;
      }

      // Prune keys that no longer exist as sources.
      var knownKeys = Object.keys(seen);
      st.eventSourcePriority = pList.filter(function(k){ return knownKeys.indexOf(k) >= 0; });
      listSources();
    }

    function disableSource(name){
      var key = resolveSourceKeyInput(name);
      if (!key){ whisper(m.who, 'Usage: <code>!cal source disable &lt;name&gt;</code>'); return; }
      var sourceKeys = sourceDefaultKeys(key);
      if (!sourceKeys.length){ whisper(m.who, 'Source not found: ' + esc(name)); return; }
      var sourceKeySet = {};
      var sup = state[state_name].suppressedDefaults || (state[state_name].suppressedDefaults = {});
      sourceKeys.forEach(function(defKey){
        sourceKeySet[defKey] = 1;
        sup[defKey] = 1;
      });
      var cal = getCal();
      cal.events = cal.events.filter(function(e){
        var src = (e.source != null) ? String(e.source).toLowerCase() : null;
        if (src !== key) return true;
        var maxD = cal.months[e.month-1].days|0;
        var norm = DaySpec.canonicalForKey(e.day, maxD);
        return !sourceKeySet[defaultKeyFor(e.month, norm, e.name)];
      });
      refreshCalendarState(true);
      sendChat(script_name, '/w gm Hidden "'+esc(name)+'" source events in the shared hide/show list.', null, { noarchive: true });
    }

    function enableSource(name){
      var key = resolveSourceKeyInput(name);
      if (!key){ whisper(m.who, 'Usage: <code>!cal source enable &lt;name&gt;</code>'); return; }
      var sourceKeys = sourceDefaultKeys(key);
      if (!sourceKeys.length && !autoSuppressedSources[key]){ whisper(m.who, 'Source not found: ' + esc(name)); return; }
      var sup = state[state_name].suppressedDefaults || (state[state_name].suppressedDefaults = {});
      sourceKeys.forEach(function(defKey){
        delete sup[defKey];
      });
      mergeInNewDefaultEvents(getCal());
      refreshCalendarState(true);
      if (autoSuppressedSources[key]){
        sendChat(script_name, '/w gm Source "'+esc(name)+'" was shown again where allowed, but the current calendar still auto-suppresses that source.', null, { noarchive: true });
      } else {
        sendChat(script_name, '/w gm Shown "'+esc(name)+'" source events again.', null, { noarchive: true });
      }
    }

    if (!sub || sub==='list') return listSources();
    if (sub==='up')   { return movePriority(args.slice(1).join(' '), 'up'); }
    if (sub==='down') { return movePriority(args.slice(1).join(' '), 'down'); }
    if (sub==='disable'){ if (!args[1]) return whisper(m.who,'Usage: <code>!cal source disable &lt;name&gt;</code>'); return disableSource(args.slice(1).join(' ')); }
    if (sub==='enable'){  if (!args[1]) return whisper(m.who,'Usage: <code>!cal source enable &lt;name&gt;</code>');  return enableSource(args.slice(1).join(' ')); }
    whisper(m.who, 'Usage: <code>!cal source [list|up|down|disable|enable] [&lt;name&gt;]</code>');
  }},

  resetcalendar: { gm:true, run:function(){ resetToDefaults(); } },

  // Moon system
  moon:    function(m, a){ handleMoonCommand(m, a.slice(1)); },   // legacy: players=view, GM=edit

  // §5.5 Lunar Current / All — whisper-only panels.
  lunar:   function(m, a){
    var sub = String(a[2] || 'current').toLowerCase();
    if (sub === 'all'){
      var y = parseInt(String(a[3] || ''), 10);
      if (!isFinite(y)) y = getCal().current.year;
      return whisper(m.who, _lunarAllHtml(y));
    }
    return whisper(m.who, _lunarCurrentHtml());
  },

  // §5.5 Planar Current / All — whisper-only panels, Eberron-only.
  planar:  function(m, a){
    var sub = String(a[2] || 'current').toLowerCase();
    if (sub === 'all'){
      var y = parseInt(String(a[3] || ''), 10);
      if (!isFinite(y)) y = getCal().current.year;
      return whisper(m.who, _planarAllHtml(y));
    }
    return whisper(m.who, _planarCurrentHtml());
  },
  planes:  function(m, a){ handlePlanesCommand(m, a.slice(1)); }   // legacy: planes panel
};
