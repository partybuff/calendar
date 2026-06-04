// Sections 13+15+16: Roll20 State Interaction & UI + Themes + GM Buttons
import { CALENDAR_SYSTEMS, CALENDAR_SYSTEM_ORDER, CONFIG_DEFAULTS } from './config.js';
import { COLOR_THEMES, LABELS, NAMED_COLORS, SEASON_SETS, STYLES, THEME_ORDER, script_name, state_name } from './constants.js';
import { _seasonNames, _sourceAllowedForCalendar, applySeasonSet, deepClone, defaults, ensureSettings, getCal, refreshAndSend, refreshCalendarState, titleCase } from './state.js';
import { popColorIfPresent, resolveColor, sanitizeHexColor } from './color.js';
import { _isLeapMonth, _nextActiveMi, _prevActiveMi, fromSerial, regularMonthIndex, toSerial, todaySerial, weekdayIndex } from './date-math.js';
import { DaySpec, Parse, monthIndexByName } from './parsing.js';
import { _addConcreteEvent, buildCalendarsHtmlForSpec, defaultKeyFor, eventDisplayName, eventIndexByKey, markSuppressedIfDefault, occurrencesInRange } from './events.js';
import { _decKey, _eventSeriesKey, _ordinal, button, clamp, esc, formatDateLabel, int, mbP, monthEventsHtml, navP, swatchHtml } from './rendering.js';
import { send, sendToAll, sendToGM, sendUiToGM, warnGM, whisper, whisperUi } from './commands.js';
import { MOON_HISTORY_DAYS, _getMoonSys, _moonNextThresholdEntry, _moonPeakPhaseDay, _moonPhaseEmoji, _moonPhaseSpanSuffix, captureMoonHistoryWindow, moonEnsureSequences, moonPhaseAt, pruneMoonHistory, resetMoonHistory } from './moon.js';
import { PLANE_PHASE_EMOJI, PLANE_PHASE_LABELS, _getAllPlaneData, _isGeneratedNote, _planarNotableToday, _planarYearDays, getPlanarState } from './planes.js';
import { dateFormatFor } from './worlds/index.js';


/* ============================================================================
 * 13) Roll20 State Interaction & UI
 * ==========================================================================*/

export function currentDateLabel(){
  var cal = getCal(), cur = cal.current;
  var fmt = dateFormatFor(ensureSettings().calendarSystem);
  if (fmt === 'ordinal_of_month'){
    return formatDateLabel(cur.year, cur.month, cur.day_of_the_month, true);
  }
  var datePart = _displayMonthDayParts(cur.month, cur.day_of_the_month).label;
  return cal.weekdays[cur.day_of_the_week] + ", " +
         datePart + ", " +
         cur.year + " " + LABELS.era;
}

export function formalCurrentDateLabel(){
  var cal = getCal(), cur = cal.current;
  var wd = cal.weekdays[cur.day_of_the_week];
  var base = formatDateLabel(cur.year, cur.month, cur.day_of_the_month, true);
  return wd ? (wd + ', ' + base) : base;
}

export function dateLabelFromSerial(serial){
  var cal = getCal();
  var d = fromSerial(serial);
  var fmt = dateFormatFor(ensureSettings().calendarSystem);
  if (fmt === 'ordinal_of_month'){
    return formatDateLabel(d.year, d.mi, d.day, true);
  }
  var wd = cal.weekdays[weekdayIndex(d.year, d.mi, d.day)];
  var datePart = _displayMonthDayParts(d.mi, d.day).label;
  return wd + ", " + datePart + ", " + d.year + " " + LABELS.era;
}

export function formalDateLabelFromSerial(serial){
  var cal = getCal();
  var d = fromSerial(serial);
  var wd = cal.weekdays[weekdayIndex(d.year, d.mi, d.day)];
  var base = formatDateLabel(d.year, d.mi, d.day, true);
  return wd ? (wd + ', ' + base) : base;
}

export function nextForDayOnly(cur, day, monthsLen){
  var months = getCal().months;
  var want = Math.max(1, day|0);
  var m = cur.month, y = cur.year;

  if (want <= (months[m].days|0) && cur.day_of_the_month <= want &&
      (!months[m].leapEvery || _isLeapMonth(months[m], y))) {
    return { month: m, year: y };
  }

  for (var i = 0; i < monthsLen * 2; i++){
    m = (m + 1) % monthsLen;
    if (m === 0) y++;
    // Skip inactive leap-only months (e.g. Shieldmeet in a non-leap year).
    if (months[m].leapEvery && !_isLeapMonth(months[m], y)) continue;
    if (want <= (months[m].days|0)) return { month: m, year: y };
  }
  var _nxt = _nextActiveMi(cur.month, cur.year);
  return { month: _nxt.mi, year: _nxt.y };
}

