// GM "Lunar periods" setting — a published-model pick between the engine's
// default cycle table (Party Buff's month-matched periods) and the official
// WotC calendar-tool table (`Moon.officialCycleDays`, selected per call via
// `PhaseOptions.cycleSource: 'official'`; engine 0.48). The canon-only
// policy is unchanged: no anchors, no seeds — the setting only chooses
// between two tables the engine itself ships, and only worlds that publish
// an official table (Eberron) ever see the control.
import { describe, it } from "node:test";
import {
  strictEqual as assertEquals,
  deepStrictEqual as assertDeepEquals,
  ok as assert,
} from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { handleInput } from "../src/boot-register.js";
import { applyCalendarSystem, ensureSettings } from "../src/state.js";
import { getMoonOpts } from "../src/engine-opts.js";
import { worldHasOfficialLunarPeriods } from "../src/worlds/index.js";
import { moonPhaseAt } from "../src/moon.js";
import { toSerial } from "../src/date-math.js";
import { state_name } from "../src/constants.js";

function gmMessage(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}
function playerMessage(content: string) {
  return { type: "api", content, who: "Pia", playerid: "P1" } as any;
}
function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1];
}
function settings() {
  return (globalThis as any).state[state_name].settings;
}

describe("worldHasOfficialLunarPeriods capability probe", () => {
  it("is true for Eberron (all twelve moons carry officialCycleDays) and false elsewhere", () => {
    freshInstall();
    assertEquals(worldHasOfficialLunarPeriods("eberron"), true);
    assertEquals(worldHasOfficialLunarPeriods("faerunian"), false);
    assertEquals(worldHasOfficialLunarPeriods("dragonlance"), false);
    assertEquals(worldHasOfficialLunarPeriods("gregorian"), false);
    assertEquals(worldHasOfficialLunarPeriods(""), false);
    assertEquals(worldHasOfficialLunarPeriods("not-a-world"), false);
  });
});

describe("Settings panel — Lunar periods row is capability-gated", () => {
  it("renders the row on Eberron, showing the default and emitting the settings-lunar command", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    handleInput(gmMessage("!cal settings"));
    const msg = String(lastChat().msg);
    assert(msg.includes("Lunar periods: Party Buff"), "row present with default value");
    assert(msg.includes("settings lunar"), "row emits !cal settings lunar");
    // button() escapes parens in command payloads for Roll20 query safety.
    assert(msg.includes("Official &#40;WotC&#41;,official"), "official option offered");
    assert(msg.includes("Party Buff,partybuff"), "partybuff option offered");
    assert(/month-matched periods/.test(msg), "row description copy present");
  });

  it("reflects the current value after switching to official", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    handleInput(gmMessage("!cal settings lunar official"));
    const msg = String(lastChat().msg);
    assert(msg.includes("Lunar periods: Official (WotC)"), "panel re-rendered with official");
  });

  it("does not render the row on Faerûn (no official cycle table)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("faerunian", "standard");
    handleInput(gmMessage("!cal settings"));
    const msg = String(lastChat().msg);
    assert(!msg.includes("Lunar periods"), "no Lunar periods row off-Eberron");
    assert(!/settings lunar/.test(msg), "no settings-lunar emitter off-Eberron");
  });
});

describe("!cal settings lunar — command behavior", () => {
  it("official sets the field; partybuff deletes it (default is never stored)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    assertEquals(settings().lunarSource, undefined, "fresh install stores nothing");

    handleInput(gmMessage("!cal settings lunar official"));
    assertEquals(settings().lunarSource, "official", "official persisted");

    handleInput(gmMessage("!cal settings lunar partybuff"));
    assertEquals(settings().lunarSource, undefined, "back to default = field absent");
    assert(!("lunarSource" in settings()), "default must not be stored explicitly");
  });

  it("rejects an unknown value with usage and leaves state untouched", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    handleInput(gmMessage("!cal settings lunar wibble"));
    const msg = String(lastChat().msg);
    assert(/settings lunar \(partybuff\|official\)/.test(msg), "usage whispered");
    assertEquals(settings().lunarSource, undefined, "no state write on bad value");
  });

  it("whispers a no-effect notice on a world without the capability, with no state write", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("faerunian", "standard");
    handleInput(gmMessage("!cal settings lunar official"));
    const msg = String(lastChat().msg);
    assert(/no effect on this world/.test(msg), "explains the gate instead of false success");
    assertEquals(settings().lunarSource, undefined, "no state write off-Eberron");
  });

  it("is GM-only like the rest of the settings family", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    handleInput(playerMessage("!cal settings lunar official"));
    const msg = String(lastChat().msg);
    assert(/only the gm/i.test(msg), "player gets the GM-only notice");
    assertEquals(settings().lunarSource, undefined, "no state write for players");
  });
});

