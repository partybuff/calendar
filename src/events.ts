// Sections 7+9+10+12: Events Model + Range Engine + Occurrences + Event Lists
import { CONFIG_DEFAULTS, CONFIG_NEARBY_DAYS } from './config.js';
import { LABELS, PALETTE, RANGE_CAP_YEARS, STYLES, script_name, state_name } from './constants.js';
import { _sourceAllowedForCalendar, deepClone, defaults, effectiveSuppressedSources, ensureSettings, getCal, sourceDisplayLabel, titleCase, weekLength } from './state.js';
import { _stableHash, resolveColor } from './color.js';
import { _daysBeforeYear, _isLeapMonth, _nextActiveMi, _prevActiveMi, _serialCache, daysPerYear, fromSerial, toSerial, todaySerial, weekStartSerial, weekdayIndex } from './date-math.js';
import { DaySpec, Parse, isTodayVisibleInRange } from './parsing.js';
import { _calendarCellInnerHtml, _renderHarptosFestivalStrip, clamp, closeMonthTable, esc, eventLineHtml, formatDateLabel, makeDayCtx, openMonthTable, renderMiniCal, renderMonthTable, tdHtmlForDay, yearHTMLFor } from './rendering.js';
import { _displayMonthDayParts, _menuBox, currentDateLabel, nextForDayOnly, nextForMonthDay } from './ui.js';
import { send, sendToAll, whisper } from './commands.js';
import { intercalaryRenderFor } from './worlds/index.js';


/* ============================================================================
 * 7) EVENTS MODEL
 * ==========================================================================*/

export function eventDisplayName(e){
  var base = String(e && e.name || '').trim();
  if (!base) return '';
  var st = ensureSettings();
  var src = (e && e.source!=null) ? titleCase(sourceDisplayLabel(String(e.source))) : null;
  return (src && st.showSourceLabels) ? (base + ' (' + src + ')') : base;
}

export function eventKey(e){ var y = (e.year==null)?'ALL':String(e.year|0); return (e.month|0)+'|'+String(e.day)+'|'+y+'|'+String(e.name||'').trim().toLowerCase(); }

export function eventIndexByKey(key){
  key = String(key||'').trim().toLowerCase();
  var evs = getCal().events || [];
  for (var i=0;i<evs.length;i++){
    if (eventKey(evs[i]).toLowerCase() === key) return i;
  }
  return -1;
}

export function defaultKeyFor(monthHuman, daySpec, name){ return (monthHuman|0)+'|'+String(daySpec)+'|ALL|'+String(name||'').trim().toLowerCase(); }

export var eventsAPI = {
  forDay:   function(monthIndex, day, year){ return getEventsFor(monthIndex, day, year); },
  forRange: function(startSerial, endSerial){ return occurrencesInRange(startSerial, endSerial); },
  colorFor: getEventColor,
  isDefault: isDefaultEvent
};

export var renderAPI = {
  month:        function(opts){ return renderMonthTable(opts); },
  monthGrid:    function(mi, yearLabel, dimPast){ return renderMiniCal(mi, yearLabel, dimPast); },
  year:         function(y, dimPast){ return yearHTMLFor(y, dimPast); },
  range:        function(spec){ return buildCalendarsHtmlForSpec(spec); },
  eventListForRange: function(title, startSerial, endSerial, forceYearLabel){
    return eventsListHTMLForRange(title, startSerial, endSerial, forceYearLabel);
  }
};

export function compareEvents(a, b){
  var ya = (a.year==null)? -Infinity : (a.year|0);
  var yb = (b.year==null)? -Infinity : (b.year|0);
  if (ya !== yb) return ya - yb;
  var am = (+a.month||1), bm = (+b.month||1);
  if (am !== bm) return am - bm;
  return DaySpec.first(a.day) - DaySpec.first(b.day);
}

// Sort an events array so that user events (source=null) come first,
// then sources in their configured priority order, then unranked sources.
// Stable: equal-ranked events preserve their incoming order.
export function sortEventsByPriority(events){
  var pList = (ensureSettings().eventSourcePriority || []).map(function(s){
    return String(s).toLowerCase();
  });
  function rank(e){
    if (!e.source) return 0;                          // user events always first
    var idx = pList.indexOf(String(e.source).toLowerCase());
    return idx >= 0 ? idx + 1 : pList.length + 1;    // unranked → tied last
  }
  return events.slice().sort(function(a, b){ return rank(a) - rank(b); });
}

export function currentDefaultKeySet(cal){
  var sysKey = ensureSettings().calendarSystem || CONFIG_DEFAULTS.calendarSystem;
  var lim = Math.max(1, cal.months.length);
  var out = {};
  deepClone(defaults.events).forEach(function(de){
    var src = (de.source != null) ? String(de.source).toLowerCase() : null;
    if (src && !_sourceAllowedForCalendar(src, sysKey)) return;
    var months = (String(de.month).toLowerCase()==='all')
      ? (function(){ var a=[]; for (var i=1;i<=lim;i++) a.push(i); return a; })()
      : [ clamp(parseInt(de.month,10)||1, 1, lim) ];
    months.forEach(function(m){
      var maxD = cal.months[m-1].days|0;
      var norm = DaySpec.canonicalForKey(de.day, maxD);
      out[ defaultKeyFor(m, norm, de.name) ] = 1;
    });
  });
  return out;
}

export function isDefaultEvent(ev){
  var calLocal = getCal();
  var defaultsSet = currentDefaultKeySet(calLocal);
  var maxD = calLocal.months[ev.month-1].days|0;
  var norm = DaySpec.canonicalForKey(ev.day, maxD);
  var k = defaultKeyFor(ev.month, norm, ev.name);
  return !!defaultsSet[k];
}