export function nextForMonthDay(cur, mIndex, d){
  var mdays = getCal().months[mIndex].days;
  var day = clamp(d, 1, mdays);
  var serialNow = toSerial(cur.year, cur.month, cur.day_of_the_month);
  var serialCand = toSerial(cur.year, mIndex, day);
  if (serialCand >= serialNow) return { year: cur.year };
  return { year: cur.year + 1 };
}

// Returns the display-facing season label for a given calendar position.
// For season sets with transitions (e.g. gregorian), computes the season from
// the exact day rather than just the month. For all others, returns month.season.
export function _getSeasonLabel(mi, day){
  var st    = ensureSettings();
  var sv    = st.seasonVariant || CONFIG_DEFAULTS.seasonVariant;
  var entry = SEASON_SETS[sv] || {};
  if (!entry.transitions){
    // No transition table — read from month.season (set by applySeasonSet, hemisphere-shifted).
    return getCal().months[mi].season || null;
  }
  // Gregorian-style: pick the right transition array based on hemisphere.
  var hem = st.hemisphere || CONFIG_DEFAULTS.hemisphere;
  var tr  = (hem === 'south' && entry.transitionsSouth) ? entry.transitionsSouth : entry.transitions;
  var rmi = regularMonthIndex(mi);
  var cur = rmi * 1000 + (day|0);
  var best = null, bestScore = -1;
  for (var i = 0; i < tr.length; i++){
    var score = tr[i].mi * 1000 + tr[i].day;
    if (score <= cur && score > bestScore){ bestScore = score; best = tr[i].season; }
  }
  // Before the first transition of the year: wrap to the last.
  return best || (tr.length ? tr[tr.length - 1].season : null);
}

export function _uiDensityValue(explicit){
  var d = String(explicit || ensureSettings().uiDensity || CONFIG_DEFAULTS.uiDensity || 'compact').toLowerCase();
  return (d === 'normal') ? 'normal' : 'compact';
}

export function _normalizeDisplayMode(mode){
  var m = String(mode || '').toLowerCase();
  if (m === 'calendar' || m === 'list' || m === 'both') return m;
  return 'both';
}

export function _displayModeLabel(mode){
  var m = _normalizeDisplayMode(mode);
  if (m === 'calendar') return 'Calendar';
  if (m === 'list') return 'List';
  return 'Both';
}

export function _subsystemVerbosityValue(){
  var v = String(ensureSettings().subsystemVerbosity || CONFIG_DEFAULTS.subsystemVerbosity || 'normal').toLowerCase();
  return (v === 'minimal') ? 'minimal' : 'normal';
}

export function _subsystemIsVerbose(){
  return _subsystemVerbosityValue() !== 'minimal';
}

export function _legendLine(items){
  if (!items || !items.length) return '';
  return '<div style="font-size:.76em;opacity:.55;margin:4px 0 6px 0;">Legend: '+items.map(esc).join(' · ')+'</div>';
}

export function _displayMonthDayParts(mi, day){
  var cal = getCal();
  var st = ensureSettings();
  var m = cal.months[mi] || {};
  var fmt = dateFormatFor(st.calendarSystem);
  if (fmt === 'ordinal_of_month'){
    if (m.isIntercalary){
      return { monthName: String(m.name || (mi + 1)), day: day, label: String(m.name || (mi + 1)) };
    }
    return {
      monthName: String(m.name || (mi + 1)),
      day: day,
      label: _ordinal(day) + ' of ' + String(m.name || (mi + 1))
    };
  }
  if (fmt === 'month_day_year' && m.isIntercalary && String(m.name||'') === 'Leap Day'){
    return { monthName: 'February', day: 29, label: 'February 29' };
  }
  return {
    monthName: String(m.name || (mi + 1)),
    day: day,
    label: String(day) + ' ' + String(m.name || (mi + 1))
  };
}

export function _serialToDateSpec(serial){
  var d = fromSerial(serial|0);
  var parts = _displayMonthDayParts(d.mi, d.day);
  return parts.monthName + ' ' + d.day + ' ' + d.year;
}

export function _shiftSerialByMonth(serial, dir){
  var d = fromSerial(serial|0);
  var step = (dir < 0) ? _prevActiveMi(d.mi, d.year) : _nextActiveMi(d.mi, d.year);
  var md = Math.max(1, (getCal().months[step.mi] || {}).days|0);
  var day = clamp(d.day, 1, md);
  return toSerial(step.y, step.mi, day);
}

export function _playerButtonsHtml(){
  // §5.2 public row. Same buttons whether caller is player or GM; the GM
  // row in `gmButtonsHtml` adds Retreat / Advance / Send above this.
  // Players clicking these still get a whispered reply targeted to them.
  return '<div>' + button('Additional','additional') + ' ' + button('Help','help') + '</div>';
}

