// GM Manage hub + the self-describing Settings flip panel.
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
    assert(msg.includes("Events: ON"), "events state shown");
    assert(msg.includes("!cal settings events off"), "events emits the flip");
    assert(msg.includes("Moons: ON"), "moons state shown");
    // offcycle is out of scope — never surfaced.
    assert(!/settings offcycle/.test(msg), "offcycle excluded");
  });

  it("the GM dashboard carries a Manage button", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    assert(msg.includes("!cal manage"), "dashboard Manage button");
  });
});