export function markSuppressedIfDefault(ev){
  if (!state[state_name].suppressedDefaults) state[state_name].suppressedDefaults = {};
  if (isDefaultEvent(ev)){
    var calLocal = getCal();
    var maxD = calLocal.months[ev.month-1].days|0;
    var norm = DaySpec.canonicalForKey(ev.day, maxD);
    var k = defaultKeyFor(ev.month, norm, ev.name);
    state[state_name].suppressedDefaults[k] = 1;
  }
}

export function mergeInNewDefaultEvents(cal){
  var sysKey = ensureSettings().calendarSystem || CONFIG_DEFAULTS.calendarSystem;
  var lim = Math.max(1, cal.months.length);
  var suppressed = state[state_name].suppressedDefaults || {};
  var suppressedSources = effectiveSuppressedSources();
  var defaultsSet = currentDefaultKeySet(cal);

  // Remove out-of-scope default-source events for the active calendar.
  cal.events = (cal.events || []).filter(function(e){
    var src = (e && e.source != null) ? String(e.source).toLowerCase() : null;
    if (!src) return true;
    if (_sourceAllowedForCalendar(src, sysKey) && !suppressedSources[src]) return true;
    var mObj = cal.months[(e.month|0) - 1];
    var maxD = mObj ? (mObj.days|0) : 28;
    var norm = DaySpec.canonicalForKey(e.day, maxD);
    var key = defaultKeyFor(e.month, norm, e.name);
    return !defaultsSet[key];
  });

  var have = {};
  cal.events.forEach(function(e){
    var yKey = (e.year==null) ? 'ALL' : (e.year|0);
    have[(e.month|0)+'|'+String(e.day)+'|'+yKey+'|'+String(e.name||'').trim().toLowerCase()] = 1;
  });

  deepClone(defaults.events).forEach(function(de){
    var src = (de.source != null) ? String(de.source).toLowerCase() : null;
    if (src && !_sourceAllowedForCalendar(src, sysKey)) return;
    if (src && suppressedSources[src]) return;

    var monthsList = (String(de.month).toLowerCase() === 'all')
      ? (function(){ var a=[]; for (var i=1;i<=lim;i++) a.push(i); return a; })()
      : [ clamp(parseInt(de.month,10)||1, 1, lim) ];

    monthsList.forEach(function(m){
      var maxD = cal.months[m-1].days|0;
      var normDay = DaySpec.canonicalForKey(de.day, maxD);
      var key = m+'|'+String(normDay)+'|ALL|'+String(de.name||'').trim().toLowerCase();
      if (!have[key] && !suppressed[key]) {
        cal.events.push({
          name: String(de.name||''),
          month: m,
          day: normDay,
          year: null,
          color: resolveColor(de.color) || null,
          source: (de.source != null) ? String(de.source) : null
        });
        have[key] = 1;
      }
    });
  });

  cal.events.sort(compareEvents);
}

export function autoColorForEvent(e){ return PALETTE[_stableHash(e && e.name) % PALETTE.length]; }
export function getEventColor(e){ return resolveColor(e && e.color) || autoColorForEvent(e) || '#FF00DD'; }

export function _addConcreteEvent(monthHuman, daySpec, yearOrNull, name, color){
  var cal = getCal();
  var m = clamp(monthHuman, 1, cal.months.length);
  var maxD = cal.months[m-1].days|0;

  var ows = Parse.ordinalWeekday.fromSpec(daySpec);
  var normDay = ows
    ? String(daySpec).toLowerCase().trim()
    : DaySpec.normalize(daySpec, maxD);

  if (!normDay) return false;

  var col = resolveColor(color) || null;
  var e = { name: String(name||''), month: m, day: normDay, year: (yearOrNull==null? null : (yearOrNull|0)), color: col };
  var key = eventKey(e);
  var exists = cal.events.some(function(ev){ return eventKey(ev)===key; });
  if (exists) return false;
  cal.events.push(e);
  cal.events.sort(compareEvents);
  return true;
}

export function getEventsFor(monthIndex, day, year){
  var m = monthIndex|0, out=[];
  var events = getCal().events;
  var y = (typeof year === 'number') ? (year|0) : getCal().current.year;
  if (!events || !events.length) return [];
  for (var i=0;i<events.length;i++){
    var e = events[i];
    if (((parseInt(e.month,10)||1)-1) !== m) continue;
    if (e.year != null && (e.year|0) !== y) continue;
    var ows = Parse.ordinalWeekday.fromSpec(e.day);
    if (ows){
      if (ows.ord === 'every'){
        if (weekdayIndex(y, m, day) === ows.wdi) out.push(e);
      } else {
        var od = dayFromOrdinalWeekday(y, m, ows);
        if (od === day) out.push(e);
      }
    } else if (DaySpec.matches(e.day)(day)) {
      out.push(e);
    }
  }
  return out;
}



/* ============================================================================
 * 9) RANGE ENGINE + NEARBY EXTENSION
 * ==========================================================================*/

export function _firstWeekdayOfMonth(year, mi, wdi){
  var first = weekdayIndex(year, mi, 1);
  var delta = (wdi - first + getCal().weekdays.length) % getCal().weekdays.length;
  return 1 + delta;
}

export function _nthWeekdayOfMonth(year, mi, wdi, nth){
  var mdays = getCal().months[mi].days|0;
  var first = _firstWeekdayOfMonth(year, mi, wdi);
  var day = first + (nth-1)*weekLength();
  return (day<=mdays) ? day : null;
}

export function _lastWeekdayOfMonth(year, mi, wdi){
  var mdays = getCal().months[mi].days|0;
  var lastWd = weekdayIndex(year, mi, mdays);
  var delta = (lastWd - wdi + getCal().weekdays.length) % getCal().weekdays.length;
  var day = mdays - delta;
  return day>=1 ? day : null;
}

export function _tokenizeRangeArgs(args){ return (args||[]).map(function(t){return String(t).trim();}).filter(Boolean); }

export function _isPhrase(tok){ return /^(month|year|current|this|next|previous|prev|last|today|now)$/.test(String(tok||'').toLowerCase()); }

