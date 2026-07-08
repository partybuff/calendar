// Pure month-table renderer shared by Roll20 script and showcase site.
// No Roll20 state dependencies — all data passed as parameters.

import { CONTRAST_MIN_CELL, STYLES } from '../constants.js';
import { applyBg, applyPlaneFill, colorsAPI, hexToRgba, textColor, textOutline } from '../color.js';
import { esc } from './html-utils.js';


/* ── Types ─────────────────────────────────────────────────────────────── */

export type PureCellEvent = {
  color: string;
  dotOnly?: boolean;
  planeFill?: boolean;
  isRemote?: boolean;
  splitColor?: string;
  splitIsRemote?: boolean;
  replaceNumeral?: string;
};

export type PureDayCell = {
  kind: 'day';
  day: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  events: PureCellEvent[];
  tooltip: string;
};

export type PureOverflowCell = {
  kind: 'overflow';
  day: number;
  overflowColor: string;
};

export type PureCell = PureDayCell | PureOverflowCell;

export type PureHeaderBar = {
  label: string;
  color: string;
  tooltip: string;
  phase?: string;
};

export type PureMonthTableInput = {
  monthName: string;
  yearLabel: string;
  weekdayLabels: string[];
  monthColor: string;
  cells: PureCell[];
  headerBars?: PureHeaderBar[];
  rawHeaderBarsHtml?: string;  // pre-rendered header bars HTML (backward compat)
};


/* ── Internal helpers (mirrored from rendering.ts / color.ts) ──────── */

function _pureEventDotsHtml(events: PureCellEvent[], dotOnly?: boolean): string {
  if (!events || !events.length) return '';
  var startIdx = dotOnly ? 0 : 1;
  var slice = events.slice(startIdx, startIdx + 3);
  if (!slice.length) return '';
  var dots = slice.map(function(e){
    return '<span style="color:'+e.color+';line-height:1;">&#9679;</span>';
  });
  return '<div style="font-size:.45em;line-height:1;text-align:center;">'+dots.join('&thinsp;')+'</div>';
}

function _styleForDayCell(baseStyle: string, events: PureCellEvent[], isToday: boolean, monthColor: string, isPast: boolean, isFuture: boolean): string {
  var style = baseStyle;
  var e0 = events.length >= 1 ? events[0] : null;
  if (e0 && e0.planeFill){
    style = applyPlaneFill(style, e0, CONTRAST_MIN_CELL);
  } else if (e0 && !e0.dotOnly){
    style = applyBg(style, e0.color, CONTRAST_MIN_CELL);
  } else if (isToday){
    style = applyBg(style, monthColor, CONTRAST_MIN_CELL);
  }
  if (isPast)   style += STYLES.past;
  if (isFuture) style += STYLES.future;
  if (isToday)  style += STYLES.today;
  return style;
}

function _calendarCellInnerHtml(content: string, extraStyle?: string): string {
  return '<div style="'+STYLES.calCellInner+(extraStyle||'')+'">'+content+'</div>';
}

function _tdHtmlForDay(cell: PureDayCell, monthColor: string, baseStyle: string, numeralStyle?: string): string {
  var style = _styleForDayCell(baseStyle, cell.events, cell.isToday, monthColor, cell.isPast, cell.isFuture);
  var titleAttr = cell.tooltip ? ' title="'+esc(cell.tooltip)+'"' : '';
  var numStyle = 'display:flex;align-items:center;justify-content:center;min-height:1em;line-height:1;';
  if (numeralStyle) numStyle += numeralStyle;
  var numeral: string = String(cell.day);
  if (cell.events.length && cell.events[0].replaceNumeral){
    numeral = cell.events[0].replaceNumeral;
  }
  var numWrap = '<div style="'+numStyle+'">'+numeral+'</div>';
  var isDotOnly = cell.events.length > 0 && !!cell.events[0].dotOnly;
  var dots = _pureEventDotsHtml(cell.events, isDotOnly);
  var bandStyle = 'height:.6em;min-height:.6em;display:flex;align-items:center;justify-content:center;line-height:1;overflow:hidden;';
  var middleBandStyle = 'flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;';
  var inner = [
    '<div style="'+bandStyle+'">&nbsp;</div>',
    '<div style="'+middleBandStyle+'">'+numWrap+'</div>',
    '<div style="'+bandStyle+'">'+(dots || '&nbsp;')+'</div>'
  ].join('');
  return '<td'+titleAttr+' style="'+style+'">'+_calendarCellInnerHtml(inner, 'padding:0;align-items:stretch;justify-content:flex-start;')+'</td>';
}

