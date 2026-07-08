// Barovia is the wrapper's only weekless world (no named weekdays) and its only
// 'nights' date format ("21st Night of the Twelfth Moon, 735 BC"). These guard
// both surfaces: the self-contained date label and the weekday-less month grid.
import { describe, it } from 'node:test';
import { strictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { freshInstall } from './helpers.js';
import { applyCalendarSystem, getCal } from '../src/state.js';
import {
  currentDateLabel,
  formalCurrentDateLabel,
  dateLabelFromSerial,
  formalDateLabelFromSerial,
  _displayMonthDayParts,
} from '../src/ui.js';
import { formatDateLabel, renderMonthTable } from '../src/rendering.js';
import { toSerial } from '../src/date-math.js';

function loadBarovia(day = 21, mi = 11, year = 735) {
  freshInstall();
  applyCalendarSystem('barovia', undefined);
  const cal = getCal();
  cal.current.year = year;
  cal.current.month = mi;
  cal.current.day_of_the_month = day;
  cal.current.day_of_the_week = 0;
  return cal;
}

describe('Barovia — weekless calendar', () => {
  it('loads with no named weekdays', () => {
    const cal = loadBarovia();
    assertEquals(cal.weekdays.length, 0, 'Barovia has no weekdays');
    assertEquals(cal.months.length, 12, 'twelve moons');
    assertEquals(cal.months[11].name, 'Twelfth Moon', 'word-ordinal moon names');
  });

  it('renders a month grid with no weekday header row and a 7-column span', () => {
    loadBarovia();
    const html = renderMonthTable({ year: 735, mi: 11, mode: 'full' });

    // Only the month-title <th> — no weekday-label header cells.
    assertEquals((html.match(/<th /g) || []).length, 1, 'no weekday header cells');
    // No empty header row left behind by the dropped weekday labels.
    assert(!html.includes('<tr></tr>'), 'no empty weekday row');
    // The grid still spans a 7-day week.
    assertEquals((html.match(/colspan="(\d+)"/) || [])[1], '7', 'colspan defaults to 7');
    // No NaN/undefined leaking from weekday math.
    assert(!/NaN|undefined/.test(html), 'no NaN/undefined in grid');
    // All 28 days present, laid out in order.
    const nums = (html.match(/min-height:1em;line-height:1;">(\d+)</g) || [])
      .map((s) => s.match(/>(\d+)</)![1]);
    assertEquals(nums.join(' '), Array.from({ length: 28 }, (_, i) => i + 1).join(' '),
      'days 1..28 in order');
  });

  it('renders the month header with the long-form moon name', () => {
    loadBarovia();
    const html = renderMonthTable({ year: 735, mi: 11, mode: 'full' });
    assert(html.includes('Twelfth Moon'), 'month header shows "Twelfth Moon"');
  });
});

describe('Barovia — nights date format', () => {
  it('formats the long form as "Nth Night of the <Moon>, <year> BC"', () => {
    loadBarovia(21, 11, 735);
    assertEquals(currentDateLabel(), '21st Night of the Twelfth Moon, 735 BC');
    assertEquals(formalCurrentDateLabel(), '21st Night of the Twelfth Moon, 735 BC');
  });

  it('never prefixes a weekday (weekless) in either serial-based label', () => {
    const cal = loadBarovia(7, 10, 735); // 7th Night of the Eleventh Moon
    const ser = toSerial(cal.current.year, cal.current.month, cal.current.day_of_the_month);
    assertEquals(dateLabelFromSerial(ser), '7th Night of the Eleventh Moon, 735 BC');
    assertEquals(formalDateLabelFromSerial(ser), '7th Night of the Eleventh Moon, 735 BC');
  });

  it('uses digit-ordinal for the day and long-form moon in the compact part', () => {
    loadBarovia(3, 6, 735);
    const parts = _displayMonthDayParts(6, 3);
    assertEquals(parts.monthName, 'Seventh Moon');
    assertEquals(parts.label, '3rd Night of the Seventh Moon');
  });

  it('formatDateLabel renders the nights style directly', () => {
    loadBarovia(1, 0, 735);
    assertEquals(formatDateLabel(735, 0, 1, true), '1st Night of the First Moon, 735 BC');
    assertEquals(formatDateLabel(735, 0, 1, false), '1st Night of the First Moon');
  });
});
