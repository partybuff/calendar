// Tests for date-spec parsing: numeric months address REAL months only
// (intercalary festivals are skipped), and festivals are reachable by name
// — including a bare name with no day.
import { describe, it } from "node:test";
import { strictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { freshInstall } from "./helpers.js";
import { applyCalendarSystem, getCal } from "../src/state.js";
import { Parse, flatIndexForRealMonth } from "../src/parsing.js";

function realMonthFlatIndexes() {
  const cal = getCal();
  const out: number[] = [];
  cal.months.forEach((m: any, i: number) => { if (!m.isIntercalary) out.push(i); });
  return out;
}

describe("Date-spec parsing — real-month numerals vs. named festivals", () => {
  it("a numeric month skips interleaved festivals (Harptos)", () => {
    freshInstall();
    applyCalendarSystem("faerunian", "standard"); // Harptos: months interleaved with 5 festivals
    const cal = getCal();
    const real = realMonthFlatIndexes();
    // Sanity: at least one festival sits before the 5th real month, so a raw
    // flattened index would diverge from the real-month ordinal.
    const fifthReal = real[4];
    assert(fifthReal > 4, "expected festivals to shift the 5th real month past flat index 4");

    assertEquals(flatIndexForRealMonth(5), fifthReal);

    const r = Parse.looseMDY(["5", "14"]);
    assertEquals(r.kind, "mdy");
    assertEquals(r.mi, fifthReal, "numeric month 5 must land on the 5th REAL month");
    assertEquals(r.day, 14);
    assert(!cal.months[r.mi].isIntercalary, "a numeric month must never land on a festival");

    // Out-of-range numeric month clamps to the last real month, not a festival.
    const last = Parse.looseMDY(["99", "1"]);
    assertEquals(last.mi, real[real.length - 1]);
    assert(!cal.months[last.mi].isIntercalary);
  });

  it("a bare festival name resolves to its first day (Harptos)", () => {
    freshInstall();
    applyCalendarSystem("faerunian", "standard");
    const cal = getCal();
    const midIdx = cal.months.findIndex((m: any) => m.isIntercalary && /midwinter/i.test(String(m.name || "")));
    assert(midIdx !== -1, "Harptos should have a Midwinter festival");

    const r = Parse.looseMDY(["Midwinter"]);
    assertEquals(r.kind, "mdy");
    assertEquals(r.mi, midIdx);
    assertEquals(r.day, 1);
    assertEquals(r.year, null);
    assert(cal.months[r.mi].isIntercalary);
  });

  it("a named festival with an explicit day keeps the day (Greyhawk week festival)", () => {
    freshInstall();
    applyCalendarSystem("greyhawk", "standard"); // Growfest etc. are 7-day festival weeks
    const cal = getCal();
    const growIdx = cal.months.findIndex((m: any) => m.isIntercalary && /growfest/i.test(String(m.name || "")));
    assert(growIdx !== -1, "Greyhawk should have a Growfest festival week");

    const r = Parse.looseMDY(["Growfest", "3"]);
    assertEquals(r.kind, "mdy");
    assertEquals(r.mi, growIdx);
    assertEquals(r.day, 3);
  });

  it("monthYearLoose (recurring/event specs) uses the same real-month numbering", () => {
    freshInstall();
    applyCalendarSystem("faerunian", "standard");
    const cal = getCal();
    const real = realMonthFlatIndexes();

    const r = Parse.monthYearLoose(["5", "14"]);
    assertEquals(r.mi, real[4], "numeric month 5 must land on the 5th REAL month");
    assertEquals(r.day, 14);
    assert(!cal.months[r.mi].isIntercalary);

    // A number past the real-month count is not treated as a month (so a
    // bare year isn't misread) — mi stays -1.
    const yearish = Parse.monthYearLoose([String(real.length + 3)]);
    assertEquals(yearish.mi, -1);
  });

  it("Eberron (no intercalaries) keeps 1:1 numeric months", () => {
    freshInstall();
    applyCalendarSystem("eberron", "standard");
    const cal = getCal();
    // No festivals, so real-month N is just flattened index N-1.
    assertEquals(flatIndexForRealMonth(9), 8);
    const r = Parse.looseMDY(["9", "14"]);
    assertEquals(r.mi, 8);
    assertEquals(r.day, 14);
    assert(!cal.months[8].isIntercalary);
  });
});
