// Planar phase-OUT transitions ("<phase> Ends") must land on the last ACTIVE
// day of the phase, not the first neutral day. The engine dates a
// transition-to-neutral on the day AFTER the phase's last active day (correct
// for "transitions to neutral"), but the wrapper labels it "Ends", so it must
// show a day earlier. Regression for Mabar's Long Shadows (coterminous
// Vult 26–28) previously "ending" on Zarantyr 1.
import { describe, it } from 'node:test';
import { ok as assert } from 'node:assert/strict';
import './roll20-shim.js';
import { handleInput } from '../src/boot-register.js';
import { completeSetup, freshInstall } from './helpers.js';
import { applyCalendarSystem, getCal } from '../src/state.js';

function gm(content: string) {
  return { type: 'api', content, who: 'GM (GM)', playerid: 'GM' } as any;
}
function lastMsg(): string {
  const log = (globalThis as any)._chatLog;
  return String((log[log.length - 1] || {}).msg || '');
}

describe('planar phase-out "Ends" lands on the last active day', () => {
  it('Mabar Long Shadows (Vult 26–28) ends on Vult 28, not Zarantyr 1', () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem('eberron', 'standard');
    // Sit in late Vult 998 so the current-window includes the Long Shadows
    // coterminous span and its phase-out transition.
    const cal = getCal();
    const vultMi = cal.months.length - 1; // Vult is the last month
    cal.current.year = 998;
    cal.current.month = vultMi;
    cal.current.day_of_the_month = 27;

    handleInput(gm('!cal planar current'));
    const msg = lastMsg();

    // The "Mabar Coterminous Ends" line must reference Vult 28, and must NOT
    // put an Ends line on Zarantyr 1 (the erroneous day-after).
    const endsIdx = msg.indexOf('Coterminous Ends');
    assert(endsIdx >= 0, 'panel shows a Mabar Coterminous Ends line: ' + msg);
    // Grab the ~120 chars of the line around "Coterminous Ends".
    const line = msg.slice(Math.max(0, endsIdx - 120), endsIdx + 20);
    assert(/28 Vult/.test(line), 'Ends line dated Vult 28, got: ' + line);
    assert(!/1 Zarantyr[^]{0,60}Coterminous Ends/.test(msg),
      'no Ends line on Zarantyr 1: ' + msg);
  });
});
