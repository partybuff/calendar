// Sections 13+15+16: Roll20 State Interaction & UI + Themes + GM Buttons
import { CALENDAR_SYSTEMS, CALENDAR_SYSTEM_ORDER, CONFIG_DEFAULTS } from './config.js';
import { COLOR_THEMES, LABELS, NAMED_COLORS, SEASON_SETS, STYLES, THEME_LABELS, THEME_ORDER, script_name, state_name } from './constants.js';
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
  // Weekless / self-contained formats build the whole label themselves — no
  // weekday prefix (Barovia's "21st Night of the Twelfth Moon, 735 BC").
  if (fmt === 'ordinal_of_month' || fmt === 'nights'){
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
  if (fmt === 'ordinal_of_month' || fmt === 'nights'){
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
  if (fmt === 'nights'){
    var moonName = String(m.name || (mi + 1));
    return { monthName: moonName, day: day, label: _ordinal(day) + ' Night of the ' + moonName };
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

// Month stepper — the primary time-walk control. Each step emits an ABSOLUTE
// month-anchored date spec computed from the *viewed* month, so repeated clicks
// walk (Therendor → Nymm → Barrakas …) from anywhere with no stored cursor.
// Rendered on the dashboard and under every `show` output. `This Month` is the
// home key (campaign month); `Year` intentionally snaps to the campaign year
// (`show year`), never the walked-to year — the 12-mini-cal year view is noisy.
export function monthStepperHtml(viewSerial){
  var prevSpec = _serialToDateSpec(_shiftSerialByMonth(viewSerial|0, -1));
  var nextSpec = _serialToDateSpec(_shiftSerialByMonth(viewSerial|0, 1));
  return '<div style="margin:4px 0 2px 0;">' +
    button('‹ Prev', 'show ' + prevSpec) + ' ' +
    button('This Month', 'show month') + ' ' +
    button('Next ›', 'show ' + nextSpec) + ' ' +
    button('Year', 'show year') +
    '</div>';
}

// Nav tail under a `show`/range output: back to the dashboard + the Additional
// hub. Kept separate from the stepper so callers can place them independently.
export function showNavTailHtml(){
  return '<div style="margin:2px 0;">' +
    button('Dashboard', 'today') + ' ' +
    button('Additional', 'additional') +
    '</div>';
}

// Dashboard "views" row — one click into each subsystem's current view.
// World-gated exactly like the Additional hub: Moons only when enabled,
// Planes only on Eberron. Both roles see it (read-only views).
export function dashboardViewsHtml(){
  var st = ensureSettings();
  var isEberron = String(st.calendarSystem || '').toLowerCase() === 'eberron';
  var parts = [ button('Events', 'events current') ];
  if (st.moonsEnabled !== false) parts.push(button('Moons', 'moon summary'));
  if (st.planesEnabled !== false && isEberron) parts.push(button('Planes', 'planar current'));
  return '<div style="margin:2px 0;">' + parts.join(' ') + '</div>';
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
    // Month stepper leads the control stack on the full today view (not the
    // compact `now` line). It walks from the current month. The views row
    // (one-click into each subsystem) follows it, on the dashboard only.
    var stepperHtml = compact ? '' : monthStepperHtml(todaySer);
    var viewsHtml = (dashboard && !compact) ? dashboardViewsHtml() : '';
    if (controlsHtml || stepperHtml || viewsHtml) controls = '<div style="margin-top:2px;">' + stepperHtml + viewsHtml + controlsHtml + '</div>';
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
    var label = THEME_LABELS[n] || titleCase(n);
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
  rows.push('<div>' + mb('Retreat','retreat 1') + ' ' + mb('Advance','advance 1') + ' ' + mb('Send','send') + ' ' + mb('Manage','manage') + '</div>');
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

// GM Settings panel — self-describing flip grid. Dropdowns pick a value;
// each toggle button shows its CURRENT state and emits the OPPOSITE, so one
// click = one flip. `offcycle` is intentionally absent (off-cycle planar
// generation is out of scope). Planes rows show only on Eberron.
export function settingsPanelHtml(){
  var st = ensureSettings();
  var isEberron = String(st.calendarSystem || '') === 'eberron';
  function toggle(key, label, isOn){
    return button(label + ': ' + (isOn ? 'ON' : 'OFF'), 'settings ' + key + ' ' + (isOn ? 'off' : 'on'));
  }
  var choose = '<div style="margin:3px 0;">' +
    button('Density: ' + titleCase(_uiDensityValue('')), 'settings density ?{Density|Compact,compact|Normal,normal}') + ' ' +
    button('Detail: ' + titleCase(_subsystemVerbosityValue()), 'settings verbosity ?{Detail|Normal,normal|Minimal,minimal}') +
    (isEberron ? ' ' + button('Planes View: ' + _displayModeLabel(st.planesDisplayMode), 'settings mode planes ?{Planes view|Calendar,calendar|List,list|Both,both}') : '') +
    '</div>';
  var toggles = '<div style="margin:3px 0;">' +
    toggle('events', 'Events', st.eventsEnabled !== false) + ' ' +
    toggle('moons', 'Moons', st.moonsEnabled !== false) + ' ' +
    (isEberron ? toggle('planes', 'Planes', st.planesEnabled !== false) + ' ' : '') +
    toggle('group', 'Group by source', !!st.groupEventsBySource) + ' ' +
    toggle('labels', 'Source labels', !!st.showSourceLabels) + ' ' +
    toggle('buttons', 'Auto buttons', st.autoButtons === true) +
    '</div>';
  var tail = '<div style="margin-top:6px;">' + button('⤺ Manage', 'manage') + ' ' + button('Dashboard', 'today') + '</div>';
  return _menuBox('⚙️ Settings', choose + toggles + tail);
}

// GM Manage hub — the single home for configuration, relocated out of the
// Help grab-bag. Grouped by concern; the Reset confirm puts the choice at the
// VERB position so Cancel emits a harmless `!cal today` and only "Yes RESET"
// fires `resetcalendar` (which ignores its args, so a value-position guard
// wouldn't work).
export function manageHubHtml(){
  var todaySpec = _serialToDateSpec(todaySerial());
  var head = '<div style="font-size:.8em;opacity:.7;margin:2px 0;">Configuration &amp; publishing — GM only.</div>';
  function grp(label){ return '<div style="margin:6px 0 2px;font-size:.78em;letter-spacing:.04em;text-transform:uppercase;opacity:.6;">' + label + '</div>'; }
  var rows = head +
    grp('World &amp; date') +
    '<div style="margin:2px 0;">' + button('Set Date', 'set ?{Set Date (mm dd yyyy)|' + todaySpec + '}') + ' ' + button('Calendar / Variant', 'calendar list') + '</div>' +
    grp('Display') +
    '<div style="margin:2px 0;">' + button('Settings', 'settings') + ' ' + button('Sources', 'source list') + '</div>' +
    grp('Look &amp; region') +
    '<div style="margin:2px 0;">' + button('Themes', 'theme list') + ' ' + button('Hemisphere', 'hemisphere ?{Hemisphere|North,north|South,south|Status,status}') + '</div>' +
    grp('Publish') +
    '<div style="margin:2px 0;">' + button('Broadcast Today', 'send') + ' ' + button('Broadcast Range', 'send ?{Range|This Month,month|This Year,year|Next Month,next month|Today,today}') + '</div>' +
    grp('Danger') +
    '<div style="margin:2px 0;">' + button('Reset Calendar', '?{Reset the calendar to defaults?|Cancel,today|Yes RESET,resetcalendar}') + '</div>' +
    '<div style="margin-top:6px;">' + button('Dashboard', 'today') + '</div>';
  return _menuBox('🛠️ Manage', rows);
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
  if (curTheme && curTheme !== defTheme) overrides.push(esc(THEME_LABELS[curTheme] || titleCase(curTheme)) + ' theme');

  var configLine = overrides.length ? overrides.join(' &nbsp;·&nbsp; ') : '';

  return _menuBox('Status',
    '<div style="font-size:1.1em;font-weight:bold;">' + curDate + '</div>' +
    timeLine +
    '<div style="font-size:.85em;opacity:.8;margin-top:2px;">' + calLine + '</div>' +
    (configLine ? '<div style="font-size:.75em;opacity:.6;margin-top:2px;">' + configLine + '</div>' : '')
  );
}

export function helpRootMenu(m){
  var isGMNew = playerIsGM(m.playerid);
  var rowsNew = [helpStatusSummaryHtml()];

  // Docs-only reference. Navigation and setup are buttons on the calendar
  // itself now: the month stepper walks time, Additional opens the views,
  // and (GM) Manage holds all configuration. Help just explains what you're
  // looking at.
  var intro = 'The calendar is button-driven — you rarely need to type. Walk months with the '
    + '<b>‹ Prev</b> / <b>Next ›</b> stepper, and open events' + (isGMNew ? ', moons, and planes' : ' and moons')
    + ' from <b>Additional</b>.' + (isGMNew ? ' All setup lives in <b>Manage</b>.' : '')
    + ' These pages explain what you are seeing.';
  var footer = 'Navigate with buttons: the month stepper, <b>Additional</b>'
    + (isGMNew ? ', and <b>Manage</b> (GM setup)' : '') + '.';

  rowsNew.push(taskCardHtml(
    'Reference',
    intro,
    [
      navP(m,'Reading the Calendar','calendar'),
      navP(m,'Themes','themes'),
      navP(m,'Event Colors','eventcolors')
    ],
    footer
  ));

  rowsNew.push('<div style="margin-top:6px;">' + button('Dashboard','today') + ' ' + button('Additional','additional') + '</div>');

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
    _menuBox(ro ? 'Name Variants (view only)' : 'Name Variants', calendarSystemListHtml(ro))
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

// Name variants for the CURRENT world only — a cosmetic month-name swap
// (e.g. Eberron's Galifar / Druidic / Halfling / Dwarven) that leaves dates
// unchanged. Switching to a different world/calendar is not a live setting;
// it happens through `!cal resetcalendar` → setup, because it changes the
// world's dates and data.
export function calendarSystemListHtml(readOnly?){
  var st  = ensureSettings();
  var sysKey = st.calendarSystem;
  var sys = CALENDAR_SYSTEMS[sysKey];
  if (!sys) return '<div style="opacity:.7;">No calendar active.</div>';
  var sLabel = esc(sys.label || titleCase(sysKey));
  var varKeys = sys.variants ? Object.keys(sys.variants) : [];

  var varRows = varKeys.map(function(vk){
    var v      = sys.variants[vk];
    var vLabel = esc(v.label || titleCase(vk));
    var isCur  = st.calendarVariant === vk;
    var head   = readOnly
      ? '<b>'+vLabel+'</b>'+(isCur?' <span style="opacity:.7">(current)</span>':'')
      : button(vLabel, 'calendar '+sysKey+' '+vk)+(isCur?' <span style="opacity:.7">(current)</span>':'');
    var preview = (v.monthNames||[]).slice(0,4).map(esc).join(', ')+(v.monthNames&&v.monthNames.length>4?' …':'');
    return '<div style="margin:3px 0 3px 8px;">'+head+'<br><div style="font-size:.82em;opacity:.7;">'+preview+'</div></div>';
  });

  var note = '<div style="font-size:.8em;opacity:.6;margin-top:8px;">Name variants swap the month-name set only — dates don’t change. To switch to a different calendar, reset with <code>!cal resetcalendar</code> and pick one during setup.</div>';

  return '<div style="margin:4px 0;"><b>Name Variants — '+sLabel+'</b></div>'+
    (varRows.length > 1
      ? varRows.join('')
      : '<div style="opacity:.7;margin-left:8px;">This calendar has a single name set.</div>')+
    note;
}