export function dayFromOrdinalWeekday(year, mi, ow){
  if (!ow) return null;
  if (ow.ord === 'last') return _lastWeekdayOfMonth(year, mi, ow.wdi);
  var nth = {first:1, second:2, third:3, fourth:4, fifth:5}[ow.ord] || 1;
  var d = _nthWeekdayOfMonth(year, mi, ow.wdi, nth);
  return (d==null) ? _lastWeekdayOfMonth(year, mi, ow.wdi) : d;
}

export function _allWeekdaysInMonth(year, mi, wdi){
  var mdays = getCal().months[mi].days|0;
  var first = _firstWeekdayOfMonth(year, mi, wdi);
  var out = [];
  for (var d = first; d <= mdays; d += weekLength()){ out.push(d); }
  return out;
}

export function _phraseToSpec(tokens){
  var cal = getCal(), cur=cal.current, months=cal.months, dpy = daysPerYear();
  var t0 = (tokens[0]||'').toLowerCase();
  var t1 = (tokens[1]||'').toLowerCase();
  function monthRange(y, mi, title){
    var md = months[mi].days|0;
    return { title:title, start: toSerial(y, mi, 1), end: toSerial(y, mi, md), months:[{y:y,mi:mi}] };
  }
  function yearRange(y, title){
    var s   = toSerial(y, 0, 1);
    var end = toSerial(y + 1, 0, 1) - 1; // exact year boundary regardless of leap
    // Filter out inactive leap months for this specific year.
    var mList = months.map(function(_, i){ return {y:y, mi:i}; })
                      .filter(function(e){ var m=months[e.mi]; return !m.leapEvery || _isLeapMonth(m, y); });
    return { title:title, start:s, end:end, months:mList };
  }
  if (t0==='today' || t0==='now'){ return monthRange(cur.year, cur.month, 'Today — '+currentDateLabel()); }
  if (t0==='month' || ((t0==='this'||t0==='current') && (t1==='month'||!t1))){ return monthRange(cur.year, cur.month, 'This Month'); }
  if (t0==='year'  || ((t0==='this'||t0==='current') && (t1==='year'||!t1))){ return yearRange(cur.year, 'This Year '+cur.year+' '+LABELS.era); }
  if (t0==='next' && (!t1 || t1==='month')){ var _nm=_nextActiveMi(cur.month,cur.year); return monthRange(_nm.y, _nm.mi, 'Next Month ('+months[_nm.mi].name+')'); }
  if (t0==='next' && t1==='year'){ return yearRange(cur.year+1, 'Next Year '+(cur.year+1)+' '+LABELS.era); }
  if ((t0==='last'||t0==='previous'||t0==='prev') && (!t1 || t1==='month')){
    var _pm=_prevActiveMi(cur.month,cur.year);
    return monthRange(_pm.y, _pm.mi, 'Last Month ('+months[_pm.mi].name+')');
  }
  if ((t0==='last'||t0==='previous'||t0==='prev') && t1==='year'){ return yearRange(cur.year-1, 'Last Year '+(cur.year-1)+' '+LABELS.era); }
  return null;
}

export function _calendarMonthRange(y, mi, title){
  var months = getCal().months;
  var md = months[mi].days|0;
  return {
    title: title || (months[mi].name + ' ' + y + ' ' + LABELS.era),
    start: toSerial(y, mi, 1),
    end: toSerial(y, mi, md),
    months: [{ y:y, mi:mi }]
  };
}

export function _calendarYearRange(y, title){
  var months = getCal().months;
  var s = toSerial(y, 0, 1);
  var end = toSerial(y + 1, 0, 1) - 1;
  var mList = months.map(function(_, i){ return { y:y, mi:i }; })
    .filter(function(entry){
      var m = months[entry.mi];
      return !m.leapEvery || _isLeapMonth(m, y);
    });
  return {
    title: title || ('Year ' + y + ' ' + LABELS.era),
    start: s,
    end: end,
    months: mList
  };
}

function _activeMonthCountForYear(year){
  var months = getCal().months;
  var count = 0;
  for (var i = 0; i < months.length; i++){
    var m = months[i];
    if (!m.leapEvery || _isLeapMonth(m, year)) count++;
  }
  return Math.max(1, count);
}

function _nextSpecificMonthOccurrence(anchorSerial, targetMi){
  var cal = getCal();
  var anchor = fromSerial(anchorSerial|0);
  var year = anchor.year;
  if (targetMi < anchor.mi) year++;
  while (true){
    var month = cal.months[targetMi];
    if (!month.leapEvery || _isLeapMonth(month, year)){
      return { y: year, mi: targetMi };
    }
    year++;
  }
}

function _rollingCalendarRange(anchorSerial){
  var anchor = fromSerial(anchorSerial|0);
  var activeCount = _activeMonthCountForYear(anchor.year);
  var prev = _prevActiveMi(anchor.mi, anchor.year);
  var months = [{ y: prev.y, mi: prev.mi }, { y: anchor.year, mi: anchor.mi }];
  var cursorY = anchor.year;
  var cursorMi = anchor.mi;
  var followCount = Math.max(0, activeCount - 2);
  for (var i = 0; i < followCount; i++){
    var next = _nextActiveMi(cursorMi, cursorY);
    cursorY = next.y;
    cursorMi = next.mi;
    months.push({ y: cursorY, mi: cursorMi });
  }
  var first = months[0];
  var last = months[months.length - 1];
  var lastMonth = getCal().months[last.mi];
  return {
    title: 'Rolling ' + activeCount + ' Months',
    start: toSerial(first.y, first.mi, 1),
    end: toSerial(last.y, last.mi, lastMonth.days|0),
    months: months
  };
}

function _additionalRangeMonthNameYear(mi, year){
  return getCal().months[mi].name + ' ' + year;
}

