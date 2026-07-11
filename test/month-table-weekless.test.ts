// Guards the weekless (Barovia) boundary-strip bug fixed alongside the
// shared column-count helper (src/shared/render-month-table.ts::monthTableColumns).
//
// Root cause: events.ts::_rowDaysInMonth computed its per-row column count
// from the raw `cal.weekdays.length` (0 for weekless calendars), so its
// column loop never ran and every row came back empty. adjacentPartialMonths
// then handed renderMonthStripWantedDays an always-empty wanted-set, which
// rendered a "(no days)" placeholder cell with colspan="0" instead of a real
// boundary strip. Eberron (and every other named-weekday world) never hit
// this because their weekdays.length is already correct.
import { describe, it } from 'node:test';
import { strictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { freshInstall } from './helpers.js';
import { applyCalendarSystem, getCal } from '../src/state.js';
import { toSerial, fromSerial } from '../src/date-math.js';
import { buildCalendarsHtmlForSpec } from '../src/events.js';
import { monthTableColumns } from '../src/shared/render-month-table.js';

function setToday(cal: any, serial: number) {
  const td = fromSerial(serial);
  cal.current.year = td.year;
  cal.current.month = td.mi;
  cal.current.day_of_the_month = td.day;
  cal.current.day_of_the_week = 0;
}

function rangeSpecForMonth(cal: any, y: number, mi: number) {
  const mdays = cal.months[mi].days | 0;
  return {
    title: 'Probe range',
    start: toSerial(y, mi, 1),
    end: toSerial(y, mi, mdays),
    months: [{ y, mi }]
  };
}

describe('monthTableColumns — shared column-count helper', () => {
  it('defaults to 7 columns and hides the weekday row for an empty weekday-label array', () => {
    const { cols, showWeekdayRow } = monthTableColumns([]);
    assertEquals(cols, 7);
    assertEquals(showWeekdayRow, false);
  });

  it('returns the real weekday count and shows the row when labels are present', () => {
    const { cols, showWeekdayRow } = monthTableColumns(['Sul', 'Mol', 'Zol', 'Wir', 'Zor', 'Far', 'Sar']);
    assertEquals(cols, 7);
    assertEquals(showWeekdayRow, true);
  });

  it('is agnostic to actual week length (not hardcoded to 7)', () => {
    const { cols, showWeekdayRow } = monthTableColumns(['A', 'B', 'C', 'D', 'E']);
    assertEquals(cols, 5);
    assertEquals(showWeekdayRow, true);
  });

  it('tolerates null/undefined input the same as empty', () => {
    assertEquals(monthTableColumns(null).cols, 7);
    assertEquals(monthTableColumns(undefined).cols, 7);
  });
});

describe('Barovia (weekless) boundary strips', () => {
  it('renders a real trailing-day strip (never "(no days)"/colspan="0") when today is a few days before the viewed month', () => {
    freshInstall();
    applyCalendarSystem('barovia', undefined);
    const cal = getCal();
    assertEquals(cal.weekdays.length, 0, 'sanity: Barovia is weekless');

    const targetMi = 1; // Second Moon
    const targetYear = cal.current.year;
    const monthStart = toSerial(targetYear, targetMi, 1);
    setToday(cal, monthStart - 3); // Case A: today just before the viewed month

    const html = buildCalendarsHtmlForSpec(rangeSpecForMonth(cal, targetYear, targetMi));

    assert(!html.includes('(no days)'), 'no "(no days)" placeholder anywhere in the output');
    assert(!/colspan="0"/.test(html), 'no colspan="0" anywhere in the output');

    // Two month tables: the boundary strip (prev month) + the target month grid.
    const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
    assertEquals(tables.length, 2, 'boundary strip + target month grid both render');

    const stripDays = (tables[0].match(/line-height:1;">(\d+)<\/div>/g) || [])
      .map((s) => s.match(/>(\d+)</)![1]);
    assert(stripDays.length > 0, 'boundary strip has real day cells');
    // The strip lays out on the fixed 7-column weekless block and must end on
    // the last day of the previous month (the day adjacent to the viewed month).
    const prevMonthDays = cal.months[0].days | 0;
    assertEquals(stripDays[stripDays.length - 1], String(prevMonthDays), 'strip ends at the previous month\'s last day');
    assertEquals((tables[0].match(/colspan="(\d+)"/) || [])[1], '7', 'strip header colspan is the weekless 7-column block');
  });

  it('renders a real leading-day strip when today is a few days after the viewed month', () => {
    freshInstall();
    applyCalendarSystem('barovia', undefined);
    const cal = getCal();

    const targetMi = 1;
    const targetYear = cal.current.year;
    const mdays = cal.months[targetMi].days | 0;
    const monthEnd = toSerial(targetYear, targetMi, mdays);
    setToday(cal, monthEnd + 3); // Case B: today just after the viewed month

    const html = buildCalendarsHtmlForSpec(rangeSpecForMonth(cal, targetYear, targetMi));

    assert(!html.includes('(no days)'), 'no "(no days)" placeholder anywhere in the output');
    assert(!/colspan="0"/.test(html), 'no colspan="0" anywhere in the output');

    const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
    assertEquals(tables.length, 2, 'target month grid + boundary strip both render');

    const stripDays = (tables[1].match(/line-height:1;">(\d+)<\/div>/g) || [])
      .map((s) => s.match(/>(\d+)</)![1]);
    assertEquals(stripDays[0], '1', 'next-month strip starts at day 1');
  });
});

describe('Eberron (named weekdays) boundary strips — unaffected by the weekless fix', () => {
  it('still renders a populated context strip, not a "(no days)" placeholder', () => {
    freshInstall();
    applyCalendarSystem('eberron', undefined);
    const cal = getCal();
    assert(cal.weekdays.length > 0, 'sanity: Eberron has named weekdays');

    const targetMi = 1;
    const targetYear = cal.current.year;
    const monthStart = toSerial(targetYear, targetMi, 1);
    setToday(cal, monthStart - 3);

    const html = buildCalendarsHtmlForSpec(rangeSpecForMonth(cal, targetYear, targetMi));

    assert(!html.includes('(no days)'), 'no "(no days)" placeholder (was already true pre-fix)');
    assert(!/colspan="0"/.test(html), 'no colspan="0" (was already true pre-fix)');
    const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
    assertEquals(tables.length, 2, 'boundary strip + target month grid both render');
    // Weekday label header row is still present for a named-weekday world.
    assert(/<th style="[^"]*">/.test(tables[0]), 'weekday header row renders for a named-weekday world');
  });
});