export function sendCurrentDate(to, gmOnly, opts?){
  opts = opts || {};
  var st = ensureSettings();
  var density = _uiDensityValue(opts.density);
  var dashboard = !!opts.dashboard;
  var compact = !!opts.compact || (!dashboard && density === 'compact');
  var includeButtons = (opts.includeButtons === undefined) ? (st.autoButtons !== false) : !!opts.includeButtons;
  var audienceIsGM = !!gmOnly;
  if (!audienceIsGM && to && opts.playerid) audienceIsGM = !!playerIsGM(opts.playerid);
  if (!audienceIsGM && opts.audienceIsGM === true) audienceIsGM = true;

  var cal = getCal(), c = cal.current;
  var m   = cal.months[c.month];
  var todaySer = toSerial(c.year, c.month, c.day_of_the_month);
  var calHtml = '';
  if (!compact || dashboard){
    // Build a spec for the current month so buildCalendarsHtmlForSpec can
    // attach adjacent strips when today is in the first or last calendar row.
    var monthStart = toSerial(c.year, c.month, 1);
    var monthEnd   = toSerial(c.year, c.month, m.days|0);
    var spec = {
      start:  monthStart,
      end:    monthEnd,
      months: [{ y: c.year, mi: c.month }],
      title:  m.name + ' ' + c.year + ' ' + LABELS.era
    };
    calHtml = buildCalendarsHtmlForSpec(spec);
  }

  // Date headline: formal date line + season line
  var _seasonLabel = _getSeasonLabel(c.month, c.day_of_the_month);
  var currentDate = formalCurrentDateLabel();
  var timeLine = '';
  var dateLine = compact
    ? '<div style="font-weight:bold;margin:2px 0 1px 0;' + (dashboard ? 'font-size:1.02em;color:#000;' : '') + '">' + esc(currentDate) + '</div>'
    : '<div style="font-weight:bold;margin:3px 0 1px 0;' + (dashboard ? 'font-size:1.06em;color:#000;' : '') + '">' + esc(currentDate) + '</div>';
  var dashboardTitle = dashboard
    ? '<div style="font-weight:bold;font-size:1.04em;color:#000;margin:0 0 6px 0;">Today&#39;s Calendar</div>'
    : '';
  var seasonLine = _seasonLabel
    ? (compact
      ? '<div style="' + (dashboard ? 'font-size:.94em;color:#000;margin:0 0 4px 0;font-style:italic;' : 'font-size:.82em;opacity:.7;margin:0 0 3px 0;') + '">' + esc(_seasonLabel) + '</div>'
      : '<div style="' + (dashboard ? 'font-size:.98em;color:#000;margin:0 0 4px 0;font-style:italic;' : 'font-size:.85em;opacity:.72;margin:0 0 4px 0;') + '">' + esc(_seasonLabel) + '</div>')
    : '';
  var dashboardInfoLineStyle = dashboard
    ? 'font-size:.92em;color:#000;margin-top:3px;line-height:1.6;'
    : 'font-size:.82em;opacity:.7;margin-top:3px;line-height:1.6;';
  var dashboardShortLineStyle = dashboard
    ? 'font-size:.92em;color:#000;margin-top:3px;'
    : 'font-size:.82em;opacity:.65;margin-top:2px;';
  var dashboardEventsLineStyle = dashboard
    ? 'font-size:.94em;color:#000;margin-top:3px;'
    : 'font-size:.82em;opacity:.75;margin-top:2px;';
  // Events this month (labeled only when events exist)
  var eventsBlock = (function(){
    if (compact || dashboard) return '';
    var inner = monthEventsHtml(c.month, c.day_of_the_month);
    if (!inner) return '';
    return '<div style="margin-top:5px;font-size:.85em;opacity:.7;">Events this month:</div>' + inner;
  }());

  // Moon highlights — only show moons at notable phases (Full/New today, or arriving within 2 days)
  var moonLine = '';
  if (ensureSettings().moonsEnabled !== false){
    try {
      moonEnsureSequences();
      var _sys = _getMoonSys();
      if (_sys && _sys.moons){
        var _notable = [];

        _sys.moons.forEach(function(moon){
          var ph = moonPhaseAt(moon.name, todaySer);
          var emoji = _moonPhaseEmoji(ph.illum, ph.waxing);
          var _thisNotable = false;
          var titleTag = '';

          // Full or New right now? Use peak detection for single-day reports.
          var _peakType = _moonPeakPhaseDay(moon.name, todaySer);
          if (_peakType === 'full'){
            _notable.push(emoji + ' <b>' + esc(moon.name) + '</b>' + titleTag + ' is Full' + esc(_moonPhaseSpanSuffix(moon.name, todaySer)));
            _thisNotable = true;
            return;
          }
          if (_peakType === 'new'){
            _notable.push(emoji + ' <b>' + esc(moon.name) + '</b>' + titleTag + ' is New' + esc(_moonPhaseSpanSuffix(moon.name, todaySer)));
            _thisNotable = true;
            return;
          }

          var nextEntry = _moonNextThresholdEntry(moon.name, todaySer, 2);
          if (nextEntry){
            var phaseWord = nextEntry.type === 'full' ? 'Full' : 'New';
            var phaseEmoji = nextEntry.type === 'full' ? '\uD83C\uDF15' : '\uD83C\uDF11';
            _notable.push(phaseEmoji + ' <b>' + esc(moon.name) + '</b>' + titleTag + ' ' + phaseWord + ' ' + (nextEntry.days === 1 ? 'tomorrow' : 'in 2 days'));
            _thisNotable = true;
          }

          // Ascendant moons are shown in the Moons view, not the Today view.
        });

        if (_notable.length){
          moonLine = '<div style="' + dashboardInfoLineStyle + '">' +
            _notable.join('<br>') +
            '</div>';
        }

      }
    } catch(e){ /* moon system not ready yet — skip silently */ }
  }

  // Lighting display dropped with time-of-day removal
  var lightingLine = '';

  // Planar highlights — only show planes with notable current state
  var planesLine = '';
  if (audienceIsGM && ensureSettings().planesEnabled !== false){
    try {
      var _plNotes = _planarNotableToday(todaySer);
      if (_plNotes.length){
        planesLine = '<div style="' + dashboardInfoLineStyle + '">' +
          _plNotes.join('<br>') +
          '</div>';
      }
    } catch(e){ /* planes not ready — skip silently */ }
  }

  var todayEventsLine = '';
  try {
    var occ = occurrencesInRange(todaySer, todaySer);
    if (occ.length){
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
      var more = names.length > 3 ? (' <span style="' + (dashboard ? 'color:#000;' : 'opacity:.65;') + '">+' + (names.length - 3) + ' more</span>') : '';
      todayEventsLine = '<div style="' + dashboardEventsLineStyle + '">🎉 ' + shown + more + '</div>';
    }
  } catch(e4){}

  var msgCore;
  if (dashboard){
    msgCore = dashboardTitle + calHtml + dateLine + seasonLine + timeLine +todayEventsLine + moonLine + lightingLine +planesLine;
  } else if (compact){
    msgCore = '<div style="border:1px solid #555;border-radius:4px;padding:6px;margin:4px 0;">' +
      dateLine + seasonLine + timeLine +todayEventsLine + moonLine + lightingLine +planesLine +
      '</div>';
  } else {
    msgCore = calHtml + dateLine + seasonLine + timeLine + moonLine + lightingLine + planesLine + eventsBlock;
  }

  var controls = '';
  if (includeButtons && (gmOnly || to)){
    var isGmRecipient = !!gmOnly || !!(opts.playerid && playerIsGM(opts.playerid));
    var controlsHtml = isGmRecipient ? gmButtonsHtml() : _playerButtonsHtml();
    if (controlsHtml) controls = '<div style="margin-top:2px;">' + controlsHtml + '</div>';
  }
  var publicMsg = msgCore + controls;

  if (gmOnly)    { sendToGM(publicMsg); }
  else if (to)   { whisper(to, publicMsg); }
  else           { sendToAll(publicMsg); }
}

