// Sections 8+11+14: Rendering + Show/Send + Buttoned Tables
import { CONTRAST_MIN_CELL, LABELS, STYLES, script_name, state_name } from './constants.js';
import { colorForMonth, ensureSettings, getCal, refreshAndSend, titleCase, weekLength } from './state.js';
import { _eventDotsHtml, applyBg, applyPlaneFill, colorsAPI, resolveColor } from './color.js';
import { _isGregorianLeapSlotMonthObj, _isLeapMonth, daysPerYear, fromSerial, toSerial, todaySerial, weekStartSerial, weekdayIndex } from './date-math.js';
import { monthTableColumns, renderPureMonthTable, PureCell, PureCellEvent, PureDayCell } from './shared/render-month-table.js';
import { DaySpec, Parse } from './parsing.js';
import { _firstWeekdayOfMonth, _tokenizeRangeArgs, autoColorForEvent, buildCalendarsHtmlForSpec, dayFromOrdinalWeekday, eventDisplayName, eventKey, eventsListHTMLForRange, getEventColor, getEventsFor, isDefaultEvent, mergeInNewDefaultEvents, parseUnifiedRange, sortEventsByPriority, stripRangeExtensionDynamic } from './events.js';
import { send, sendToAll, whisper } from './messaging.js';
import { commands } from './today.js';
import { intercalaryRenderFor, dateFormatFor } from './worlds/index.js';
import { CALENDAR_SYSTEMS } from './config.js';


/* ============================================================================
 * 8) RENDERING
 * ==========================================================================*/