describe("getMoonOpts — cycleSource wiring", () => {
  it("returns {} by default (byte-identical to the pre-setting behavior)", () => {
    freshInstall();
    applyCalendarSystem("eberron", "standard");
    assertDeepEquals(getMoonOpts(), {});
  });

  it("returns { cycleSource: 'official' } when set on Eberron", () => {
    freshInstall();
    applyCalendarSystem("eberron", "standard");
    ensureSettings().lunarSource = "official";
    assertDeepEquals(getMoonOpts(), { cycleSource: "official" });
  });

  it("returns {} when the field is (somehow) set but the world lacks the capability", () => {
    freshInstall();
    applyCalendarSystem("faerunian", "standard");
    // Bypass applyCalendarSystem's own hygiene to simulate a stale field.
    ensureSettings().lunarSource = "official";
    assertDeepEquals(getMoonOpts(), {});
  });
});

describe("Moon phases actually differ between the two published models", () => {
  // Zarantyr's DEFAULT anchor: full at Zarantyr 1, 998 YK. Under the
  // official model (28→77-day swap plus the shared Zarantyr 1, -2202 YK
  // alignment anchor) that same date is NOT an inflection day — the two
  // models genuinely diverge rather than relabeling the same math.
  // (Nymm on the 1st of a month is a bad probe: its official 28-day
  // period divides the 336-day year, so it is full on every month's 1st
  // under BOTH models.)
  const ZARANTYR_ANCHOR = () => toSerial(998, 0, 1);

  it("default output is unchanged: Zarantyr is full on its 998-YK anchor with nothing set", () => {
    freshInstall();
    applyCalendarSystem("eberron", "standard");
    const ph = moonPhaseAt("Zarantyr", ZARANTYR_ANCHOR());
    assertEquals(ph.isFull, true, "golden pre-feature behavior");
    assert(ph.illum > 0.99, "fully lit");
  });

  it("under official the same date is not full, and flipping back restores the default", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    const before = moonPhaseAt("Zarantyr", ZARANTYR_ANCHOR());

    handleInput(gmMessage("!cal settings lunar official"));
    const official = moonPhaseAt("Zarantyr", ZARANTYR_ANCHOR());
    assertEquals(official.isFull, false, "official model diverges on this date");
    assert(
      Math.abs(official.illum - before.illum) > 0.01,
      "illumination differs between models",
    );

    handleInput(gmMessage("!cal settings lunar partybuff"));
    const after = moonPhaseAt("Zarantyr", ZARANTYR_ANCHOR());
    assertDeepEquals(after, before, "partybuff restores the exact default output");
  });

  it("all twelve moons stand full together at Zarantyr 1, -2202 YK only under official", () => {
    freshInstall();
    applyCalendarSystem("eberron", "standard");
    const alignment = toSerial(-2202, 0, 1);
    const moonNames = [
      "Zarantyr", "Olarune", "Therendor", "Eyre", "Dravago", "Nymm",
      "Lharvion", "Barrakas", "Rhaan", "Sypheros", "Aryth", "Vult",
    ];
    let defaultFulls = 0;
    for (const name of moonNames) if (moonPhaseAt(name, alignment).isFull) defaultFulls++;
    assert(defaultFulls < 12, "default model has no shared alignment instant");

    ensureSettings().lunarSource = "official";
    for (const name of moonNames) {
      assertEquals(moonPhaseAt(name, alignment).isFull, true, name + " full at alignment");
    }
  });
});

describe("World-switch hygiene", () => {
  it("switching to a world without the capability deletes the field", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    ensureSettings().lunarSource = "official";
    applyCalendarSystem("faerunian", "standard");
    assert(!("lunarSource" in settings()), "field dropped on switch to Faerûn");
  });

  it("a same-world re-apply (boot-style) keeps the GM's choice on Eberron", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    ensureSettings().lunarSource = "official";
    applyCalendarSystem("eberron", "standard");
    assertEquals(settings().lunarSource, "official", "capable world keeps the setting");
  });
});