// Escape a label/value so it can appear inside a nested Roll20 query without
// being split by the outer query's '|' or ',' delimiters.  The outer query
// treats '\{...\}' blocks as atomic text, so we use HTML entities here and
// Roll20 decodes them back to '|' / ',' when it re-evaluates the inner query.
function _escapeNestedQueryPart(text){
  return String(text || '')
    .replace(/\|/g, '&#124;')
    .replace(/,/g, '&#44;');
}

function _buildNestedQueryMenu(promptLabel, options){
  var out = ['?\\{' + _escapeNestedQueryPart(promptLabel)];
  for (var i = 0; i < options.length; i++){
    out.push('&#124;' + _escapeNestedQueryPart(options[i].label) + '&#44;' + _escapeNestedQueryPart(options[i].value));
  }
  out.push('\\}');
  return out.join('');
}

function _buildNestedPromptQuery(promptLabel, defaultValue){
  var out = '?\\{' + _escapeNestedQueryPart(promptLabel);
  if (defaultValue != null && String(defaultValue) !== ''){
    out += '&#124;' + _escapeNestedQueryPart(defaultValue);
  }
  return out + '\\}';
}

function _upcomingMonthPromptOptions(anchorSerial){
  var cal = getCal();
  var anchor = fromSerial(anchorSerial|0);
  var opts = [];
  for (var i = 0; i < cal.months.length; i++){
    var next = _nextSpecificMonthOccurrence(anchorSerial, i);
    if (next.y === anchor.year && next.mi === anchor.mi) continue;
    var nameYear = _additionalRangeMonthNameYear(i, next.y);
    opts.push({
      label: nameYear + ' ' + LABELS.era,
      value: 'month ' + nameYear,
      sortSerial: toSerial(next.y, next.mi, 1),
      sortMi: next.mi
    });
  }
  opts.sort(function(a, b){
    return (a.sortSerial - b.sortSerial) || (a.sortMi - b.sortMi);
  });
  return opts;
}

function _specificMonthPromptDefault(anchorSerial){
  var anchor = fromSerial(anchorSerial|0);
  var next = _nextActiveMi(anchor.mi, anchor.year);
  return _additionalRangeMonthNameYear(next.mi, next.y);
}

export function buildAdditionalRangesCommand(commandPrefix, anchorSerial?){
  var anchor = isFinite(parseInt(anchorSerial, 10)) ? (parseInt(anchorSerial, 10)|0) : todaySerial();
  var year = fromSerial(anchor).year;
  var activeCount = _activeMonthCountForYear(year);
  var upcomingOptions = _upcomingMonthPromptOptions(anchor);
  return String(commandPrefix || '').trim() +
    ' ?{Range|Full Calendar Year (' + year + '),year ' + year +
    '|Rolling ' + activeCount + ' Months,rolling ' + anchor +
    '|Upcoming Month,' + _buildNestedQueryMenu('Upcoming Month', upcomingOptions) +
    '|Specific Month,specific ' + _buildNestedPromptQuery('Month', _specificMonthPromptDefault(anchor)) + '}';
}

export function resolveAdditionalRangeSpec(args, anchorSerial?){
  var tokens = _tokenizeRangeArgs(args);
  var anchor = isFinite(parseInt(anchorSerial, 10)) ? (parseInt(anchorSerial, 10)|0) : todaySerial();
  var sub = String(tokens[0] || '').toLowerCase();

  if (sub === 'year'){
    var explicitYear = parseInt(tokens[1], 10);
    var year = isFinite(explicitYear) ? explicitYear : fromSerial(anchor).year;
    return _calendarYearRange(year, 'Full Calendar Year (' + year + ')');
  }

  if (sub === 'rolling' || sub === 'upcoming'){
    var rollingAnchor = parseInt(tokens[1], 10);
    if (!isFinite(rollingAnchor)) rollingAnchor = anchor;
    return _rollingCalendarRange(rollingAnchor);
  }

  if (sub === 'month' || sub === 'specific'){
    var monthTokens = tokens.slice(1);
    if (sub === 'specific' && String(monthTokens[0] || '').toLowerCase() === 'month'){
      monthTokens = monthTokens.slice(1);
    }
    var monthSpec = _parseTopLevelCalendarSpec(monthTokens);
    if (monthSpec) return monthSpec;
    return null;
  }

  if (tokens.length === 1 && /^-?\d+$/.test(tokens[0])){
    return _calendarYearRange(parseInt(tokens[0], 10), 'Full Calendar Year (' + parseInt(tokens[0], 10) + ')');
  }

  return _parseTopLevelCalendarSpec(tokens);
}

export function _deliverAdditionalCalendarRange(opts){
  opts = opts || {};
  var spec = resolveAdditionalRangeSpec(opts.args || [], opts.anchorSerial);
  if (!spec){
    if (opts.who) whisper(opts.who, _topLevelCalendarGuidanceHtml(opts.args || []));
    return false;
  }
  var html = (typeof opts.render === 'function') ? opts.render(spec) : buildCalendarsHtmlForSpec(spec);
  if (opts.dest === 'broadcast') sendToAll(html);
  else whisper(opts.who, html);
  return true;
}

