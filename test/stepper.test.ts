// Month stepper (dashboard + every `show` output) and the send-appends-events
// broadcast. The stepper's Prev/Next emit ABSOLUTE month-anchored specs so
// repeated clicks walk; This Month / Year are fixed home keys.
import { describe, it } from "node:test";
import { ok as assert } from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { handleInput } from "../src/boot-register.js";

function gmMessage(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}
function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1];
}

describe("Month stepper + send events", () => {
  it("dashboard carries the month stepper", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    assert(msg.includes("This Month"), "stepper This Month");
    assert(msg.includes("!cal show month"), "This Month emits show month");
    assert(msg.includes("Year"), "stepper Year");
    assert(msg.includes("!cal show year"), "Year emits show year (campaign year)");
    assert(msg.includes("Prev"), "stepper Prev");
    assert(msg.includes("Next"), "stepper Next");
  });

  it("Prev/Next emit absolute month-anchored specs (walkable), not 'show next'", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    // The stepper must NOT emit the relative range command (which wouldn't
    // walk on repeated clicks); it bakes an absolute "Month D Year" spec.
    assert(!/!cal show next\b/.test(msg), "Next must not emit the relative 'show next'");
    assert(!/!cal show previous\b/.test(msg), "Prev must not emit the relative 'show previous'");
    // An absolute spec ends in the year, e.g. `show Nymm 12 998`.
    assert(/!cal show [A-Za-z][^)]*\d{2,}\)/.test(msg), "an absolute dated show spec is present");
  });

  it("a `show` output re-renders the stepper and a home tail", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal show month"));
    const msg = String(lastChat().msg);
    assert(msg.includes("This Month"), "stepper re-rendered under show");
    assert(msg.includes("Next"), "stepper Next under show");
    assert(msg.includes("!cal today"), "home tail → Dashboard");
    assert(msg.includes("!cal additional"), "tail → Additional");
  });

  it("`send` broadcasts the date with the canon event list appended", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal send"));
    const msg = String(lastChat().msg);
    // Default world/month (Eberron, Zarantyr) has canon events, so the full
    // "Events this month" block must be present regardless of density.
    assert(msg.includes("Events this month"), "broadcast includes the month event list");
    // Broadcasts are button-free.
    assert(!msg.includes("](!cal show month)"), "broadcast has no interactive stepper");
  });
});
