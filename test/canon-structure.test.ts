// Canon-structure invariants: the wrapper's composed structural order must
// agree with the engine's own intercalary placement, because the wrapper
// serializes dates with ITS order while moon phases re-serialize through
// the ENGINE's order — any mismatch makes lunar output discontinuous
// across the affected span (the exact failure engine 0.24.0's Faerûn
// festival reposition would have caused).
//
// Also covers scheme derivation: slots derived from the engine
// (deriveIntercalarySlots) must mirror the engine's intercalary list
// under WHICHEVER scheme the installed engine ships.
import { describe, it } from 'node:test';
import { strictEqual as assertEquals, ok as assert, deepStrictEqual as assertDeep } from 'node:assert/strict';
import './roll20-shim.js';
import { worlds as engineWorlds } from '@partybuff/calendar-engine';
import { WORLDS, getEngineId, getStructuralSlot } from '../src/worlds/index.js';

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