export function clamp(n, min, max){ n = parseInt(n,10); if (!isFinite(n)) n = min; return n < min ? min : (n > max ? max : n); }
export function int(v, fallback){ var n = parseInt(v,10); return isFinite(n) ? n : fallback; }
export function esc(s){
  if (s == null) return '';
  return String(s)
    .replace(/&(?!#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/[\r\n]/g, '&#10;');
}

export function swatchHtml(colLike){
  var col = resolveColor(colLike) || '#888888';
  return '<span style="display:inline-block;width:10px;height:10px;vertical-align:baseline;margin-right:4px;border:1px solid #000;background:'+esc(col)+';" title="'+esc(col)+'"></span>';
}

export function _buttonHasEmojiStart(s){
  s = String(s||'');
  return !!s && s.charCodeAt(0) > 127;
}

export function _buttonIcon(lbl){
  var t = String(lbl||'').toLowerCase();
  if (/\b(show|view)\b/.test(t))            return '📅';
  if (/\b(send)\b/.test(t))                 return '📣';
  if (/\b(previous|prev)\b/.test(t))        return '◀️';
  if (/\b(next)\b/.test(t))                 return '▶️';
  if (/\b(forward)\b/.test(t))              return '➡️';
  if (/\b(advance)\b/.test(t))              return '⏭️';
  if (/\b(retreat)\b/.test(t))              return '⏮️';
  if (/\b(list)\b/.test(t))                 return '📋';
  if (/\b(add|create)\b/.test(t))           return '➕';
  if (/\b(remove|delete)\b/.test(t))        return '🗑️';
  if (/\b(restore|enable)\b/.test(t))       return '↩️';
  if (/\b(apply|theme|colors?)\b/.test(t))  return '🎨';
  if (/\b(help|menu)\b/.test(t))            return '❔';
  if (/\b(back)\b/.test(t))                 return '⬅️';
  return '';
}

function _escapeButtonCommand(cmd){
  return String(cmd || '')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/\(/g, '&#40;')
    .replace(/\)/g, '&#41;');
}

export function button(label, cmd, opts?){
  opts = opts || {};
  var lbl = String(label||'').trim();
  var icon = (opts.icon!=null) ? String(opts.icon) : (_buttonHasEmojiStart(lbl) ? '' : _buttonIcon(lbl));
  var text = (icon ? (icon+' ') : '') + lbl;
  return '['+esc(text)+'](!cal '+_escapeButtonCommand(cmd)+')';
}

export function _firstTok(s){ return String(s||'').trim().split(/\s+/)[0].toLowerCase(); }

export function _canRunTop(playerid, tok){
  var cfg = commands[tok];
  if (!cfg) return true;
  return !cfg.gm || playerIsGM(playerid);
}

export function canRunCommand(playerid, cmdStr){
  return _canRunTop(playerid, _firstTok(cmdStr));
}

export function mbP(m, label, cmd, opts?){
  return canRunCommand(m.playerid, cmd) ? button(label, cmd, opts) : '';
}

export function navP(m, label, page, opts?){
  return button(label, 'help '+page, opts);
}

export function weekdayAbbr(name){
  var st  = ensureSettings();
  var sys = CALENDAR_SYSTEMS[st.calendarSystem];
  var map = (sys && sys.weekdayAbbr) || {};
  if (map[name] != null) return map[name];
  var s = String(name || '').trim();
  return (s.length <= 3) ? s : s.slice(0,3);
}

export function weekdayHeaderLabels(useAbbr){
  var cal = getCal();
  return cal.weekdays.map(function(n){ return useAbbr ? weekdayAbbr(n) : n; });
}

export function openMonthTable(mi, yearLabel, abbrHeaders?){
  var cal = getCal(), cur = cal.current, mObj = cal.months[mi];
  var monthColor = colorForMonth(mi);
  var monthHeaderStyle = colorsAPI.styleMonthHeader(monthColor);

  var useAbbr = (abbrHeaders !== false);
  var wd = useAbbr ? weekdayHeaderLabels(true) : cal.weekdays;
  // Weekless calendars (Barovia) carry no named weekdays; the grid still lays
  // out on a 7-column week, so default the span and drop the label row.
  var mtc = monthTableColumns(wd);
  var cols = mtc.cols;

  var head = [
    '<table style="'+STYLES.table+'">',
    '<tr><th colspan="'+cols+'" style="'+STYLES.head+'">',
    '<div style="'+STYLES.monthHeaderBase+monthHeaderStyle+'">',
      esc(mObj.name),
      '<span style="float:right;">'+esc(String(yearLabel!=null?yearLabel:cur.year))+' '+LABELS.era+'</span>',
    '</div>',
    '</th></tr>',
    (mtc.showWeekdayRow ? '<tr>'+ wd.map(function(d){ return '<th style="'+STYLES.th+'">'+esc(d)+'</th>'; }).join('') +'</tr>' : '')
  ].join('');

  return { html: head, monthColor: monthColor };
}

export function closeMonthTable(){ return '</table>'; }

// Render header bars for long planar events.  Each bar is a narrow colored
// strip attached flush below the month header, showing "PlaneName Phase".
export function planesHeaderBarsHtml(bars, weekdayCount){
  if (!bars || !bars.length) return '';
  var cols = weekdayCount || 7;
  var rows = [];
  for (var i = 0; i < bars.length; i++){
    var b = bars[i];
    var isRem = (b.phase === 'remote');
    var bgStyle = isRem
      ? 'background:' + b.color + ';opacity:.4;'
      : 'background:' + b.color + ';';
    var tc = isRem ? '#000' : '';  // will compute below
    rows.push(
      '<tr><td colspan="'+cols+'" style="border:1px solid #444;padding:0;" title="'+esc(b.tooltip || '')+'">' +
      '<div style="padding:2px 6px;font-size:.75em;font-weight:bold;line-height:1.3;' + bgStyle + '">' +
        esc(b.label || '') +
      '</div></td></tr>'
    );
  }
  return rows.join('');
}

export function makeDayCtx(y, mi, d, dimActive, extraEventsFn, includeCalendarEvents){
  var ser = toSerial(y, mi, d);
  var tSer = todaySerial();
  var baseEvents = (includeCalendarEvents === false) ? [] : getEventsFor(mi, d, y);
  var extraEvents = [];
  if (typeof extraEventsFn === 'function'){
    var add = extraEventsFn(ser);
    if (Array.isArray(add)) extraEvents = add;
  }
  var events = sortEventsByPriority((baseEvents || []).concat(extraEvents || []));
  // Build tooltip: group by type (New/Full) with line breaks, or fallback to comma join
  var label = '';
  if (events.length){
    var names = events.map(eventDisplayName).filter(Boolean);
    var grouped = { 'New': [], 'Full': [], other: [] };
    for (var ei = 0; ei < names.length; ei++){
      var en = names[ei];
      if (/^New:/.test(en)) grouped['New'].push(en.replace(/^New:\s*/, ''));
      else if (/^Full:/.test(en)) grouped['Full'].push(en.replace(/^Full:\s*/, ''));
      else grouped.other.push(en);
    }
    var parts = [];
    if (grouped['New'].length) parts.push('New: ' + grouped['New'].join(', '));
    if (grouped['Full'].length) parts.push('Full: ' + grouped['Full'].join(', '));
    if (grouped.other.length) parts.push(grouped.other.join(', '));
    label = parts.length > 1 ? parts.join(' · ') : (parts[0] || names.join(', '));
    // Cap tooltip length — with 12 moons plus descriptions per cell, the full
    // calendar grid's HTML can blow past Roll20's message size limit and take
    // down the Full View entirely.
    if (label.length > 200) label = label.slice(0, 197) + '...';
  }
  return {
    y:y, mi:mi, d:d, serial:ser,
    isToday:  (ser === tSer),
    isPast:   !!dimActive && (ser <  tSer),
    isFuture: !!dimActive && (ser >  tSer),
    events:   events,
    title:    label
  };
}

export function styleForDayCell(baseStyle, events, isToday, monthColor, isPast, isFuture){
  // Primary event (or today) sets the solid background color.
  // Secondary events are rendered as dots by _eventDotsHtml — not styled here.
  // Events flagged dotOnly skip the background fill (multi-moon mini-cal).
  // Events flagged planeFill use special planar rendering (remote hatching, diagonal split).
  var style = baseStyle;
  var e0 = events.length >= 1 ? events[0] : null;
  if (e0 && (e0 as any).planeFill){
    style = applyPlaneFill(style, e0, CONTRAST_MIN_CELL);
  } else if (e0 && !(e0 as any).dotOnly){
    style = applyBg(style, getEventColor(e0), CONTRAST_MIN_CELL);
  } else if (isToday){
    style = applyBg(style, monthColor, CONTRAST_MIN_CELL);
  }
  if (isPast)   style += STYLES.past;
  if (isFuture) style += STYLES.future;
  if (isToday)  style += STYLES.today;
  return style;
}

export function _calendarCellInnerHtml(content, extraStyle?){
  return '<div style="'+STYLES.calCellInner+(extraStyle||'')+'">'+content+'</div>';
}

export function tdHtmlForDay(ctx, monthColor, baseStyle, numeralStyle){
  var style = styleForDayCell(baseStyle, ctx.events, ctx.isToday, monthColor, ctx.isPast, ctx.isFuture);
  var titleAttr = ctx.title ? ' title="'+esc(ctx.title)+'"' : '';
  var numStyle = 'display:flex;align-items:center;justify-content:center;min-height:1em;line-height:1;';
  if (numeralStyle) numStyle += numeralStyle;
  // Single-fill moon systems: replace day numeral with emoji on peak days
  var numeral = ctx.d;
  if (ctx.events.length && (ctx.events[0] as any).replaceNumeral){
    numeral = (ctx.events[0] as any).replaceNumeral;
  }
  var numWrap = '<div style="'+numStyle+'">'+numeral+'</div>';
  var isDotOnly = ctx.events.length > 0 && (ctx.events[0] as any).dotOnly;
  var dots = _eventDotsHtml(ctx.events, isDotOnly);
  var bandStyle = 'height:.6em;min-height:.6em;display:flex;align-items:center;justify-content:center;line-height:1;overflow:hidden;';
  var middleBandStyle = 'flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;';
  // Reserve equal top/bottom bands in every cell so the numeral stays centered
  // even when no event dots are rendered below it.
  var inner = [
    '<div style="'+bandStyle+'">&nbsp;</div>',
    '<div style="'+middleBandStyle+'">'+numWrap+'</div>',
    '<div style="'+bandStyle+'">'+(dots || '&nbsp;')+'</div>'
  ].join('');
  return '<td'+titleAttr+' style="'+style+'">'+_calendarCellInnerHtml(inner, 'padding:0;align-items:stretch;justify-content:flex-start;')+'</td>';
}

export function _renderHarptosFestivalStrip(y, mi, mobj, dimActive, extraEventsFn, includeCalendarEvents, edgeMode){
  var ser = toSerial(y, mi, 1);
  var tSer = todaySerial();
  var baseEvents = (includeCalendarEvents === false) ? [] : getEventsFor(mi, 1, y);
  var extraEvents = [];
  if (typeof extraEventsFn === 'function'){
    var add = extraEventsFn(ser);
    if (Array.isArray(add)) extraEvents = add;
  }
  var events = sortEventsByPriority((baseEvents || []).concat(extraEvents || []));
  var title = events.length ? events.map(eventDisplayName).filter(Boolean).join(', ') : String(mobj.name || '');
  var ctx = {
    y:y, mi:mi, d:1, serial:ser,
    isToday: ser === tSer,
    isPast: !!dimActive && ser < tSer,
    isFuture: !!dimActive && ser > tSer,
    events: events,
    title: title
  };
  var wdCnt = weekLength()|0;
  var mColor = colorForMonth(mi);
  var hdrStyle = colorsAPI.styleMonthHeader(mColor);
  var festivalStyle = styleForDayCell(STYLES.calTd, ctx.events, ctx.isToday, mColor, ctx.isPast, ctx.isFuture);
  festivalStyle += 'font-style:italic;';
  var fillerStyle = STYLES.calTd + 'opacity:.28;background-color:'+mColor+';';
  var sep = 'border-left:3px double rgba(0,0,0,.25);';
  if (edgeMode === 'prev') sep = 'border-right:3px double rgba(0,0,0,.25);';
  fillerStyle += sep;
  var titleAttr = title ? ' title="'+esc(title)+'" aria-label="'+esc(title)+'"' : '';
  var dots = _eventDotsHtml(ctx.events);
  var festivalCell = '<td'+titleAttr+' style="'+festivalStyle+'">'+
    _calendarCellInnerHtml('<div style="font-size:.9em;line-height:1.2;">'+esc(mobj.name)+'</div>'+dots)+
    '</td>';
  var fillerCell = '<td colspan="'+Math.max(1, wdCnt - 1)+'" style="'+fillerStyle+'">'+
    _calendarCellInnerHtml('&nbsp;')+
    '</td>';
  var rowHtml = (edgeMode === 'prev')
    ? ('<tr>'+fillerCell+festivalCell+'</tr>')
    : ('<tr>'+festivalCell+fillerCell+'</tr>');
  return [
    '<table style="'+STYLES.table+'">',
    '<tr><th colspan="'+wdCnt+'" style="'+STYLES.head+'">',
    '<div style="'+STYLES.monthHeaderBase+hdrStyle+'">',
      esc(mobj.name),
      '<span style="float:right;">'+esc(String(y))+' '+LABELS.era+'</span>',
      (mobj.leapEvery ? ' <span style="font-size:.75em;opacity:.75;">(every '+mobj.leapEvery+' yrs)</span>' : ''),
    '</div>',
    '</th></tr>',
    rowHtml,
    '</table>'
  ].join('');
}

// Render a single full-width banner row for an intercalary (festival) day.
// Used instead of a grid for 1-day months like Midwinter or Shieldmeet.
export function renderIntercalaryBanner(y, mi, mobj, dimActive, extraEventsFn, includeCalendarEvents){
  if (intercalaryRenderFor(ensureSettings().calendarSystem) === 'festival_strip'){
    return _renderHarptosFestivalStrip(y, mi, mobj, dimActive, extraEventsFn, includeCalendarEvents, 'full');
  }
  var ser    = toSerial(y, mi, 1);
  var tSer   = todaySerial();
  var baseEvents = (includeCalendarEvents === false) ? [] : getEventsFor(mi, 1, y);
  var extraEvents = [];
  if (typeof extraEventsFn === 'function'){
    var add = extraEventsFn(ser);
    if (Array.isArray(add)) extraEvents = add;
  }
  var events = sortEventsByPriority((baseEvents || []).concat(extraEvents || []));
  var title  = events.length ? events.map(eventDisplayName).filter(Boolean).join(', ') : '';
  var ctx = { y:y, mi:mi, d:1, serial:ser,
    isToday: ser === tSer,
    isPast:  !!dimActive && ser < tSer,
    isFuture:!!dimActive && ser > tSer,
    events: events, title: title };
  var mColor  = colorForMonth(mi);
  var hdrStyle = colorsAPI.styleMonthHeader(mColor);
  var cellStyle = styleForDayCell(STYLES.calTd, ctx.events, ctx.isToday, mColor, ctx.isPast, ctx.isFuture);
  cellStyle += 'text-align:center;font-style:italic;';
  var titleAttr = title ? ' title="'+esc(title)+'" aria-label="'+esc(title)+'"' : '';
  var dots = _eventDotsHtml(ctx.events);
  var wdCnt = weekLength()|0;
  var isBannerLeapDay = (intercalaryRenderFor(ensureSettings().calendarSystem) === 'banner_day' && String(mobj.name||'') === 'Leap Day');
  var headerName = isBannerLeapDay ? 'February 29' : mobj.name;
  return [
    '<table style="'+STYLES.table+'">',
    '<tr><th colspan="'+wdCnt+'" style="'+STYLES.head+'">',
    '<div style="'+STYLES.monthHeaderBase+hdrStyle+'">',
      esc(headerName),
      (mobj.leapEvery && !isBannerLeapDay ? ' <span style="font-size:.75em;opacity:.75;">(every '+mobj.leapEvery+' yrs)</span>' : ''),
    '</div>',
    '</th></tr>',
    '<tr'+titleAttr+'><td colspan="'+wdCnt+'" style="'+cellStyle+'">',
    _calendarCellInnerHtml('<div style="font-size:.9em;line-height:1.5;">'+esc(headerName)+'</div>'+dots),
    '</td></tr>',
    '</table>'
  ].join('');
}

function _toPureCellEvent(e): PureCellEvent {
  return {
    color: getEventColor(e),
    dotOnly: !!(e as any).dotOnly,
    planeFill: !!(e as any).planeFill,
    isRemote: !!(e as any).isRemote,
    splitColor: (e as any).splitColor || undefined,
    splitIsRemote: !!(e as any).splitIsRemote,
    replaceNumeral: (e as any).replaceNumeral || undefined
  };
}

function _ctxToPureDayCell(ctx): PureDayCell {
  return {
    kind: 'day',
    day: ctx.d,
    isToday: !!ctx.isToday,
    isPast: !!ctx.isPast,
    isFuture: !!ctx.isFuture,
    events: (ctx.events || []).map(_toPureCellEvent),
    tooltip: ctx.title || ''
  };
}

export function renderMonthTable(opts){
  var cal = getCal(), cur = cal.current;
  var y  = (opts && typeof opts.year==='number') ? (opts.year|0) : cur.year;
  var mi = (opts && typeof opts.mi  === 'number') ? (opts.mi|0)   : cur.month;
  var mode = (opts && opts.mode) || 'full';
  var dimActive = !!(opts && opts.dimPast);
  var extraEventsFn = (opts && typeof opts.extraEventsFn === 'function') ? opts.extraEventsFn : null;
  var includeCalendarEvents = !(opts && opts.includeCalendarEvents === false);

  var mobj  = cal.months[mi];

  var renderMode = intercalaryRenderFor(ensureSettings().calendarSystem);

  // banner_day leap-day slot is rendered within its parent month, not standalone.
  if (_isGregorianLeapSlotMonthObj(mobj)) return '';

  // Leap month not active this year: render nothing.
  if (mobj.leapEvery && !_isLeapMonth(mobj, y)) return '';

  // Intercalary day: banner row instead of a grid.
  if (mobj.isIntercalary) return renderIntercalaryBanner(y, mi, mobj, dimActive, extraEventsFn, includeCalendarEvents);

  var mdays = mobj.days|0;
  var febLeapSlot = null;
  var showBannerLeapDay = false;
  if (renderMode === 'banner_day' && !mobj.isIntercalary){
    // Find a leap-day slot that follows this month (banner_day inlines it).
    for (var gmi=0; gmi<cal.months.length; gmi++){
      if (_isGregorianLeapSlotMonthObj(cal.months[gmi])){ febLeapSlot = gmi; break; }
    }
    // Only show the inlined day if this is the month immediately before the leap slot,
    // AND it's a leap year.
    if (febLeapSlot != null && febLeapSlot === mi + 1 && _isLeapMonth(cal.months[febLeapSlot], y)){
      showBannerLeapDay = true;
      mdays = mdays + 1;
    }
  }
  var wdCnt = weekLength()|0;
  var useAbbr = !(opts && opts.abbrHeaders===false);
  var wdLabels = weekdayHeaderLabels(useAbbr);

  if (mode === 'full'){
    // Build PureCell array and delegate to the shared renderer
    var pureCells: PureCell[] = [];
    var gridStart    = weekStartSerial(y, mi, 1);
    var lastRowStart = weekStartSerial(y, mi, mdays);
    for (var rowStart = gridStart; rowStart <= lastRowStart; rowStart += wdCnt){
      for (var c=0; c<wdCnt; c++){
        var s = rowStart + c;
        var d = fromSerial(s);
        if (d.year === y && d.mi === mi){
          var ctx = makeDayCtx(y, mi, d.day, dimActive, extraEventsFn, includeCalendarEvents);
          pureCells.push(_ctxToPureDayCell(ctx));
        } else if (showBannerLeapDay && d.year === y && d.mi === febLeapSlot && d.day === 1){
          var leapSer = s;
          var leapBaseEvents = (includeCalendarEvents === false) ? [] : getEventsFor(febLeapSlot, 1, y);
          var leapExtraEvents = [];
          if (typeof extraEventsFn === 'function'){
            var leapAdd = extraEventsFn(leapSer);
            if (Array.isArray(leapAdd)) leapExtraEvents = leapAdd;
          }
          var leapEvents = sortEventsByPriority((leapBaseEvents || []).concat(leapExtraEvents || []));
          var leapTitle = leapEvents.length ? leapEvents.map(eventDisplayName).filter(Boolean).join(', ') : '';
          var leapCtx = {
            y:y, mi:mi, d:29, serial:leapSer,
            isToday: (leapSer === todaySerial()),
            isPast:  !!dimActive && (leapSer < todaySerial()),
            isFuture:!!dimActive && (leapSer > todaySerial()),
            events: leapEvents,
            title: leapTitle
          };
          pureCells.push(_ctxToPureDayCell(leapCtx));
        } else {
          pureCells.push({ kind: 'overflow', day: d.day, overflowColor: colorForMonth(d.mi) });
        }
      }
    }
    return renderPureMonthTable({
      monthName: mobj.name,
      yearLabel: String(y) + ' ' + LABELS.era,
      weekdayLabels: wdLabels,
      monthColor: colorForMonth(mi),
      cells: pureCells,
      rawHeaderBarsHtml: (opts && opts.headerBarsHtml) || undefined
    });
  }

  // mode === 'week' — uses the legacy inline rendering path
  var parts = openMonthTable(mi, y, useAbbr);
  var html = [parts.html];
  if (opts && opts.headerBarsHtml) html.push(opts.headerBarsHtml);
  var startSer = (opts && typeof opts.weekStartSerial === 'number')
    ? (opts.weekStartSerial|0)
    : weekStartSerial(y, mi, 1);

  html.push('<tr>');
  for (var i=0; i<wdCnt; i++){
    var s2 = startSer + i;
    var d2 = fromSerial(s2);
    if (showBannerLeapDay && d2.year === y && d2.mi === febLeapSlot && d2.day === 1){
      var leapSer2 = s2;
      var leapBaseEvents2 = (includeCalendarEvents === false) ? [] : getEventsFor(febLeapSlot, 1, y);
      var leapExtraEvents2 = [];
      if (typeof extraEventsFn === 'function'){
        var leapAdd2 = extraEventsFn(leapSer2);
        if (Array.isArray(leapAdd2)) leapExtraEvents2 = leapAdd2;
      }
      var leapEvents2 = sortEventsByPriority((leapBaseEvents2 || []).concat(leapExtraEvents2 || []));
      var leapTitle2 = leapEvents2.length ? leapEvents2.map(eventDisplayName).filter(Boolean).join(', ') : '';
      var leapCtx2 = {
        y:y, mi:mi, d:29, serial:leapSer2,
        isToday: (leapSer2 === todaySerial()),
        isPast:  !!dimActive && (leapSer2 < todaySerial()),
        isFuture:!!dimActive && (leapSer2 > todaySerial()),
        events: leapEvents2,
        title: leapTitle2
      };
      html.push(tdHtmlForDay(leapCtx2, parts.monthColor, STYLES.calTd, ''));
    } else {
      var ctx2 = makeDayCtx(d2.year, d2.mi, d2.day, dimActive, extraEventsFn, includeCalendarEvents);
      var numeralStyle = (d2.mi === mi) ? '' : 'opacity:.5;';
      html.push(tdHtmlForDay(ctx2, parts.monthColor, STYLES.calTd, numeralStyle));
    }
  }
  html.push('</tr>', closeMonthTable());
  return html.join('');
}

export function renderMiniCal(mi, yearLabel, dimActive){
  var y = (typeof yearLabel === 'number') ? yearLabel : getCal().current.year;
  return renderMonthTable({ year:y, mi:mi, mode:'full', dimPast: !!dimActive });
}


export function _ordinal(n){
  n = n|0;
  var v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  switch (n % 10){
    case 1: return n + 'st';
    case 2: return n + 'nd';
    case 3: return n + 'rd';
    default: return n + 'th';
  }
}


export function yearHTMLFor(targetYear, dimActive){
  var months = getCal().months;
  var html = ['<div style="text-align:left;">'];
  for (var i=0; i<months.length; i++){
    // Skip leap months that don't occur this year.
    if (months[i].leapEvery && !_isLeapMonth(months[i], targetYear)) continue;
    var rendered = renderMiniCal(i, targetYear, !!dimActive);
    if (rendered) html.push('<div style="'+STYLES.wrap+'">'+rendered+'</div>');
  }
  html.push('</div>');
  return html.join('');
}

// Shared, unescaped (monthName, day, label) fragment for a given month/day —
// the single source of truth for the per-dateFormatStyle branching
// (ordinal_of_month / month_day_year / nights / plain). Consumed by:
//   - formatDateLabel below, which escapes the fragment at its HTML boundary
//     and appends ", <year> <era>" when requested.
//   - ui.ts's _displayMonthDayParts, which returns the fragment as-is
//     (unescaped) because its callers build !cal command specs
//     (_serialToDateSpec) and some HTML titles feed it through their own
//     esc() call — see callers in commands.ts/today.ts/events.ts.
// Deliberately UNESCAPED here; see the esc() calls in formatDateLabel.
export function _dateLabelFragment(mi, day){
  var cal = getCal();
  var st = ensureSettings();
  var m = cal.months[mi] || {};
  var fmt = dateFormatFor(st.calendarSystem);
  var monthName = String(m.name || (mi + 1));
  if (fmt === 'ordinal_of_month'){
    // "16th of Eleasis" / "Midwinter" (festival name only for intercalary)
    if (m.isIntercalary){
      return { monthName: monthName, day: day, label: monthName };
    }
    return { monthName: monthName, day: day, label: _ordinal(day) + ' of ' + monthName };
  }
  if (fmt === 'month_day_year' && m.isIntercalary && String(m.name||'') === 'Leap Day'){
    // "February 29" for the banner leap day slot.
    return { monthName: 'February', day: 29, label: 'February 29' };
  }
  if (fmt === 'nights'){
    // "21st Night of the Twelfth Moon" (Barovia)
    return { monthName: monthName, day: day, label: _ordinal(day) + ' Night of the ' + monthName };
  }
  if (fmt === 'month_day_year'){
    // "January 14" — Month Day, per the DateFormatStyle doc ("January 14,
    // 2024 CE"). The banner leap-day slot returned above. Before the
    // date-label dedup, _displayMonthDayParts rendered this "14 January"
    // (Day Month) while formatDateLabel rendered "January 14"; the two now
    // agree on the documented order (Gregorian is the only such world; this
    // changes its Today banner / panel titles from day-first to month-first).
    return { monthName: monthName, day: day, label: monthName + ' ' + day };
  }
  // Plain fallback for any world whose style isn't matched above.
  return { monthName: monthName, day: day, label: String(day) + ' ' + monthName };
}

export function formatDateLabel(y, mi, d, includeYear){
  var frag = _dateLabelFragment(mi, d);
  var lbl = esc(frag.label);
  if (includeYear) lbl += ', '+esc(String(y))+' '+LABELS.era;
  return lbl;
}

export function monthEventsHtml(mi, today){
  var cal = getCal(), curYear = cal.current.year;

  function dayKey(e){
    var ow = Parse.ordinalWeekday.fromSpec(e.day);
    if (ow){
      if (ow.ord === 'every'){
        var first = _firstWeekdayOfMonth(curYear, mi, ow.wdi);
        return (first != null) ? first : 99;
      }
      var d = dayFromOrdinalWeekday(curYear, mi, ow);
      return (d != null) ? d : 99;
    }
    return DaySpec.first(e.day);
  }

  var evs = cal.events.filter(function(e){
    return ((+e.month||1)-1) === mi && (e.year == null || (e.year|0) === (curYear|0));
  }).sort(function(a,b){
    var da = dayKey(a), db = dayKey(b);
    if (da !== db) return da - db;
    var ay = (a.year==null)?1:0, by = (b.year==null)?1:0;
    if (ay !== by) return ay - by;
    return String(a.name||'').localeCompare(String(b.name||''));
  });

  return evs.map(function(e){
    var isToday = false;
    var ows = Parse.ordinalWeekday.fromSpec(e.day);
    if (ows){
      if (ows.ord === 'every'){
        isToday = (weekdayIndex(curYear, mi, today) === ows.wdi);
      } else {
        isToday = (dayFromOrdinalWeekday(curYear, mi, ows) === today);
      }
    } else {
      isToday = DaySpec.matches(e.day)(today);
    }

    var swatch = swatchHtml(getEventColor(e));
    var name = esc(eventDisplayName(e));
    var style = isToday ? ' style="font-weight:bold;margin:2px 0;"' : ' style="margin:2px 0;"';
    return '<div'+style+'>'+swatch+' '+name+'</div>';
  }).join('');
}

export function eventLineHtml(y, mi, d, name, includeYear, isToday, color){
  var dateLbl = formatDateLabel(y, mi, d, includeYear);
  var sw = swatchHtml(color);
  var sty = isToday ? ' style="font-weight:bold;margin:2px 0;"' : ' style="margin:2px 0;"';
  return '<div'+sty+'>'+ sw + ' ' + dateLbl + ': ' + esc(name) + '</div>';
}

// ---------------------------------------------------------------------------
// Synthetic minical helpers (for subsystem overlays)
// ---------------------------------------------------------------------------

export function _buildSyntheticEventsLookup(syntheticEvents, fallbackTitle){
  var bySerial = {};
  if (!Array.isArray(syntheticEvents)) return bySerial;
  for (var i = 0; i < syntheticEvents.length; i++){
    var se = syntheticEvents[i];
    if (!se || !isFinite(se.serial)) continue;
    var key = String(se.serial|0);
    if (!bySerial[key]) bySerial[key] = [];
    var entry: any = {
      name: String(se.name || fallbackTitle || 'Highlight'),
      color: resolveColor(se.color) || '#607D8B',
      source: null
    };
    // Preserve subsystem flags for specialized rendering
    if ((se as any).dotOnly)       entry.dotOnly = true;
    if ((se as any).planeFill)     entry.planeFill = true;
    if ((se as any).isRemote)      entry.isRemote = true;
    if ((se as any).splitColor)    entry.splitColor = resolveColor((se as any).splitColor) || '#607D8B';
    if ((se as any).splitIsRemote) entry.splitIsRemote = true;
    if ((se as any).replaceNumeral) entry.replaceNumeral = (se as any).replaceNumeral;
    bySerial[key].push(entry);
  }
  return bySerial;
}

export function _renderSyntheticMiniCal(title, startSerial, endSerial, syntheticEvents, headerBars?){
  var bySerial = _buildSyntheticEventsLookup(syntheticEvents, title);
  var hbHtml = planesHeaderBarsHtml(headerBars, weekLength());
  var startDate = fromSerial(startSerial|0);
  var endDate = fromSerial(endSerial|0);
  if (startDate.year === endDate.year && startDate.mi === endDate.mi && startDate.day === 1){
    var monthObj = getCal().months[startDate.mi] || {};
    var monthDays = Math.max(1, monthObj.days|0);
    if (endDate.day === monthDays){
      return renderMonthTable({
        year: startDate.year,
        mi: startDate.mi,
        mode: 'full',
        includeCalendarEvents: false,
        headerBarsHtml: hbHtml || undefined,
        extraEventsFn: function(serial){
          return bySerial[String(serial)] || [];
        }
      });
    }
  }
  return buildCalendarsHtmlForSpec({
    title: title,
    start: startSerial,
    end: endSerial,
    includeCalendarEvents: false,
    headerBarsHtml: hbHtml || undefined,
    extraEventsFn: function(serial){
      return bySerial[String(serial)] || [];
    }
  });
}

export function _monthRangeFromSerial(serial){
  var d = fromSerial(serial|0);
  var m = getCal().months[d.mi] || {};
  var days = Math.max(1, m.days|0);
  return {
    start: toSerial(d.year, d.mi, 1),
    end: toSerial(d.year, d.mi, days),
    year: d.year,
    mi: d.mi
  };
}

// Returns an array of {y, mi, start, end} for a rolling window of months.
// prevCount months before the current month, the current month, and nextCount months after.
// Skips inactive leap months. Uses calendar month order with year wrapping.
export function rollingMonthWindow(serial, prevCount, nextCount){
  var cal = getCal();
  var d = fromSerial(serial|0);
  var months = cal.months;
  var result = [];

  // Helper: step month index forward or backward, respecting leap months
  function stepMonth(y, mi, direction){
    var limit = months.length * 3; // safety
    while (limit-- > 0){
      mi += direction;
      if (mi >= months.length){ mi = 0; y++; }
      else if (mi < 0){ mi = months.length - 1; y--; }
      var m = months[mi];
      if (m && m.leapEvery && !_isLeapMonth(m, y)) continue;
      return { y: y, mi: mi };
    }
    return { y: y, mi: mi };
  }

  function monthRange(y, mi){
    var m = months[mi] || {};
    var days = Math.max(1, m.days|0);
    return { y: y, mi: mi, start: toSerial(y, mi, 1), end: toSerial(y, mi, days) };
  }

  // Collect previous months (in reverse, then reverse the array)
  var prev = [];
  var cy = d.year, cmi = d.mi;
  for (var p = 0; p < prevCount; p++){
    var pp = stepMonth(cy, cmi, -1);
    cy = pp.y; cmi = pp.mi;
    prev.push(monthRange(cy, cmi));
  }
  prev.reverse();

  // Current month
  result = prev.concat([monthRange(d.year, d.mi)]);

  // Collect following months
  cy = d.year; cmi = d.mi;
  for (var n = 0; n < nextCount; n++){
    var nn = stepMonth(cy, cmi, 1);
    cy = nn.y; cmi = nn.mi;
    result.push(monthRange(cy, cmi));
  }

  return result;
}

// Wraps handout body HTML in a responsive flex container for multi-month grids.
export function handoutWrap(innerHtml){
  return '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start;">' + innerHtml + '</div>';
}

/* ============================================================================
 * 14) BUTTONED TABLES / LISTS
 * ==========================================================================*/

export function _encKey(k){ return encodeURIComponent(String(k)); }
export function _decKey(k){ try { return decodeURIComponent(String(k)); } catch(e){ return String(k||''); } }

export function _eventSeriesKey(e){
  var y   = (e.year==null) ? 'ALL' : String(e.year|0);
  var day = String(e.day||'').trim().toLowerCase();
  var nm  = String(e.name||'').trim().toLowerCase();
  var src = (e.source!=null) ? String(e.source).trim().toLowerCase() : '';
  return y + '|' + day + '|' + nm + '|' + src;
}

