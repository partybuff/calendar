// Regression test for the `!cal lunar all` infinite loop on intercalary
// worlds (faerunian, greyhawk, birthright).
//
// Root cause: engine `moons.nextEvent()` can return an intercalary-kind
// `CalendarDate` (a full/new moon landing on a festival day like Greyhawk's
// Needfest). src/moon.ts's engine→wrapper reverse mapping
// (`_calendarDateToWrapper`, formerly `_calendarDateMonthIndex`) looked the
// match up on `getCal().months[i]` — a runtime array that never carries
// `engineMonthIndex` / `intercalaryKey` — so it always missed and silently
// fell back to structural slot 0. It also passed the engine's raw
// `date.year` straight through, when src/engine-opts.ts's
// `serialToCalendarDate` ADDS the slot's `yearDelta` on the way out
// (`year: wrapped.year + slot.translation.yearDelta`) — so the reverse must
// SUBTRACT it. Greyhawk's Needfest carries yearDelta -1 specifically so the
// wrapper can render it at the start of a year while the engine keeps it at
// the end of the previous one. Together, the wrong (mi, year) mapped to a
// serial that didn't advance past the scan cursor, so
// `today.ts`'s `while (true)` in `_lunarAllHtml` never terminated.
import { describe, it } from "node:test";
import { ok as assert, strictEqual as assertEquals } from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { applyCalendarSystem } from "../src/state.js";
import { toSerial, fromSerial } from "../src/date-math.js";
import { _calendarDateToWrapper, _moonNextEvent } from "../src/moon.js";
import { commands } from "../src/today.js";
import { getStructuralArray } from "../src/worlds/index.js";

function gmMessage(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}
function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1];
}

describe("intercalary engine↔wrapper date mapping (src/moon.ts)", () => {
  it("greyhawk: reverses Needfest's yearDelta (-1), not slot-0 fallback", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("greyhawk", undefined);

    // Needfest is structural slot 0 for Greyhawk, translation yearDelta -1
    // (engine places it at the END of the prior year; wrapper renders it
    // at the START of the following one).
    const arr = getStructuralArray("greyhawk")!;
    const needfestIdx = arr.findIndex((s) => s.translation.kind === "intercalary" && s.translation.intercalaryKey === "needfest");
    assert(needfestIdx >= 0, "greyhawk has a Needfest structural slot");
    assertEquals((arr[needfestIdx].translation as any).yearDelta, -1);

    // Engine reports Needfest at engine-year 590 → wrapper year must be
    // 591 (590 - (-1)), landing on the Needfest structural slot, not 0
    // by accident-of-coincidence (Needfest *is* slot 0 here) with the
    // wrong year.
    const mapped = _calendarDateToWrapper({ kind: "intercalary", year: 590, intercalaryKey: "needfest", day: 1 });
    assertEquals(mapped.mi, needfestIdx);
    assertEquals(mapped.year, 591);

    // Round-trips through the wrapper's own serial codec.
    const serial = toSerial(mapped.year, mapped.mi, 1);
    const back = fromSerial(serial);
    assertEquals(back.year, 591);
    assertEquals(back.mi, needfestIdx);
    assertEquals(back.day, 1);
  });

  it("faerunian: maps an intercalary engine date to its real structural slot (not 0)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("faerunian", undefined);

    const arr = getStructuralArray("faerunian")!;
    const midsummerIdx = arr.findIndex((s) => s.translation.kind === "intercalary" && s.translation.intercalaryKey === "midsummer");
    assert(midsummerIdx > 0, "faerunian has a Midsummer structural slot after slot 0");

    const mapped = _calendarDateToWrapper({ kind: "intercalary", year: 1500, intercalaryKey: "midsummer", day: 1 });
    assertEquals(mapped.mi, midsummerIdx);
    assertEquals(mapped.year, 1500); // yearDelta 0 for Faerûn's intercalaries

    const serial = toSerial(mapped.year, mapped.mi, 1);
    const back = fromSerial(serial);
    assertEquals(back.year, 1500);
    assertEquals(back.mi, midsummerIdx);
  });

  it("birthright: maps an intercalary engine date to its real structural slot (not 0)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("birthright", undefined);

    const arr = getStructuralArray("birthright")!;
    const nightOfFireIdx = arr.findIndex((s) => s.translation.kind === "intercalary" && s.translation.intercalaryKey === "night_of_fire");
    assert(nightOfFireIdx > 0, "birthright has a Night of Fire structural slot after slot 0");

    const mapped = _calendarDateToWrapper({ kind: "intercalary", year: 551, intercalaryKey: "night_of_fire", day: 1 });
    assertEquals(mapped.mi, nightOfFireIdx);
    assertEquals(mapped.year, 551);
  });

  for (const world of ["faerunian", "greyhawk", "birthright"]) {
    it(`${world}: '!cal lunar all' terminates and renders a plausible year`, () => {
      freshInstall();
      completeSetup();
      applyCalendarSystem(world, undefined);

      const t0 = Date.now();
      commands.lunar(gmMessage("!cal lunar all"), ["!cal", "lunar", "all"]);
      const elapsed = Date.now() - t0;

      // Generous ceiling: this used to hang forever (100% CPU, never
      // returns). A correct run finishes in well under a second.
      assert(elapsed < 5000, `${world} lunar all returned in ${elapsed}ms`);

      const msg = String(lastChat().msg);
      assert(/Lunar/i.test(msg), `${world} lunar panel rendered`);
      // A working year listing names at least one real month/day pairing
      // ("N — Moonname Full/New"); the pre-fix failure mode was an
      // unterminated loop, not merely empty output, but this also guards
      // against a silent empty-result regression.
      assert(/Full|New/.test(msg), `${world} lists at least one moon event`);
    });
  }

  it("faerunian: repeated _moonNextEvent calls make forward progress across a year (bounded scan)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("faerunian", undefined);

    const yearStart = toSerial(1500, 0, 1);
    let cursor = yearStart - 1;
    let iterations = 0;
    const maxIterations = 200; // ~30-day synodic period over a year ≈ 12 events; generous cap.
    while (iterations < maxIterations) {
      const next = _moonNextEvent("Selûne", cursor, "full");
      if (next == null) break;
      assert(next > cursor, `cursor must strictly advance (was ${cursor}, got ${next})`);
      cursor = next;
      iterations++;
      if (next - yearStart > 366) break;
    }
    assert(iterations > 0 && iterations < maxIterations, `scan made bounded forward progress (${iterations} iterations)`);
  });
});