export function _parseTopLevelCalendarSpec(tokens){
  tokens = _tokenizeRangeArgs(tokens);
  var cal = getCal();
  var cur = cal.current;
  var months = cal.months;

  if (!tokens.length) return _calendarMonthRange(cur.year, cur.month, 'This Month');

  if (tokens.length && _isPhrase(tokens[0].toLowerCase())){
    var phraseSpec = _phraseToSpec(tokens);
    if (phraseSpec) return phraseSpec;
  }

  var ow = Parse.ordinalWeekday.fromTokens(tokens);
  if (ow){
    var owYear = (typeof ow.year === 'number') ? ow.year : cur.year;
    var owMi = (ow.mi !== -1) ? ow.mi : cur.month;
    return _calendarMonthRange(owYear, owMi, months[owMi].name + ' ' + owYear + ' ' + LABELS.era);
  }

  var md = Parse.monthYearLoose(tokens);
  if (md.mi !== -1 && md.day != null && md.year != null){
    return _calendarMonthRange(md.year, md.mi, months[md.mi].name + ' ' + md.year + ' ' + LABELS.era);
  }
  if (md.mi !== -1 && md.day != null){
    var day = clamp(md.day, 1, months[md.mi].days|0);
    var nextY = nextForMonthDay(cur, md.mi, day).year;
    return _calendarMonthRange(nextY, md.mi, months[md.mi].name + ' ' + nextY + ' ' + LABELS.era);
  }
  if (md.mi !== -1 && md.year != null){
    return _calendarMonthRange(md.year, md.mi, months[md.mi].name + ' ' + md.year + ' ' + LABELS.era);
  }
  if (md.mi !== -1){
    var y = (md.mi >= cur.month) ? cur.year : (cur.year + 1);
    return _calendarMonthRange(y, md.mi, months[md.mi].name + ' ' + y + ' ' + LABELS.era);
  }
  if (md.year != null && md.day == null){
    return _calendarYearRange(md.year, 'Year ' + md.year + ' ' + LABELS.era);
  }

  return null;
}

export function _topLevelCalendarGuidanceHtml(tokens){
  tokens = _tokenizeRangeArgs(tokens);
  var entered = tokens.length ? ('<div style="margin-bottom:4px;"><code>!cal ' + esc(tokens.join(' ')) + '</code> does not map cleanly to a month view.</div>') : '';
  return _menuBox('Calendar Jump Syntax',
    entered +
    '<div style="opacity:.82;">Top-level <code>!cal</code>, <code>!cal show</code>, and <code>!cal send</code> jumps render whole months or years.</div>' +
    '<div style="margin-top:5px;">Use a month name, a month plus year, or a full date that includes a month:</div>' +
    '<div style="margin-top:4px;"><code>!cal Zarantyr</code><br><code>!cal Zarantyr 998</code><br><code>!cal Rhaan 14</code><br><code>!cal next month</code><br><code>!cal this year</code></div>' +
    '<div style="margin-top:5px;opacity:.72;">Bare day-only inputs like <code>!cal 14</code> or <code>!cal 1st</code> are not supported here.</div>'
  );
}

export function _deliverTopLevelCalendarRange(opts){
  opts = opts || {};
  var spec = _parseTopLevelCalendarSpec(opts.args || []);
  if (!spec){
    if (opts.who) whisper(opts.who, _topLevelCalendarGuidanceHtml(opts.args || []));
    return false;
  }
  var calHtml = buildCalendarsHtmlForSpec(spec);
  if (opts.dest === 'broadcast') sendToAll(calHtml);
  else whisper(opts.who, calHtml);
  return true;
}

export function parseUnifiedRange(tokens){
  if (tokens.length && _isPhrase(tokens[0].toLowerCase())){
    var ps = _phraseToSpec(tokens);
    if (ps) return ps;
  }

  var cal=getCal(), cur=cal.current, months=cal.months, dpy=daysPerYear();

  var ow = Parse.ordinalWeekday.fromTokens(tokens);
  if (ow){
    var year = (typeof ow.year==='number') ? ow.year : cur.year;
    var mi   = (ow.mi!==-1) ? ow.mi : cur.month;
    var day;
    if (ow.ord==='last') day = _lastWeekdayOfMonth(year, mi, ow.wdi);
    else {
      var nth = {first:1,second:2,third:3,fourth:4,fifth:5}[ow.ord]||1;
      day = _nthWeekdayOfMonth(year, mi, ow.wdi, nth);
      if (day==null){ day = _lastWeekdayOfMonth(year, mi, ow.wdi); }
    }
    var start = toSerial(year, mi, day), end = start;
    return {
      title: (ow.ord==='last' ? 'Last ' : (String(ow.ord).charAt(0).toUpperCase()+String(ow.ord).slice(1)+' ')) + getCal().weekdays[ow.wdi] + ' — ' + formatDateLabel(year, mi, day, true),
      start:start, end:end, months:[{y:year,mi:mi}]
    };
  }

  var md = Parse.monthYearLoose(tokens);

  if (md.mi!==-1 && md.day!=null && md.year!=null){
    var dClamp = clamp(md.day, 1, months[md.mi].days);
    var s = toSerial(md.year, md.mi, dClamp);
    return { title:'Events — '+formatDateLabel(md.year, md.mi, dClamp, true),
             start:s, end:s, months:[{y:md.year,mi:md.mi}] };
  }
  if (md.mi!==-1 && md.day!=null){
    var nextY = nextForMonthDay(cur, md.mi, md.day).year;
    var d2 = clamp(md.day, 1, months[md.mi].days);
    var s2 = toSerial(nextY, md.mi, d2);
    return { title:'Next ' + _displayMonthDayParts(md.mi, d2).label, start:s2, end:s2, months:[{y:nextY,mi:md.mi}] };
  }
  if (md.day!=null && md.mi===-1){
    var nextMY = nextForDayOnly(cur, md.day, months.length);
    var d3 = clamp(md.day, 1, months[nextMY.month].days);
    var s3 = toSerial(nextMY.year, nextMY.month, d3);
    return { title:'Next ' + _displayMonthDayParts(nextMY.month, d3).label, start:s3, end:s3, months:[{y:nextMY.year,mi:nextMY.month}] };
  }
  if (md.mi!==-1 && md.year!=null && md.day==null){
    var mdays = months[md.mi].days|0;
    return { title:'Events — '+months[md.mi].name+' '+md.year+' '+LABELS.era,
             start: toSerial(md.year, md.mi, 1), end: toSerial(md.year, md.mi, mdays), months:[{y:md.year,mi:md.mi}] };
  }
  if (md.mi!==-1 && md.day==null && md.year==null){
    var y3 = (md.mi >= cur.month) ? cur.year : (cur.year+1);
    var mdays3 = months[md.mi].days|0;
    return { title:'Events — '+months[md.mi].name+' (next occurrence)',
             start: toSerial(y3, md.mi, 1), end: toSerial(y3, md.mi, mdays3), months:[{y:y3,mi:md.mi}] };
  }
  if (md.year!=null && md.mi===-1){
    var sY = toSerial(md.year, 0, 1);
    return { title:'Events — Year '+md.year+' '+LABELS.era, start:sY, end:sY+dpy-1,
             months: months.map(function(_,i){return {y:md.year,mi:i};}) };
  }

  // Default: current month
  return {
    title:'This Month',
    start: toSerial(cur.year, cur.month, 1),
    end:   toSerial(cur.year, cur.month, getCal().months[cur.month].days),
    months:[{y:cur.year,mi:cur.month}]
  };
}