export function _parseSharpColorToken(tok){
  if (!tok || tok[0] !== '#') return null;
  var raw = tok.slice(1).trim();
  var hex = sanitizeHexColor('#'+raw);
  if (hex) return hex;
  var named = NAMED_COLORS[String(raw).toLowerCase()] || null;
  return named;
}

export function parseDatePrefixForAdd(tokens){
  tokens = (tokens || []).filter(Boolean);
  if (!tokens.length) return null;

  var cal = getCal(), cur = cal.current, months = cal.months;

  var r = Parse.looseMDY(tokens.slice(0,3));
  if (r){
    if (r.kind === 'dayOnly'){
      var nx = nextForDayOnly(cur, r.day, months.length);
      var d  = clamp(r.day, 1, months[nx.month].days|0);
      return { used: 1, mHuman: nx.month+1, day: d, year: nx.year };
    } else {
      var d2 = clamp(r.day, 1, months[r.mi].days|0);
      var y  = (r.year != null) ? r.year : nextForMonthDay(cur, r.mi, d2).year;
      return { used: (r.year!=null)?3:2, mHuman: r.mi+1, day: d2, year: y };
    }
  }

  var t0  = tokens[0];
  var od  = Parse.ordinalDay(t0);
  var num = /^\d+$/.test(t0) ? (parseInt(t0,10)|0) : null;
  var dd  = (od != null) ? od : num;
  if (dd != null){
    var nx2 = nextForDayOnly(cur, dd, months.length);
    var d3  = clamp(dd, 1, months[nx2.month].days|0);
    return { used: 1, mHuman: nx2.month+1, day: d3, year: nx2.year };
  }
  return null;
}

export function stepDays(n, opts?){
  opts = opts || {};
  n = (parseInt(n,10) || 0)|0;
  var cal = getCal(), cur = cal.current, wdlen = cal.weekdays.length|0;
  var startSerial = toSerial(cur.year, cur.month, cur.day_of_the_month);
  var dest = startSerial + n;
  var d = fromSerial(dest);
  cur.day_of_the_week = (cur.day_of_the_week + ((n % wdlen) + wdlen)) % wdlen;
  cur.year = d.year; cur.month = d.mi; cur.day_of_the_month = d.day;
  if (ensureSettings().moonsEnabled !== false){
    if (n > 0){
      captureMoonHistoryWindow(Math.max(startSerial, dest - (MOON_HISTORY_DAYS - 1)), dest);
      pruneMoonHistory(dest);
    } else if (n < 0){
      pruneMoonHistory(dest);
    }
  }
  if (opts.announce === false) return;
  sendCurrentDate(null, true, { dashboard:true, includeButtons:true });
}

