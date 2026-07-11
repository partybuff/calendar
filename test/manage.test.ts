// GM Manage hub + the self-describing Settings flip panel.
import { describe, it } from "node:test";
import { ok as assert } from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { handleInput } from "../src/boot-register.js";
import { applyCalendarSystem } from "../src/state.js";

function gmMessage(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}
function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1];
}

describe("Manage hub + Settings panel", () => {
  it("!cal manage renders the GM config hub with a verb-guarded reset", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal manage"));
    const msg = String(lastChat().msg);
    assert(msg.includes("Manage"), "title");
    assert(msg.includes("Set Date"), "set date");
    assert(msg.includes("!cal settings"), "settings entry");
    assert(msg.includes("Themes"), "themes");
    assert(msg.includes("Broadcast Today"), "publish");
    // Reset confirm puts the choice at the VERB position: Cancel → harmless
    // `!cal today`, only "Yes RESET" fires resetcalendar.
    assert(msg.includes("Cancel,today"), "reset cancel guard");
    assert(msg.includes("Yes RESET,resetcalendar"), "reset confirm");
  });

  it("!cal settings renders the self-describing flip panel", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal settings"));
    const msg = String(lastChat().msg);
    assert(msg.includes("Settings"), "title");
    // Each toggle shows current state (default ON) and emits the OPPOSITE.
    assert(msg.includes("Moons: ON"), "moons state shown");
    assert(msg.includes("!cal settings moons off"), "moons emits the flip");
    // offcycle is out of scope — never surfaced.
    assert(!/settings offcycle/.test(msg), "offcycle excluded");
    // Events has no toggle — it's core canon content, not an optional
    // subsystem (asymmetric with moons/planes was the bug).
    assert(!/settings events/.test(msg), "events toggle excluded");
    assert(!msg.includes("Events:"), "no Events pill in the flip grid");
    // The Detail/verbosity picker had no reader — retired.
    assert(!/settings verbosity/.test(msg), "verbosity picker excluded");
    assert(!msg.includes("Detail:"), "no Detail pill in the flip grid");
  });

  it("the GM dashboard carries a Manage button", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    assert(msg.includes("!cal manage"), "dashboard Manage button");
  });
});

describe("Hemisphere gated on the wrapper's actual season-shift capability", () => {
  it("hides the Hemisphere button on Eberron (not hemisphere-aware)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    handleInput(gmMessage("!cal manage"));
    const msg = String(lastChat().msg);
    assert(!msg.includes("hemisphere ?{Hemisphere"), "no Hemisphere button on Eberron");
  });

  it("shows the Hemisphere button on Faerun (hemisphere-aware)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("faerunian", "standard");
    handleInput(gmMessage("!cal manage"));
    const msg = String(lastChat().msg);
    assert(msg.includes("hemisphere ?{Hemisphere"), "Hemisphere button present on Faerun");
  });

  it("!cal hemisphere on Eberron whispers a no-effect notice instead of a false success", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    handleInput(gmMessage("!cal hemisphere south"));
    const msg = String(lastChat().msg);
    assert(/no effect on this world/.test(msg), "explains hemisphere has no effect here");
    assert(!msg.includes("Hemisphere: <b>south</b>"), "must not claim a false success");
    // Bare status query is also gated, not just the north/south setter.
    handleInput(gmMessage("!cal hemisphere"));
    const msg2 = String(lastChat().msg);
    assert(/no effect on this world/.test(msg2), "status query is gated too");
  });

  it("!cal hemisphere still works on Faerun (hemisphere-aware)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("faerunian", "standard");
    handleInput(gmMessage("!cal hemisphere south"));
    const msg = String(lastChat().msg);
    assert(msg.includes("Hemisphere: <b>south</b>"), "sets hemisphere for real on an aware world");
  });

  it("hides Hemisphere on Exandria — the wrapper can't shift its seasons yet, even though the engine reports it aware", () => {
    // Guards the gate against regressing to the engine's hemisphereAware,
    // which reports Exandria/Mystara true; the wrapper's displayed season
    // labels don't flip N/S there, so the control must stay hidden until the
    // seasons reinstatement makes them shift.
    freshInstall();
    completeSetup();
    applyCalendarSystem("exandria", "standard");
    handleInput(gmMessage("!cal manage"));
    assert(!String(lastChat().msg).includes("hemisphere ?{Hemisphere"), "no Hemisphere button on Exandria");
    handleInput(gmMessage("!cal hemisphere south"));
    const msg = String(lastChat().msg);
    assert(/no effect on this world/.test(msg), "no-effect notice on Exandria");
    assert(!msg.includes("Hemisphere: <b>south</b>"), "must not claim a false success on Exandria");
  });
});