/* ============================================================================
 * 10) OCCURRENCES, BOUNDARY STRIPS & LISTS
 * ==========================================================================*/

export function occurrencesInRange(startSerial, endSerial){
  var cal = getCal();
  var yStart = fromSerial(startSerial).year, yEnd = fromSerial(endSerial).year;

  var capYears = (typeof RANGE_CAP_YEARS==='number' && RANGE_CAP_YEARS>0) ? RANGE_CAP_YEARS : null;
  var capNotice = false;
  if (capYears && (yEnd - yStart > capYears)){
    yEnd = yStart + capYears;
    capNotice = true;
  }

  var occ = [];
  for (var i=0;i<cal.events.length;i++){
    var e = cal.events[i];
    var mi = clamp(e.month,1,cal.months.length)-1;
    var maxD = cal.months[mi].days|0;
    var ows = Parse.ordinalWeekday.fromSpec(e.day);

    var ys = (e.year==null) ? yStart : (e.year|0);
    var ye = (e.year==null) ? yEnd   : (e.year|0);

    for (var y=ys; y<=ye; y++){
      /* Leap-gated slots (Shieldmeet, Gregorian Leap Day) only exist in
       * their active years — the serial math skips them (date-math.ts),
       * so an occurrence emitted here in an off-year would land on a
       * nonexistent day. */
      var moSlot = cal.months[mi];
      if (moSlot && moSlot.leapEvery && !_isLeapMonth(moSlot, y)) continue;
      var days = ows
        ? (ows.ord === 'every'
            ? _allWeekdaysInMonth(y, mi, ows.wdi)
            : (function(){ var d = dayFromOrdinalWeekday(y, mi, ows); return d ? [d] : []; })())
        : DaySpec.expand(e.day, maxD);

      for (var k=0;k<days.length;k++){
        var d = clamp(days[k],1,maxD);
        var ser = toSerial(y, mi, d);
        if (ser>=startSerial && ser<=endSerial){
          occ.push({serial:ser, y:y, m:mi, d:d, e:e});
        }
      }
    }
  }
  occ.sort(function(a,b){
    return (a.serial - b.serial) || (a.m - b.m) || (a.d - b.d);
  });
  if (capNotice){ sendChat(script_name,'/w gm Range capped at '+capYears+' years for performance.', null, { noarchive: true }); }
  return occ;
}

export function _rowDaysInMonth(y, mi, rowStart){
  var cal = getCal(), wdCount = cal.weekdays.length|0, out = [];
  for (var c=0; c<wdCount; c++){
    var d = fromSerial(rowStart + c);
    if (d.year === y && d.mi === mi) out.push(d.day);
  }
  return out;
}

export function _setAddAll(setObj, arr){ for (var i=0;i<arr.length;i++) setObj[arr[i]] = 1; }
export function _setCount(setObj){ return Object.keys(setObj).length; }
export function _setMin(setObj){ var keys = Object.keys(setObj).map(function(k){return +k;}); return keys.length ? Math.min.apply(null, keys) : null; }
export function _setMax(setObj){ var keys = Object.keys(setObj).map(function(k){return +k;}); return keys.length ? Math.max.apply(null, keys) : null; }

export function renderMonthStripWantedDays(year, mi, wantedSet, dimActive, extraEventsFn, includeCalendarEvents, stripRole){
  var mobj = getCal().months[mi] || {};
  if (intercalaryRenderFor(ensureSettings().calendarSystem) === 'festival_strip' && mobj.isIntercalary && wantedSet && wantedSet[1]){
    return _renderHarptosFestivalStrip(year, mi, mobj, dimActive, extraEventsFn, includeCalendarEvents, stripRole || 'full');
  }
  var parts = openMonthTable(mi, year);
  var html  = [parts.html];
  var wdCnt = getCal().weekdays.length|0;

  var minD = _setMin(wantedSet), maxD = _setMax(wantedSet);
  if (minD == null || maxD == null){
    html.push('<tr><td colspan="'+wdCnt+'" style="'+STYLES.calTd+';opacity:.6;">'+_calendarCellInnerHtml('(no days)')+'</td></tr>');
    html.push(closeMonthTable());
    return html.join('');
  }

  var firstRow = weekStartSerial(year, mi, minD);
  var lastRow  = weekStartSerial(year, mi, maxD);
  for (var rowStart = firstRow; rowStart <= lastRow; rowStart += wdCnt){
    html.push('<tr>');
    for (var c=0; c<wdCnt; c++){
      var s = rowStart + c;
      var d = fromSerial(s);
      if (d.year === year && d.mi === mi && wantedSet[d.day]){
        var ctx = makeDayCtx(d.year, d.mi, d.day, !!dimActive, extraEventsFn, includeCalendarEvents);
        html.push(tdHtmlForDay(ctx, parts.monthColor, STYLES.calTd, ''));
      } else {
        html.push('<td style="'+STYLES.calTd+'">'+_calendarCellInnerHtml('')+'</td>');
      }
    }
    html.push('</tr>');
  }
  html.push(closeMonthTable());
  return html.join('');
}