export function setDate(m, d, y, opts?){
  opts = opts || {};
  var cal=getCal(), cur=cal.current, oldDOW=cur.day_of_the_week;
  var oldY=cur.year, oldM=cur.month, oldD=cur.day_of_the_month;
  var mi = clamp(m, 1, cal.months.length) - 1;
  var di = clamp(d, 1, cal.months[mi].days);
  var yi = int(y, cur.year);
  var nextSerial = toSerial(yi, mi, di);
  var delta = nextSerial - toSerial(oldY, oldM, oldD);
  cur.month = mi; cur.day_of_the_month = di; cur.year = yi;
  var wdlen = cal.weekdays.length;
  cur.day_of_the_week = (oldDOW + ((delta % wdlen) + wdlen)) % wdlen;
  if (ensureSettings().moonsEnabled !== false){
    resetMoonHistory(nextSerial, true);
  }
  if (opts.announce === false) return;
  sendCurrentDate(null, true);
}

/* ============================================================================
 * 15) THEMES, NAMES, SOURCES
 * ==========================================================================*/

export function _orderedKeys(obj, preferred){
  var ks = Object.keys(obj), seen = {}, out = [];
  if (preferred && preferred.length){
    for (var i=0;i<preferred.length;i++){ var k=preferred[i]; if (ks.indexOf(k)!==-1 && !seen[k]){ out.push(k); seen[k]=1; } }
  }
  ks.sort().forEach(function(k){ if (!seen[k]) out.push(k); });
  return out;
}

export function themeListHtml(readOnly?){
  var cur = ensureSettings().colorTheme;
  var names = _orderedKeys(COLOR_THEMES, THEME_ORDER);
  if(!names.length) return '<div style="opacity:.7;">No themes available.</div>';

  var rows = names.map(function(n){
    var label = titleCase(n);
    var head = readOnly
      ? '<b>'+esc(label)+':</b>' + (n===cur ? ' <span style="opacity:.7">(current)</span>' : '')
      : button('Set '+label+':', 'theme '+n) + (n===cur ? ' <span style="opacity:.7">(current)</span>' : '');
    var swatches = (COLOR_THEMES[n]||[]).slice(0,12).map(function(c){
      return '<span title="'+esc(c)+'" style="display:inline-block;width:12px;height:12px;border:1px solid #000;margin-right:2px;background:'+esc(c)+';"></span>';
    }).join('');
    return '<div style="margin:6px 0;">'+ head + '<br>' + swatches + '<br></div>';
  });

  return '<div style="margin:4px 0;"><b>Color Themes</b></div>' + rows.join('');
}

export function colorsNamedListHtml(){
  var items = Object.keys(NAMED_COLORS);
  if(!items.length) return '<div style="opacity:.7;">No named colors.</div>';

  var rows = items.map(function(k){
    var c = NAMED_COLORS[k];
    return '<div style="margin:2px 0;">'+swatchHtml(c)+' <code>'+esc(k)+'</code> — '+esc(c)+'</div>';
  }).join('');

  return '<div style="margin:4px 0;"><b>Named Colors</b></div>'+rows;
}



/* ============================================================================
 * 16) GM BUTTONS & NESTED HELP MENUS
 * ==========================================================================*/

export function mb(label, cmd){ return button(label, cmd); }
export function nav(label, page){ return button(label, 'help '+page); }

export function _menuBox(title, innerHtml){
  return [
    '<div style="border:1px solid #555;border-radius:4px;padding:6px;margin:6px 0;">',
    '<div style="font-weight:bold;margin-bottom:4px;">', esc(title), '</div>',
    innerHtml,
    '</div>'
  ].join('');
}

export function taskCardHtml(title, summary, actions?, detail?){
  var actionHtml = Array.isArray(actions) && actions.length
    ? '<div style="margin-top:6px;">' + actions.filter(Boolean).join(' ') + '</div>'
    : '';
  var detailHtml = detail
    ? '<div style="font-size:.8em;opacity:.68;margin-top:4px;">' + detail + '</div>'
    : '';
  return '<div style="border:1px solid rgba(0,0,0,.14);border-radius:4px;padding:6px;margin:6px 0;">' +
    '<div style="font-weight:bold;margin-bottom:3px;">' + esc(title) + '</div>' +
    '<div style="font-size:.86em;opacity:.9;">' + summary + '</div>' +
    detailHtml +
    actionHtml +
    '</div>';
}