function _tdOverflow(cell: PureOverflowCell): string {
  var ovStyle = STYLES.calTd + 'background-color:'+cell.overflowColor+';opacity:.22;';
  return '<td style="'+ovStyle+'">'+_calendarCellInnerHtml('<div style="opacity:.55;">'+cell.day+'</div>')+'</td>';
}

function _headerBarsHtml(bars: PureHeaderBar[], weekdayCount: number): string {
  if (!bars || !bars.length) return '';
  var rows: string[] = [];
  for (var i = 0; i < bars.length; i++){
    var b = bars[i];
    var isRem = (b.phase === 'remote');
    var bgStyle = isRem
      ? 'background:' + b.color + ';opacity:.4;'
      : 'background:' + b.color + ';';
    rows.push(
      '<tr><td colspan="'+weekdayCount+'" style="border:1px solid #444;padding:0;" title="'+esc(b.tooltip || '')+'">' +
      '<div style="padding:2px 6px;font-size:.75em;font-weight:bold;line-height:1.3;' + bgStyle + '">' +
        esc(b.label || '') +
      '</div></td></tr>'
    );
  }
  return rows.join('');
}


/* ── Main entry point ──────────────────────────────────────────────── */

export function renderPureMonthTable(input: PureMonthTableInput): string {
  // Weekless calendars (Barovia) supply no weekday labels; cells are still laid
  // out on a 7-column week, so default the column count and skip the label row.
  var wdCount = input.weekdayLabels.length || 7;
  var monthHeaderStyle = colorsAPI.styleMonthHeader(input.monthColor);

  var html: string[] = [];

  // Table open + month header
  html.push('<table style="'+STYLES.table+'">');
  html.push('<tr><th colspan="'+wdCount+'" style="'+STYLES.head+'">');
  html.push('<div style="'+STYLES.monthHeaderBase+monthHeaderStyle+'">');
  html.push(esc(input.monthName));
  html.push('<span style="float:right;">'+esc(input.yearLabel)+'</span>');
  html.push('</div></th></tr>');

  // Weekday headers — omitted entirely when the calendar has no named weekdays.
  if (input.weekdayLabels.length){
    html.push('<tr>');
    for (var w = 0; w < input.weekdayLabels.length; w++){
      html.push('<th style="'+STYLES.th+'">'+esc(input.weekdayLabels[w])+'</th>');
    }
    html.push('</tr>');
  }

  // Header bars (planar events)
  if (input.rawHeaderBarsHtml){
    html.push(input.rawHeaderBarsHtml);
  } else if (input.headerBars && input.headerBars.length){
    html.push(_headerBarsHtml(input.headerBars, wdCount));
  }

  // Cell rows
  for (var i = 0; i < input.cells.length; i += wdCount){
    html.push('<tr>');
    for (var c = 0; c < wdCount; c++){
      var idx = i + c;
      if (idx >= input.cells.length) break;
      var cell = input.cells[idx];
      if (cell.kind === 'day'){
        html.push(_tdHtmlForDay(cell, input.monthColor, STYLES.calTd));
      } else {
        html.push(_tdOverflow(cell));
      }
    }
    html.push('</tr>');
  }

  html.push('</table>');
  return html.join('');
}
