// Canon-structure invariants: the wrapper's composed structural order must
// agree with the engine's own intercalary placement, because the wrapper
// serializes dates with ITS order while moon phases re-serialize through
// the ENGINE's order — any mismatch makes lunar output discontinuous
// across the affected span (the exact failure engine 0.24.0's Faerûn
// festival reposition would have caused).
//
// Also covers the Birthright scheme migration: slots derived from the
// engine (deriveIntercalarySlots) must mirror the engine's intercalary
// list under WHICHEVER scheme the installed engine ships, and the
// one-time Faerûn state migration must remap persisted indexes.
import { describe, it } from 'node:test';
import { strictEqual as assertEquals, ok as assert, deepStrictEqual as assertDeep } from 'node:assert/strict';
import './roll20-shim.js';
import { worlds as engineWorlds } from '@partybuff/calendar-engine';
import { WORLDS, getEngineId, getStructuralSlot } from '../src/worlds/index.js';
import { freshInstall } from './helpers.js';
import { checkInstall, ensureSettings, getCal } from '../src/state.js';

describe('canon structure invariants', () => {
  for (const key of Object.keys(WORLDS)) {
    it(`${key}: wrapper intercalary positions match engine insertAfter`, () => {
      const engine = engineWorlds.get(getEngineId(key));
      const byKey = new Map(engine.calendar.intercalaries.map((ic) => [ic.key, ic]));

      let lastRegularEngineMi: number | null = null;
      for (let mi = 0; ; mi++) {
        const slot = getStructuralSlot(key, mi);
        if (!slot) break;
        if (slot.translation.kind === 'month') {
          lastRegularEngineMi = slot.translation.engineMonthIndex;
          continue;
        }
        const t = slot.translation;
        if (t.intercalaryKey === '__gregorian_leap_day') continue; // synthesized
        if (t.yearDelta !== 0) continue; // deliberate cross-year render (Greyhawk Needfest)
        const ic = byKey.get(t.intercalaryKey);
        assert(ic, `${key}: structural slot "${t.intercalaryKey}" missing from engine`);
        assertEquals(
          lastRegularEngineMi,
          ic!.insertAfter.monthIndex,
          `${key}: "${t.intercalaryKey}" rendered after engine month ${lastRegularEngineMi} `
            + `but engine canon places it after ${ic!.insertAfter.monthIndex}`,
        );
      }
    });
  }

  it('birthright: derived slots mirror the engine intercalary list exactly', () => {
    const engine = engineWorlds.get('birthright');
    const engineKeys = engine.calendar.intercalaries.map((ic) => ic.key).sort();
    const structuralKeys: string[] = [];
    for (let mi = 0; ; mi++) {
      const slot = getStructuralSlot('birthright', mi);
      if (!slot) break;
      if (slot.translation.kind === 'intercalary') structuralKeys.push(slot.translation.intercalaryKey);
    }
    assertDeep(structuralKeys.slice().sort(), engineKeys);
  });
});

describe('faerûn festival-position state migration', () => {
  function slotIndexByName(months: any[], name: string): number {
    return months.findIndex(
      (mo) => String((mo && mo.name) || '').toLowerCase() === name,
    );
  }

  it('remaps persisted indexes when the legacy layout is detected', () => {
    freshInstall();
    ensureSettings().calendarSystem = 'faerunian';
    checkInstall(); // compose faerunian months from the installed engine
    const cal = getCal();

    // Reconstruct the LEGACY persisted layout: Highharvestide after Uktar
    // (regularIndex 10), Feast of the Moon after Nightal (regularIndex 11).
    // On pre-0.24.0 engines this equals the composed layout (the migration
    // then exercises its identity/no-op path); on 0.24.0+ it differs and
    // the remap path runs. Both must preserve name-pointing.
    const hh = slotIndexByName(cal.months, 'highharvestide');
    const fm = slotIndexByName(cal.months, 'feast of the moon');
    assert(hh > 0 && fm > 0, 'faerunian layout must contain both festivals');
    const hhSlot = cal.months[hh];
    const fmSlot = cal.months[fm];
    const rest = cal.months.filter((mo: any) => mo !== hhSlot && mo !== fmSlot);
    const legacy: any[] = [];
    for (const mo of rest) {
      legacy.push(mo);
      if (!mo.isIntercalary && mo.regularIndex === 10) legacy.push(hhSlot);
      if (!mo.isIntercalary && mo.regularIndex === 11) legacy.push(fmSlot);
    }
    assertEquals(legacy.length, cal.months.length, 'legacy rebuild must keep every slot');
    cal.months = legacy;

    // Persisted campaign state under the legacy layout: current date on
    // Uktar 5, one event anchored on Nightal.
    const uktarLegacy = slotIndexByName(cal.months, 'uktar');
    const nightalLegacy = slotIndexByName(cal.months, 'nightal');
    cal.current.month = uktarLegacy;
    cal.current.day_of_the_month = 5;
    cal.events.push({ name: 'Test Vigil', month: nightalLegacy + 1, day: '3', year: null, color: null, source: null });

    // Reload: checkInstall re-applies the calendar system (whatever layout
    // the installed engine ships) and must keep persisted indexes pointing
    // at the same-named slots.
    checkInstall();
    const migrated = getCal();
    assertEquals(
      String(migrated.months[migrated.current.month].name).toLowerCase(),
      'uktar',
      'current date must still point at Uktar after migration',
    );
    assertEquals(migrated.current.day_of_the_month, 5);
    const vigil = migrated.events.find((e: any) => e.name === 'Test Vigil');
    assert(vigil, 'test event must survive migration');
    assertEquals(
      String(migrated.months[vigil!.month - 1].name).toLowerCase(),
      'nightal',
      'event anchor must still point at Nightal after migration',
    );
    // The rebuilt layout agrees with the installed engine's canon: each
    // festival sits directly after the engine's insertAfter month.
    const engine = engineWorlds.get('faerun');
    for (const ic of engine.calendar.intercalaries) {
      const slotIdx = slotIndexByName(migrated.months, ic.label.toLowerCase());
      assert(slotIdx > 0, `festival "${ic.label}" present`);
      let prevRegular = -1;
      for (let j = slotIdx - 1; j >= 0; j--) {
        if (!migrated.months[j].isIntercalary) { prevRegular = migrated.months[j].regularIndex; break; }
      }
      assertEquals(
        prevRegular,
        ic.insertAfter.monthIndex,
        `"${ic.label}" must sit after engine month ${ic.insertAfter.monthIndex}`,
      );
    }
  });

  it('is a no-op for campaigns already on the canon layout', () => {
    freshInstall();
    ensureSettings().calendarSystem = 'faerunian';
    checkInstall();
    const cal = getCal();
    const uktar = slotIndexByName(cal.months, 'uktar');
    cal.current.month = uktar;
    cal.current.day_of_the_month = 7;
    checkInstall(); // second boot: fingerprint absent → nothing to migrate
    const after = getCal();
    assertEquals(String(after.months[after.current.month].name).toLowerCase(), 'uktar');
    assertEquals(after.current.day_of_the_month, 7);
  });
});