export function gmButtonsHtml(){
  // §5.2 layout: GM row (Retreat / Advance / Send) above the public row
  // (Additional / Help). Single-day steps; multi-day stepping goes
  // through `!cal advance N` / `!cal retreat N` from chat.
  var rows = [];
  rows.push('<div>' + mb('Retreat','retreat 1') + ' ' + mb('Advance','advance 1') + ' ' + mb('Send','send') + '</div>');
  rows.push(_playerButtonsHtml());
  return rows.join('');
}

/**
 * §5.4 Additional hub — whisper-only subsystem launcher.
 *
 * Per DESIGN.md §5.5 the eventual layout is six buttons:
 *   [Events Current]  [Events All]
 *   [Lunar Current]   [Lunar All]
 *   [Planar Current]  [Planar All]   (Eberron only)
 *                                    [← Back]
 *
 * This file ships the foundation: subsystem-level buttons that route
 * to the existing handlers (`!cal events panel`, `!cal moon`,
 * `!cal planes`). The Current/All split lands in PR 2d-b and 2d-c
 * once each subsystem has distinct panels to render.
 *
 * `planesEnabled` and `moonsEnabled` flags suppress their respective
 * buttons. Planar is also suppressed on non-Eberron worlds since the
 * engine only ships canon planar data for Eberron.
 */
export function additionalHubHtml(){
  var st = ensureSettings();
  var sysKey = String(st.calendarSystem || '').toLowerCase();
  var rows = [];
  // §5.5 — each subsystem has a Current panel (per-row state with
  // last/next inflections for Lunar; Past/Today/Upcoming sectioning for
  // Events and Planar) and an All panel (full year listing). Planar is
  // suppressed on non-Eberron worlds since the engine only ships canon
  // planar data for Eberron.
  rows.push('<div>' +
    button('Events Current','events current') + ' ' +
    button('Events All','events all') +
    '</div>');
  if (st.moonsEnabled !== false){
    rows.push('<div>' +
      button('🌙 Lunar Current','lunar current') + ' ' +
      button('🌙 Lunar All','lunar all') +
      '</div>');
  }
  if (st.planesEnabled !== false && sysKey === 'eberron'){
    rows.push('<div>' +
      button('🌀 Planar Current','planar current') + ' ' +
      button('🌀 Planar All','planar all') +
      '</div>');
  }
  rows.push('<div style="margin-top:6px;">' + button('⬅️ Back','') + '</div>');
  return _menuBox('Additional', rows.join(''));
}

export function activeEffectsPanelHtml(){
  var st = ensureSettings();
  var today = todaySerial();
  var sections = [];

  // Planar mechanics (active coterminous/remote, filtered for non-routine signal)
  if (st.planesEnabled !== false){
    var pl = '';
    try {
      var planes = _getAllPlaneData();
      var ypd = _planarYearDays();
      var rows = [];
      for (var i = 0; i < planes.length; i++){
        var ps = getPlanarState(planes[i].name, today);
        if (!ps) continue;
        if (ps.phase !== 'coterminous' && ps.phase !== 'remote') continue;

        // Skip permanently fixed routine states (e.g., Dal Quor/Xoriat) unless generated.
        var isGenerated = _isGeneratedNote(ps.note);
        if (planes[i].type === 'fixed' && !isGenerated) continue;

        // Skip extremely long routine phases unless forced or generated.
        if (ps.phaseDuration != null && ps.phaseDuration > ypd && !ps.overridden && !isGenerated) continue;

        var emoji = PLANE_PHASE_EMOJI[ps.phase] || '⚪';
        var lbl = PLANE_PHASE_LABELS[ps.phase] || ps.phase;
        var next = (ps.daysUntilNextPhase != null && ps.nextPhase)
          ? ' <span style="opacity:.55;font-size:.82em;">(' + esc(PLANE_PHASE_LABELS[ps.nextPhase] || ps.nextPhase) + ' in ' + ps.daysUntilNextPhase + 'd)</span>'
          : '';
        var row = '<div style="margin:3px 0;">'+emoji+' <b>'+esc(ps.plane.name)+'</b> — '+esc(lbl)+next+'</div>';
        var eff = (ps.plane.effects && ps.plane.effects[ps.phase]) || '';
        if (eff){
          row += '<div style="font-size:.82em;opacity:.78;margin-left:14px;">'+esc(eff)+'</div>';
        }
        rows.push(row);
      }

      if (!rows.length){
        pl = '<div style="opacity:.7;">No notable coterminous/remote planar effects are active today.</div>';
      } else {
        pl = rows.join('');
      }
    } catch(e6){
      pl = '<div style="opacity:.7;">Planar data unavailable.</div>';
    }
    sections.push(_menuBox('🌀 Active Planar Effects', pl));
  }

  if (!sections.length){
    sections.push('<div style="opacity:.7;">No active effect systems are enabled.</div>');
  }

  return _menuBox('✨ Active Effects — ' + esc(currentDateLabel()),
    sections.join('')
  );
}

