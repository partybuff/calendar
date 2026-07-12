// Tests for events, utilities, and color subsystems.
import { describe, it } from "node:test";
import { strictEqual as assertEquals, notStrictEqual as assertNotEquals, ok as assert } from "node:assert/strict";
import { freshInstall } from "./helpers.js";
import { applyCalendarSystem, getCal, ensureSettings, getManualSuppressedSources, titleCase, colorForMonth, weekLength } from "../src/state.js";
import { getEventsFor, eventKey, compareEvents, getEventColor, isDefaultEvent, sortEventsByPriority } from "../src/events.js";
import { _stableHash, sanitizeHexColor, resolveColor, textColor, _relLum, _contrast } from "../src/color.js";
import { clamp, esc } from "../src/rendering.js";

// ============================================================================
// 4) EVENTS
// ============================================================================

describe("Events", () => {
  it("default events are loaded on install", () => {
    freshInstall();
    const events = getCal().events;
    assert(Array.isArray(events));
    assert(events.length > 0);
  });

  it("getEventsFor finds known default events", () => {
    freshInstall();
    const events = getCal().events;
    const numericEvent = events.find((e: any) => typeof e.day === "number" || /^\d+$/.test(String(e.day)));
    assert(numericEvent, "should have at least one numeric-day event");
    const dayNum = parseInt(numericEvent.day, 10);
    const found = getEventsFor(numericEvent.month - 1, dayNum, null);
    assert(found.length >= 1);
    assert(found.some((e: any) => e.name === numericEvent.name));
  });

  it("eventKey is stable", () => {
    freshInstall();
    const ev = { month: 3, day: 15, year: null, name: "Test Holiday" };
    assertEquals(eventKey(ev), eventKey(ev));
  });

  it("compareEvents orders by year then month", () => {
    freshInstall();
    assert(compareEvents({ month: 1, day: 1, year: 998 },
                         { month: 1, day: 1, year: 999 }) < 0);
    assert(compareEvents({ month: 1, day: 1, year: 998 },
                         { month: 6, day: 1, year: 998 }) < 0);
  });

  it("default events have hex colors", () => {
    freshInstall();
    for (const e of getCal().events.slice(0, 10)) {
      const color = getEventColor(e);
      assert(color && color.startsWith("#"), `"${e.name}" color: ${color}`);
    }
  });

  it("restores auto-suppressed calendar sources when switching away and back", () => {
    freshInstall();
    const initial = getCal().events.filter((evt: any) => evt.source === "eberron:sharn").length;
    assert(initial > 0, "expected Eberron-only default events at baseline");
    applyCalendarSystem("gregorian", "standard");
    const suppressed = getCal().events.filter((evt: any) => evt.source === "eberron:sharn").length;
    assertEquals(suppressed, 0);
    applyCalendarSystem("eberron", "standard");
    const restored = getCal().events.filter((evt: any) => evt.source === "eberron:sharn").length;
    assert(restored > 0, "switching back should restore automatically allowed default sources");
  });

  it("keeps manual source suppression across calendar switches", () => {
    freshInstall();
    const manual = getManualSuppressedSources();
    manual["eberron:sharn"] = 1;
    applyCalendarSystem("gregorian", "standard");
    applyCalendarSystem("eberron", "standard");
    const restored = getCal().events.filter((evt: any) => evt.source === "eberron:sharn").length;
    assertEquals(restored, 0, "manually suppressed sources should stay suppressed after calendar changes");
  });
});

// ============================================================================
// Seasonal event fill-color priority
//
// 'seasonal' holidays (world-prefixed 'eberron:seasonal', civil/almanac
// bookkeeping — New Year, solstices) shade a calendar cell only when
// nothing else is on the day: every other source outranks them for the
// FILL COLOR (sortEventsByPriority's events[0]), structurally, in every
// world — not via a per-world priority-list entry.
// ============================================================================

describe("Seasonal event fill-color priority", () => {
  it("a day with a seasonal event + another-source event: the other source's color wins", () => {
    freshInstall();
    applyCalendarSystem("eberron");
    const cal = getCal();
    const year = cal.current.year;
    // Eberron 1 Zarantyr (month 1, day 1) carries "New Year's Day"
    // (eberron:seasonal) by default. Add a synthetic non-seasonal event
    // on the same day and confirm it wins the fill-color slot.
    cal.events.push({ name: "Test Festival", month: 1, day: "1", year: null, color: "#123456", source: "eberron:sharn" });
    const events = getEventsFor(0, 1, year);
    assert(events.some((e: any) => e.source === "eberron:seasonal"), "fixture: seasonal event present");
    assert(events.some((e: any) => e.name === "Test Festival"), "fixture: other-source event present");
    const sorted = sortEventsByPriority(events);
    assertEquals(sorted[0].name, "Test Festival");
    assertEquals(getEventColor(sorted[0]), "#123456");
  });

  it("a day with only a seasonal event: the seasonal event's color wins", () => {
    freshInstall();
    applyCalendarSystem("eberron");
    const cal = getCal();
    const year = cal.current.year;
    // Eberron 21 Sypheros (month 12, day 21) carries only "Winter
    // Solstice" (eberron:seasonal) by default — no coincident event.
    const events = getEventsFor(11, 21, year);
    assertEquals(events.length, 1, "fixture: Winter Solstice has no other event sharing its day");
    assertEquals(events[0].source, "eberron:seasonal");
    const sorted = sortEventsByPriority(events);
    assertEquals(sorted[0].source, "eberron:seasonal");
    assertEquals(getEventColor(sorted[0]), events[0].color);
  });
});

// ============================================================================
// 5) UTILITIES
// ============================================================================

describe("Utilities", () => {
  it("_stableHash is deterministic", () => {
    freshInstall();
    assertEquals(_stableHash("hello"), _stableHash("hello"));
    assertNotEquals(_stableHash("hello"), _stableHash("world"));
  });

  it("clamp restricts values to range", () => {
    freshInstall();
    assertEquals(clamp(5, 1, 10), 5);
    assertEquals(clamp(-1, 1, 10), 1);
    assertEquals(clamp(15, 1, 10), 10);
  });

  it("esc escapes HTML entities", () => {
    freshInstall();
    assertEquals(esc("<b>bold</b>"), "&lt;b&gt;bold&lt;/b&gt;");
    assertEquals(esc('"quotes"'), "&quot;quotes&quot;");
  });

  it("titleCase capitalizes first letter", () => {
    freshInstall();
    assertEquals(titleCase("hello"), "Hello");
  });

  it("sanitizeHexColor validates hex colors", () => {
    freshInstall();
    assert(sanitizeHexColor("#FF0000"));
    assert(!sanitizeHexColor("not-a-color"));
  });

  it("textColor returns readable contrast on dark and light backgrounds", () => {
    freshInstall();
    const onDark = textColor("#000000");
    const onLight = textColor("#FFFFFF");
    assert(onDark);
    assert(onLight);
    assert(_contrast("#000000", onDark) >= 4.5);
  });

  it("colorForMonth returns hex for each month", () => {
    freshInstall();
    for (let i = 0; i < 12; i++) {
      const c = colorForMonth(i);
      assert(c && c.startsWith("#"), `month ${i}: ${c}`);
    }
  });
});