export function adjacentPartialMonths(spec){
  var cal = getCal(), today = todaySerial();
  var res = { prev:null, next:null };
  var wdCnt = weekLength()|0;

  function collectMonthRows(y, mi, firstRow, lastRow){
    var wanted = {};
    for (var row = firstRow; row <= lastRow; row += wdCnt){
      _setAddAll(wanted, _rowDaysInMonth(y, mi, row));
    }
    return wanted;
  }

  // ── Case A: today is BEFORE the range but nearby ─────────────────────────
  // Show the tail of the previous month so the current date has context.
  if (today < spec.start && (spec.start - today) <= CONFIG_NEARBY_DAYS){
    var startD = fromSerial(spec.start);
    var _adjP = _prevActiveMi(startD.mi, startD.year);
    var prevMi = _adjP.mi, prevY = _adjP.y;
    var prevMD = cal.months[prevMi].days|0;

    var tD = fromSerial(today);
    var todayDay = (tD.year === prevY && tD.mi === prevMi) ? tD.day : prevMD;

    var todayRow = weekStartSerial(prevY, prevMi, todayDay);
    var lastRow  = weekStartSerial(prevY, prevMi, prevMD);

    var wanted = collectMonthRows(prevY, prevMi, todayRow, lastRow);

    var backRow = todayRow - wdCnt, safety = 0;
    while (_setCount(wanted) < 5 && safety++ < 6){
      var extra = _rowDaysInMonth(prevY, prevMi, backRow);
      if (!extra.length) break;
      _setAddAll(wanted, extra);
      backRow -= wdCnt;
    }
    res.prev = { y:prevY, mi:prevMi, wanted:wanted };
  }

  // ── Case B: today is AFTER the range but nearby ──────────────────────────
  // Show the head of the next month so the current date has context.
  if (today > spec.end && (today - spec.end) <= CONFIG_NEARBY_DAYS){
    var endD = fromSerial(spec.end);
    var _adjN = _nextActiveMi(endD.mi, endD.year);
    var nextMi = _adjN.mi, nextY = _adjN.y;

    var firstRow = weekStartSerial(nextY, nextMi, 1);

    var tD2 = fromSerial(today);
    var todayRow2 = (tD2.year === nextY && tD2.mi === nextMi)
      ? weekStartSerial(nextY, nextMi, tD2.day)
      : firstRow;

    var wanted2 = collectMonthRows(nextY, nextMi, firstRow, todayRow2);

    var fwdRow = todayRow2 + wdCnt, safety2 = 0;
    while (_setCount(wanted2) < 5 && safety2++ < 6){
      var extra2 = _rowDaysInMonth(nextY, nextMi, fwdRow);
      if (!extra2.length) break;
      _setAddAll(wanted2, extra2);
      fwdRow += wdCnt;
    }
    res.next = { y:nextY, mi:nextMi, wanted:wanted2 };
  }

  // ── Case C: today is INSIDE the range, in the first calendar row ─────────
  // Show the last row of the previous month so the week boundary has context.
  if (!res.prev && today >= spec.start && today <= spec.end){
    var sd = fromSerial(spec.start);
    var firstRowStart = weekStartSerial(sd.year, sd.mi, 1);
    if (today >= firstRowStart && today < firstRowStart + wdCnt){
      var pMi = (sd.mi + cal.months.length - 1) % cal.months.length;
      var pY  = sd.year - (sd.mi === 0 ? 1 : 0);
      var pMD = cal.months[pMi].days|0;
      var pLastRow = weekStartSerial(pY, pMi, pMD);
      var wantedP = {};
      _setAddAll(wantedP, _rowDaysInMonth(pY, pMi, pLastRow));
      if (_setCount(wantedP)) res.prev = { y:pY, mi:pMi, wanted:wantedP };
    }
  }

  // ── Case D: today is INSIDE the range, in the last calendar row ──────────
  // Show the first row of the next month so the week boundary has context.
  if (!res.next && today >= spec.start && today <= spec.end){
    var ed = fromSerial(spec.end);
    var edMD = cal.months[ed.mi].days|0;
    var lastRowStart = weekStartSerial(ed.year, ed.mi, edMD);
    if (today >= lastRowStart && today < lastRowStart + wdCnt){
      var nMi = (ed.mi + 1) % cal.months.length;
      var nY  = ed.year + (nMi === 0 ? 1 : 0);
      var nFirstRow = weekStartSerial(nY, nMi, 1);
      var wantedN = {};
      _setAddAll(wantedN, _rowDaysInMonth(nY, nMi, nFirstRow));
      if (_setCount(wantedN)) res.next = { y:nY, mi:nMi, wanted:wantedN };
    }
  }

  return res;
}

export function _monthsFromRangeSpec(spec){
  if (spec.months && spec.months.length) return spec.months.slice();
  var months = [], cal=getCal();
  // Estimate bounding years using _daysBeforeYear inverse (subtract 1 for safety).
  var avgDpy = _serialCache.avgDpy || daysPerYear();
  var firstY = Math.max(0, Math.floor(spec.start / avgDpy) - 1);
  var lastY  = Math.floor(spec.end   / avgDpy) + 1;
  // Walk backwards from estimate until _daysBeforeYear(firstY) <= spec.start.
  while (firstY > 0 && _daysBeforeYear(firstY) > spec.start) firstY--;
  while (_daysBeforeYear(firstY + 1) <= spec.start) firstY++;
  for (var y=firstY; y<=lastY; y++){
    var yearStart = _daysBeforeYear(y);
    if (yearStart > spec.end) break;
    for (var mi=0; mi<cal.months.length; mi++){
      var m = cal.months[mi];
      if (m.leapEvery && !_isLeapMonth(m, y)) continue; // inactive leap slot
      var s = toSerial(y, mi, 1), e = toSerial(y, mi, m.days|0);
      if (e < spec.start) continue;
      if (s > spec.end) break;
      months.push({y:y, mi:mi});
    }
  }
  return months;
}

