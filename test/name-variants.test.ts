// Name variants are a live, cosmetic within-world setting (month-name swap,
// no date change). Switching to a DIFFERENT world is not a live setting — it
// changes dates/data and must go through !cal resetcalendar → setup.
import { describe, it } from 'node:test';
import { strictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import './roll20-shim.js';
import { handleInput } from '../src/boot-register.js';
import { completeSetup, freshInstall } from './helpers.js';
import { applyCalendarSystem, ensureSettings, getCal } from '../src/state.js';

function gm(content: string) {
  return { type: 'api', content, who: 'GM (GM)', playerid: 'GM' } as any;
}
function lastMsg(): string {
  const log = (globalThis as any)._chatLog;
  return String((log[log.length - 1] || {}).msg || '');
}

describe('name variants vs world switching', () => {
  it('switching to a different world is gated behind resetcalendar', () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem('eberron', undefined);
    const before = { ...getCal().current, sys: ensureSettings().calendarSystem };

    handleInput(gm('!cal calendar gregorian standard'));

    // World unchanged; the reply points at resetcalendar.
    assertEquals(ensureSettings().calendarSystem, 'eberron', 'world not switched live');
    assertEquals(getCal().current.year, before.year, 'date untouched');
    const msg = lastMsg();
    assert(/resetcalendar/i.test(msg), 'reply steers to resetcalendar: ' + msg);
  });

  it('a name-variant swap within the current world is live and preserves the date', () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem('eberron', 'standard');
    getCal().current.year = 1200;
    getCal().current.day_of_the_month = 5;

    handleInput(gm('!cal calendar eberron druidic'));

    assertEquals(ensureSettings().calendarVariant, 'druidic', 'variant swapped');
    assertEquals(ensureSettings().calendarSystem, 'eberron', 'still Eberron');
    assertEquals(getCal().current.year, 1200, 'date preserved across variant swap');
    assertEquals(getCal().current.day_of_the_month, 5, 'day preserved');
  });
});