export function helpStatusSummaryHtml(){
  var st      = ensureSettings();
  var curDate = esc(currentDateLabel());
  var timeLine = '';

  // Build system/variant label.
  var sys     = CALENDAR_SYSTEMS[st.calendarSystem] || {};
  var variant = (sys.variants && sys.variants[st.calendarVariant]) || {};
  var sysLabel = esc(sys.label || titleCase(st.calendarSystem || ''));
  var varLabel = esc(variant.label || titleCase(st.calendarVariant || ''));
  var calLine  = (varLabel && varLabel !== sysLabel) ? (sysLabel + ' &mdash; ' + varLabel) : sysLabel;

  // Overrides: only show if they deviate from the variant/system defaults.
  var overrides = [];
  var defTheme  = variant.colorTheme || '';
  var curTheme  = st.colorTheme || '';
  if (curTheme && curTheme !== defTheme) overrides.push(esc(titleCase(curTheme)) + ' theme');
  var defSeason = sys.defaultSeason || CONFIG_DEFAULTS.seasonVariant;
  if (st.seasonVariant && st.seasonVariant !== defSeason) overrides.push(esc(titleCase(st.seasonVariant)) + ' seasons');

  var configLine = overrides.length ? overrides.join(' &nbsp;·&nbsp; ') : '';

  return _menuBox('Status',
    '<div style="font-size:1.1em;font-weight:bold;">' + curDate + '</div>' +
    timeLine +
    '<div style="font-size:.85em;opacity:.8;margin-top:2px;">' + calLine + '</div>' +
    (configLine ? '<div style="font-size:.75em;opacity:.6;margin-top:2px;">' + configLine + '</div>' : '')
  );
}

export function helpRootMenu(m){
  var stNew = ensureSettings();
  var isGMNew = playerIsGM(m.playerid);
  var rowsNew = [helpStatusSummaryHtml()];
  var todaySpec = _serialToDateSpec(todaySerial());
  var promptSet = button('Set Date', 'set ?{Set Date (mm dd yyyy)|' + todaySpec + '}');
  var promptAdd = button('Prompt !cal add', 'add ?{Date of Single Event — Format as DD, MM DD, or MM DD YYYY|' + todaySpec + '} ?{Event name|New Event} ?{Color|#50C878}');
  var promptMonthly = button('Prompt !cal addmonthly', 'addmonthly ?{Date of Monthly Event — Format as DD|first Sul} ?{Event name|Monthly Event} ?{Color|#50C878}');
  var promptYearly = button('Prompt !cal addyearly', 'addyearly ?{Date of Yearly Event — Format as MM DD|Zarantyr 1} ?{Event name|Annual Event} ?{Color|#50C878}');
  var promptMoonOn = button('Prompt !cal moon on', 'moon on ?{Date|' + todaySpec + '}');
  var promptPlanesOn = button('Prompt !cal planes on', 'planes on ?{Date|' + todaySpec + '}');

  rowsNew.push(taskCardHtml(
    'Calendar',
    'Open the campaign dashboard, jump to month or year views, and use prompt-driven buttons for syntax-heavy date commands.',
    [
      mbP(m,'Today','today'),
      mbP(m,'Show Month','show month'),
      mbP(m,'Show Year','show year'),
      promptSet
    ],
    'Typed forms: <code>!cal show month</code>, <code>!cal show year</code>, <code>!cal set &lt;dateSpec&gt;</code>.'
  ));

  if (isGMNew){
    rowsNew.push(taskCardHtml(
      'Events',
      'Add one-off, monthly, and yearly events with prompts or typed commands, then manage source packs separately.',
      [
        mbP(m,'List','list'),
        mbP(m,'Sources','source list'),
        navP(m,'Colors','eventcolors'),
        promptAdd,
        promptMonthly,
        promptYearly
      ],
      'Typed forms: <code>!cal add</code>, <code>!cal addmonthly</code>, <code>!cal addyearly</code>.'
    ));
  }

  if (stNew.moonsEnabled !== false){
    rowsNew.push(taskCardHtml(
      'Moons',
      'Check lunar status without opening the full rules surface first.',
      [
        mbP(m,'Moons','moon'),
        promptMoonOn
      ],
      'Typed forms: <code>!cal moon</code>, <code>!cal moon on &lt;dateSpec&gt;</code>.'
    ));
  }

  if (stNew.planesEnabled !== false){
    rowsNew.push(taskCardHtml(
      'Planes',
      'Review planar movement, active extremes, and known future windows from a compact starting point.',
      [
        mbP(m,'Planes','planes'),
        isGMNew ? mbP(m,'Effects','effects') : '',
        promptPlanesOn
      ],
      'Typed forms: <code>!cal planes</code>, <code>!cal planes on &lt;dateSpec&gt;</code>.'
    ));
  }

  if (isGMNew){
    var plModeNew = _normalizeDisplayMode(stNew.planesDisplayMode);
    var verbNew = _subsystemVerbosityValue();
    rowsNew.push(taskCardHtml(
      'GM Admin',
      'Reach the high-churn admin tools here and keep deeper configuration inside the existing drill-down menus.',
      [
        mbP(m,'Time','time'),
        navP(m,'Supported Settings','calendar'),
        navP(m,'Themes','themes'),
        navP(m,'Seasons','seasons'),
        mbP(m,'Effects','effects')
      ],
      'Views: Planes ' + _displayModeLabel(plModeNew) +
      ' · Detail ' + (verbNew === 'minimal' ? 'minimal' : 'normal') +
      '. Reset: <code>!cal resetcalendar</code>.'
    ));
  }

  whisperUi(m.who, rowsNew.join(''));
  return;
}

