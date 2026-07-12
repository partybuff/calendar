// Engine-events parity: the wrapper hosts NO event content — every event
// is generated from engine `world.holidays` at compose time
// (worlds/index.ts eventPacksFromEngine). This suite is the fidelity
// oracle: for every world and every holiday, the wrapper's occurrence
// math must produce exactly the same days as the engine's own
// allOccurrencesIn(). It guards the rule-kind → DaySpec translation
// against both translation bugs and future engine spec-shape additions
// (the drift risk tracked as issue #170).
import { describe, it } from 'node:test';
import { strictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import './roll20-shim.js';
import { worlds as engineWorlds, holidays as engineHolidays } from '@partybuff/calendar-engine';
import { WORLDS, getEngineId, getStructuralSlot } from '../src/worlds/index.js';
import { freshInstall } from './helpers.js';
import { _sourceAllowedForCalendar, checkInstall, ensureSettings, getCal } from '../src/state.js';
import { toSerial } from '../src/date-math.js';
import { occurrencesInRange } from '../src/events.js';

/** Wrapper structural (index, day) for an engine CalendarDate. Usually the
 *  day carries straight through unchanged — but Gregorian's Leap Day is a
 *  genuine architecture mismatch: the engine models it as February growing
 *  to 29 days in a leap year (`{kind:'month', monthIndex:1, day:29}`,
 *  `intercalaries: []`), while the wrapper carves the 29th into its own
 *  banner-day intercalary slot immediately after February (so the calendar
 *  grid can render Feb as a fixed 28 cells + a one-day banner rather than a
 *  shape-shifting month) — see date-label-parity.test.ts's "renders the
 *  Gregorian banner leap day" case and rendering.ts's showBannerLeapDay path
 *  (which looks events up at `febLeapSlot`, day 1). Mirrors the same
 *  overflow routing worlds/index.ts::eventPacksFromEngine applies when
 *  composing the event, so this fixture's engine-side key matches what the
 *  wrapper actually produces. */
function structuralPositionFor(wrapperKey: string, d: any): { mi: number; day: number } | null {
  for (let mi = 0; ; mi++) {
    const slot = getStructuralSlot(wrapperKey, mi);
    if (!slot) return null;
    const t = slot.translation;
    if (d.kind === 'month' && t.kind === 'month' && t.engineMonthIndex === d.monthIndex) {
      if (d.day > slot.days) {
        const next = getStructuralSlot(wrapperKey, mi + 1);
        if (next && next.isIntercalary && next.leapEvery) return { mi: mi + 1, day: d.day - slot.days };
      }
      return { mi, day: d.day };
    }
    if (d.kind === 'intercalary' && t.kind === 'intercalary' && t.intercalaryKey === d.intercalaryKey) {
      return { mi, day: d.day };
    }
  }
}

describe('engine-events parity (wrapper occurrences == engine allOccurrencesIn)', () => {
  for (const wrapperKey of Object.keys(WORLDS)) {
    it(`${wrapperKey}: every engine holiday occurrence appears in wrapper events`, () => {
      const engineId = getEngineId(wrapperKey);
      const engine = engineWorlds.get(engineId);
      const holidays = engine.holidays || [];
      if (!holidays.length) return; // nothing to check

      freshInstall();
      ensureSettings().calendarSystem = wrapperKey;
      checkInstall();
      const cal = getCal();

      // Engine holidays may share a display label (e.g. Faerûn's "Dance of
      // the Swirling Winds" fires on both Greengrass and Highharvestide);
      // wrapper events only carry the label, so compare label-groups.
      const byLabel = new Map<string, any[]>();
      for (const h of holidays) {
        if (h.kind !== 'fixed' && (h.rule as any).kind === 'gregorian_table') continue; // documented skip
        if (!byLabel.has(h.label)) byLabel.set(h.label, []);
        byLabel.get(h.label)!.push(h);
      }

      // Four consecutive years from the engine default, to cross year
      // boundaries and (for leap-gated intercalaries) both gate states.
      const baseYear = engine.defaultDate.year;
      for (const year of [baseYear, baseYear + 1, baseYear + 2, baseYear + 3]) {
        const startSerial = toSerial(year, 0, 1);
        const endSerial = toSerial(year + 1, 0, 1) - 1;
        const wrapperOcc = occurrencesInRange(startSerial, endSerial);

        for (const [label, group] of byLabel) {
          const keys = group.map((h: any) => h.key).join('+');
          // Compare DISTINCT day-sets: two engine holidays sharing a label
          // AND a date (us_christmas_day + christian_christmas_day) dedupe
          // to one wrapper event, which is correct display behavior.
          const engineSet = new Set<string>();
          for (const h of group) {
            for (const d of engineHolidays.allOccurrencesIn(engineId, year, h.key)) {
              const pos = structuralPositionFor(wrapperKey, d);
              assert(pos != null, `${wrapperKey}/${keys}: engine date has no structural slot`);
              engineSet.add(pos!.mi + '/' + pos!.day);
            }
          }
          const wrapperSet = new Set<string>(
            wrapperOcc
              .filter((o: any) => String(o.e.name) === label)
              .map((o: any) => o.m + '/' + o.d),
          );
          assertEquals(
            wrapperSet.size,
            engineSet.size,
            `${wrapperKey}/${keys} (${label}) year ${year}: wrapper days `
              + `[${[...wrapperSet].join(', ')}] vs engine days [${[...engineSet].join(', ')}]`,
          );
          for (const d of engineSet) {
            assert(
              wrapperSet.has(d),
              `${wrapperKey}/${keys} (${label}) year ${year}: engine day ${d} `
                + `missing from wrapper [${[...wrapperSet].join(', ')}]`,
            );
          }
        }
      }

      // No orphans: every wrapper event SCOPED TO THIS WORLD traces back to
      // an engine holiday label (nothing hosted wrapper-side). Events from
      // other worlds' sources sit in state but are display-suppressed; only
      // this world's allowed sources are in scope for the check.
      const engineLabels = new Set(holidays.map((h: any) => h.label));
      for (const e of cal.events) {
        const src = (e.source != null) ? String(e.source).toLowerCase() : null;
        if (src && !_sourceAllowedForCalendar(src, wrapperKey)) continue;
        assert(
          engineLabels.has(String(e.name)),
          `${wrapperKey}: wrapper event "${e.name}" (source ${src}) has no engine holiday — content must live in the engine`,
        );
      }
    });
  }
});
