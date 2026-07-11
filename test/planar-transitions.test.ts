// Planar phase-OUT transitions ("<phase> Ends") must land on the last ACTIVE
// day of the phase, not the first neutral day. The engine dates a
// transition-to-neutral on the day AFTER the phase's last active day (correct
// for "transitions to neutral"), but the wrapper labels it "Ends", so it must
// show a day earlier.
//
// Regression for Mabar's Long Shadows coterminous window. Engine 0.44
// retired the fixed Vult 26-28 dates: the window now FLOATS on the new moon
// nearest the winter solstice (Vult 21), so this test derives the window
// for the test year FROM the engine instead of hardcoding a date — the
// off-by-one guard has to survive future canon float, not just today's
// occurrence.
import { describe, it } from 'node:test';
import { ok as assert } from 'node:assert/strict';
import './roll20-shim.js';
import { handleInput } from '../src/boot-register.js';
import { completeSetup, freshInstall } from './helpers.js';
import { applyCalendarSystem, getCal } from '../src/state.js';
import { getPlanarState } from '../src/planes.js';
import { fromSerial, toSerial } from '../src/date-math.js';

function gm(content: string) {
  return { type: 'api', content, who: 'GM (GM)', playerid: 'GM' } as any;
}
function lastMsg(): string {
  const log = (globalThis as any)._chatLog;
  return String((log[log.length - 1] || {}).msg || '');
}

describe('planar phase-out "Ends" lands on the last active day', () => {
  it("Mabar's floating Long Shadows window ends on its last coterminous day, not the day after", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem('eberron', 'standard');
    const cal = getCal();
    const vultMi = cal.months.length - 1; // Vult is the last month
    const year = 998;

    // Derive Mabar's ACTUAL coterminous window for this year from the
    // engine by scanning — don't assume it still falls on the traditional
    // Vult 26-28 dates. Scan a bit past the month on both sides in case the
    // window straddles a month boundary in some future year.
    const scanStart = toSerial(year, vultMi, 1) - 10;
    const scanEnd = toSerial(year, vultMi, cal.months[vultMi].days | 0) + 10;
    let windowStart: number | null = null;
    let windowEnd: number | null = null;
    for (let s = scanStart; s <= scanEnd; s++) {
      const ps = getPlanarState('Mabar', s);
      if (ps && ps.phase === 'coterminous') {
        if (windowStart == null) windowStart = s;
        windowEnd = s;
      }
    }
    assert(windowStart != null && windowEnd != null,
      'expected to find a Mabar coterminous window near Vult ' + year + ' (engine scan found none)');

    const endDi = fromSerial(windowEnd!);
    const endMonthName = cal.months[endDi.mi].name;
    const endNeedle = endDi.day + ' ' + endMonthName;

    const afterDi = fromSerial(windowEnd! + 1);
    const afterMonthName = cal.months[afterDi.mi].name;
    const afterNeedle = afterDi.day + ' ' + afterMonthName;

    // Sit in the window's month so the current-window (current month ±
    // week-length spillover) includes both the phase-in and phase-out
    // transitions.
    cal.current.year = year;
    cal.current.month = vultMi;
    cal.current.day_of_the_month = 27;

    handleInput(gm('!cal planar current'));
    const msg = lastMsg();

    // The "Mabar Coterminous Ends" line must reference the window's last
    // ACTIVE day (derived above), and must NOT put an Ends line on the day
    // after (the engine's own "first neutral day" dating — the erroneous
    // off-by-one this test guards against).
    const endsIdx = msg.indexOf('Coterminous Ends');
    assert(endsIdx >= 0, 'panel shows a Mabar Coterminous Ends line: ' + msg);
    const line = msg.slice(Math.max(0, endsIdx - 120), endsIdx + 20);
    assert(line.indexOf(endNeedle) >= 0,
      'Ends line dated ' + endNeedle + ' (the window\'s last active day), got: ' + line);
    if (afterNeedle !== endNeedle) {
      const afterEndsRe = new RegExp(afterNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^]{0,60}Coterminous Ends');
      assert(!afterEndsRe.test(msg),
        'no Ends line on the day after the window (' + afterNeedle + '): ' + msg);
    }
  });
});