export function helpThemesMenu(m){
  var ro = !playerIsGM(m.playerid);
  whisperUi(m.who, _menuBox(ro ? 'Appearance — Themes (view only)' : 'Appearance — Themes', themeListHtml(ro)));
}

export function helpCalendarSystemMenu(m){
  var ro = !playerIsGM(m.playerid);
  whisperUi(m.who,
    _menuBox(ro ? 'Supported Settings (view only)' : 'Supported Settings', calendarSystemListHtml(ro))
  );
}

export function helpEventColorsMenu(m){
  var intro = [
    '<div style="opacity:.85;margin-bottom:6px;">',
    'These are the available <b>named colors for events</b>. ',
    'Any hex (<code>#RRGGBB</code>) is supported, but these names can be used directly. ',
    'Example: <code>!cal add March 14 Feast emerald</code> or ',
    '<code>!cal add 3 14 Feast #50C878</code>.',
    '</div>'
  ].join('');
  whisperUi(m.who,
    _menuBox('Event Colors', intro + colorsNamedListHtml())
  );
}

export function helpSeasonsMenu(m){
  var ro = !playerIsGM(m.playerid);
  whisperUi(m.who,
    _menuBox(ro ? 'Season Variants (view only)' : 'Season Variants', seasonSetListHtml(ro))
  );
}

export function seasonSetListHtml(readOnly?){
  var st  = ensureSettings();
  var cur = st.seasonVariant || (CALENDAR_SYSTEMS[st.calendarSystem] || {}).defaultSeason || CONFIG_DEFAULTS.seasonVariant;
  var names = _orderedKeys(SEASON_SETS, ['eberron','faerun','gregorian','tropical']);
  if(!names.length) return '<div style="opacity:.7;">No season sets.</div>';

  var rows = names.map(function(n){
    var label = titleCase(n);
    var head = readOnly
      ? '<b>'+esc(label)+':</b>'+(n===cur?' <span style="opacity:.7">(current)</span>':'')
      : button('Set '+label+':', 'seasons '+n)+(n===cur?' <span style="opacity:.7">(current)</span>':'');
    var preview = (_seasonNames(n)||[]).map(esc).join(', ');
    return '<div style="margin:6px 0;">'+ head + '<br><div style="opacity:.85;">'+preview+'</div><br></div>';
  });

  return '<div style="margin:4px 0;"><b>Season Sets</b></div>'+rows.join('');
}

export function calendarSystemListHtml(readOnly?){
  var st   = ensureSettings();
  var keys = _orderedKeys(CALENDAR_SYSTEMS, CALENDAR_SYSTEM_ORDER);
  if (!keys.length) return '<div style="opacity:.7;">No calendar systems defined.</div>';

  var rows = keys.map(function(sysKey){
    var sys   = CALENDAR_SYSTEMS[sysKey];
    var sLabel = esc(sys.label || titleCase(sysKey));
    var desc   = sys.description ? '<div style="font-size:.82em;opacity:.65;margin-bottom:4px;">'+esc(sys.description)+'</div>' : '';
    var varKeys = sys.variants ? Object.keys(sys.variants) : [];
    var varRows = varKeys.map(function(vk){
      var v     = sys.variants[vk];
      var vLabel = esc(v.label || titleCase(vk));
      var isCur  = st.calendarSystem === sysKey && st.calendarVariant === vk;
      var head   = readOnly
        ? '<b>'+vLabel+'</b>'+(isCur?' <span style="opacity:.7">(current)</span>':'')
        : button(vLabel, 'calendar '+sysKey+' '+vk)+(isCur?' <span style="opacity:.7">(current)</span>':'');
      var preview = (v.monthNames||[]).slice(0,4).map(esc).join(', ')+(v.monthNames&&v.monthNames.length>4?' …':'');
      return '<div style="margin:3px 0 3px 8px;">'+head+'<br><div style="font-size:.82em;opacity:.7;">'+preview+'</div></div>';
    });
    return '<div style="margin:8px 0;">'+
      '<div style="font-weight:bold;margin-bottom:2px;">'+sLabel+'</div>'+
      desc + varRows.join('') +
      '</div>';
  });

  return '<div style="margin:4px 0;"><b>Supported Settings</b></div>'+rows.join('<hr style="border:none;border-top:1px solid #444;margin:4px 0;">');
}
