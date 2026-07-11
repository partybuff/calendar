// formatDateLabel (rendering.ts) and _displayMonthDayParts (ui.ts) both format
// a (mi, day) into month/day text. They used to carry independent copies of
// the same dateFormatStyle branching (ordinal_of_month / month_day_year /
// nights / plain) — this test locks them to the shared core in
// rendering.ts::_dateLabelFragment so they can't silently re-diverge.
//
// Gregorian's 'month_day_year' style renders "<MonthName> <day>" ("January
// 14", per the DateFormatStyle doc) in BOTH functions. A pre-dedup bug had
// _displayMonthDayParts rendering "14 January" (day-first); the shared core
// now gives both the documented month-first order — asserted below.
import { describe, it } from 'node:test';
import { strictEqual as assertEquals } from 'node:assert/strict';
import { freshInstall } from './helpers.js';
import { applyCalendarSystem, getCal } from '../src/state.js';
import { formatDateLabel, _dateLabelFragment } from '../src/rendering.js';
import { _displayMonthDayParts } from '../src/ui.js';

const WORLDS = [
  'eberron', 'faerunian', 'greyhawk', 'dragonlance', 'exandria',
  'mystara', 'barovia', 'birthright', 'gregorian',
];

describe('Date label parity — shared core', () => {
  it('agrees with _displayMonthDayParts on monthName/day for every world (ordinal, nights, festival, plain styles)', () => {
    for (const w of WORLDS) {
      freshInstall();
      applyCalendarSystem(w);
      const cal = getCal();
      for (let mi = 0; mi < cal.months.length; mi++) {
        const m: any = cal.months[mi];
        const day = m.isIntercalary ? 1 : Math.max(1, Math.floor((m.days | 0) / 2));
        const frag = _dateLabelFragment(mi, day);
        const parts = _displayMonthDayParts(mi, day);
        assertEquals(parts.monthName, frag.monthName, `${w} mi=${mi}: monthName`);
        assertEquals(parts.day, frag.day, `${w} mi=${mi}: day`);
        assertEquals(parts.label, frag.label, `${w} mi=${mi}: label`);
      }
    }
  });

  it('renders ordinal_of_month style ("Nth of Month") consistently between both functions', () => {
    freshInstall();
    applyCalendarSystem('faerunian', 'standard');
    const cal = getCal();
    const eleasisMi = cal.months.findIndex((m: any) => m.name === 'Eleasis');
    assertEquals(formatDateLabel(1372, eleasisMi, 16, false), '16th of Eleasis');
    assertEquals(_displayMonthDayParts(eleasisMi, 16).label, '16th of Eleasis');
  });

  it('renders a festival/intercalary day as the festival name only, in both functions', () => {
    freshInstall();
    applyCalendarSystem('faerunian', 'standard');
    const cal = getCal();
    const midwinterMi = cal.months.findIndex((m: any) => m.name === 'Midwinter');
    assertEquals(formatDateLabel(1372, midwinterMi, 1, false), 'Midwinter');
    assertEquals(_displayMonthDayParts(midwinterMi, 1).label, 'Midwinter');
  });

  it('renders the "nights" style (Barovia) consistently, escaped only in formatDateLabel', () => {
    freshInstall();
    applyCalendarSystem('barovia');
    const raw = _displayMonthDayParts(0, 21).label;
    assertEquals(raw, '21st Night of the First Moon');
    assertEquals(formatDateLabel(735, 0, 21, false), '21st Night of the First Moon');
    assertEquals(formatDateLabel(735, 0, 21, true), '21st Night of the First Moon, 735 BC');
  });

  it('renders the Gregorian banner leap day ("February 29") identically in both functions', () => {
    freshInstall();
    applyCalendarSystem('gregorian');
    const cal = getCal();
    const leapMi = cal.months.findIndex((m: any) => m.isIntercalary && m.name === 'Leap Day');
    assertEquals(formatDateLabel(2024, leapMi, 1, false), 'February 29');
    assertEquals(_displayMonthDayParts(leapMi, 1).label, 'February 29');
  });

  it('renders Gregorian month_day_year month-first ("January 14") in BOTH functions', () => {
    freshInstall();
    applyCalendarSystem('gregorian');
    assertEquals(formatDateLabel(2024, 0, 14, false), 'January 14');
    assertEquals(_displayMonthDayParts(0, 14).label, 'January 14');
    // Leap-day banner slot stays "February 29" (Feb is month index 1).
    assertEquals(_displayMonthDayParts(1, 29).label, 'February 29');
  });
});