export function buildCalendarsHtmlForSpec(spec){
  spec = spec || {};
  var months = _monthsFromRangeSpec(spec);
  var out = ['<div style="text-align:left;">'];
  var extraEventsFn = (typeof spec.extraEventsFn === 'function') ? spec.extraEventsFn : null;
  var includeCalendarEvents = !(spec.includeCalendarEvents === false);
  var includeAdjacentStrips = !(spec.includeAdjacentStrips === false);

  var present = {};
  for (var i=0; i<months.length; i++){
    present[ months[i].y + '|' + months[i].mi ] = 1;
  }

  var boundary = includeAdjacentStrips ? adjacentPartialMonths(spec) : { prev:null, next:null };
  var today = todaySerial();
  var td = fromSerial(today);

  function stripHasToday(s) {
    if (!s || !s.wanted) return false;
    return (td.year === s.y) && (td.mi === s.mi) && !!s.wanted[td.day];
  }

  var prevKey = boundary.prev ? (boundary.prev.y + '|' + boundary.prev.mi) : null;
  var nextKey = boundary.next ? (boundary.next.y + '|' + boundary.next.mi) : null;

  var dimActiveAll =
    isTodayVisibleInRange(spec.start, spec.end) ||
    (!!boundary.prev && !present[prevKey] && stripHasToday(boundary.prev)) ||
    (!!boundary.next && !present[nextKey] && stripHasToday(boundary.next));

  if (boundary.prev && !present[ boundary.prev.y + '|' + boundary.prev.mi ]){
    out.push('<div style="'+STYLES.wrap+'">'+renderMonthStripWantedDays(boundary.prev.y, boundary.prev.mi, boundary.prev.wanted, dimActiveAll, extraEventsFn, includeCalendarEvents, 'prev')+'</div>');
  }

  for (var k=0; k<months.length; k++){
    var m = months[k];
    out.push('<div style="'+STYLES.wrap+'">'+renderMonthTable({
      year:m.y,
      mi:m.mi,
      mode:'full',
      dimPast: dimActiveAll,
      extraEventsFn: extraEventsFn,
      includeCalendarEvents: includeCalendarEvents,
      headerBarsHtml: spec.headerBarsHtml || undefined
    })+'</div>');
  }

  if (boundary.next && !present[ boundary.next.y + '|' + boundary.next.mi ]){
    out.push('<div style="'+STYLES.wrap+'">'+renderMonthStripWantedDays(boundary.next.y, boundary.next.mi, boundary.next.wanted, dimActiveAll, extraEventsFn, includeCalendarEvents, 'next')+'</div>');
  }

  out.push('</div>');
  return out.join('');
}

export function stripRangeExtensionDynamic(spec){
  var months = _monthsFromRangeSpec(spec);
  var present = {};
  for (var i=0;i<months.length;i++) present[ months[i].y + '|' + months[i].mi ] = 1;

  var boundary = adjacentPartialMonths(spec);
  var start = spec.start, end = spec.end;

  if (boundary.prev && !present[ boundary.prev.y + '|' + boundary.prev.mi ]){
    var minPrev = _setMin(boundary.prev.wanted);
    var maxPrev = _setMax(boundary.prev.wanted);
    if (minPrev != null && maxPrev != null){
      start = Math.min(start, toSerial(boundary.prev.y, boundary.prev.mi, minPrev));
      end   = Math.max(end,   toSerial(boundary.prev.y, boundary.prev.mi, maxPrev));
    }
  }
  if (boundary.next && !present[ boundary.next.y + '|' + boundary.next.mi ]){
    var minNext = _setMin(boundary.next.wanted);
    var maxNext = _setMax(boundary.next.wanted);
    if (minNext != null && maxNext != null){
      start = Math.min(start, toSerial(boundary.next.y, boundary.next.mi, minNext));
      end   = Math.max(end,   toSerial(boundary.next.y, boundary.next.mi, maxNext));
    }
  }

  if (start !== spec.start || end !== spec.end) return { start:start, end:end };
  return null;
}



/* ============================================================================
 * 12) EVENTS LISTS
 * ==========================================================================*/

export function eventsListHTMLForRange(title, startSerial, endSerial, forceYearLabel){
  var st = ensureSettings();
  var today = todaySerial();
  var occ = occurrencesInRange(startSerial, endSerial);
  var includeYear = forceYearLabel || (Math.floor(startSerial/daysPerYear()) !== Math.floor(endSerial/daysPerYear()));
  var out = ['<div style="margin:4px 0;"><b>'+esc(title)+'</b></div>'];

  if (!occ.length){
    out.push('<div style="opacity:.7;">No events in this range.</div>');
    return out.join('');
  }

  if (!st.groupEventsBySource){
    for (var i=0;i<occ.length;i++){
      var o = occ[i];
      var name2 = eventDisplayName(o.e);
      out.push(eventLineHtml(o.y, o.m, o.d, name2, includeYear, (o.serial===today), getEventColor(o.e)));
    }
    return out.join('');
  }

  var groups = {}, order = [];
  for (var k=0;k<occ.length;k++){
    var o2 = occ[k];
    var src = (o2.e && typeof o2.e.source === 'string') ? o2.e.source.trim() : '';
    var key = src ? titleCase(src) : 'Other';
    if (!groups[key]){ groups[key] = []; order.push(key); }
    groups[key].push(o2);
  }
  order.sort(function(a,b){ if (a==='Other') return 1; if (b==='Other') return -1; return a.localeCompare(b); });
  for (var g=0; g<order.length; g++){
    var label = order[g];
    out.push('<div style="margin-top:6px;font-weight:bold;">'+esc(label)+'</div>');
    var arr = groups[label];
    for (var j=0;j<arr.length;j++){
      var o3 = arr[j];
      var name3 = st.showSourceLabels ? (o3.e && o3.e.name ? String(o3.e.name) : '(unnamed event)')
                                      : eventDisplayName(o3.e);
      out.push(eventLineHtml(o3.y, o3.m, o3.d, name3, includeYear, (o3.serial===today), getEventColor(o3.e)));
    }
  }
  return out.join('');
}
