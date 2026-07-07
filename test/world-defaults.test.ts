// Every world must load into its canonical engine default state — with NO
// dependency on the (retired, non-operational) !cal token sync pipeline.
// Switching worlds adopts that world's engine defaultDate and era suffix;
// a same-world reload must NOT clobber the GM's saved date.
import { describe, it } from 'node:test';
import { strictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import './roll20-shim.js';
import { LABELS } from '../src/constants.js';
import { WORLDS, WORLD_ORDER, getWorld } from '../src/worlds/index.js';
import { freshInstall } from './helpers.js';
import { applyCalendarSystem, ensureSettings, getCal } from '../src/state.js';

describe('per-world default load state', () => {
  for (const key of WORLD_ORDER) {
    it(`${key}: switching adopts the engine default date + era`, () => {
      freshInstall();
      // Start somewhere else so the switch is a genuine world change.
      const other = key === 'eberron' ? 'gregorian' : 'eberron';
      applyCalendarSystem(other, undefined);
      applyCalendarSystem(key, undefined);

      const world = getWorld(key);
      const cal = getCal();
      assertEquals(cal.current.year, world.defaultDate.year, `${key} year`);
      assertEquals(cal.current.month, world.defaultDate.month, `${key} structural month`);
      assertEquals(cal.current.day_of_the_month, world.defaultDate.day, `${key} day`);
      // Day resolves within the landed month (no off-the-end date).
      const mObj = cal.months[cal.current.month];
      assert(mObj, `${key} month slot exists`);
      assert(cal.current.day_of_the_month >= 1 && cal.current.day_of_the_month <= (mObj.days | 0),
        `${key} day in range`);
      // Era suffix tracks the world (not a stale 'YK').
      if (world.eraLabel) assertEquals(LABELS.era, world.eraLabel, `${key} era`);
    });
  }

  it('a same-world re-apply keeps the GM saved date (no clobber)', () => {
    freshInstall();
    applyCalendarSystem('gregorian', undefined);
    const cal = getCal();
    cal.current.year = 2030;
    cal.current.day_of_the_month = 14;
    // Re-apply the SAME world (e.g. a variant swap / reload).
    applyCalendarSystem('gregorian', ensureSettings().calendarVariant);
    assertEquals(getCal().current.year, 2030, 'saved year preserved');
    assertEquals(getCal().current.day_of_the_month, 14, 'saved day preserved');
  });
});
