// Coverage for release-audit remediation items not already exercised
// elsewhere: `!cal set` usage survives the USAGE-table trim, and the
// migration that strips the three retired settings keys
// (offCyclePlanes / eventsEnabled / subsystemVerbosity) from old-style
// saved state. Hemisphere honesty and the events-subcommand hint are
// covered in manage.test.ts and panel-routing.test.ts respectively.
import { describe, it } from "node:test";
import { ok as assert, strictEqual as assertEquals } from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { handleInput } from "../src/boot-register.js";
import { state_name } from "../src/constants.js";
import { ensureSettings } from "../src/state.js";

function gmMessage(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}
function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1];
}

describe("!cal set usage", () => {
  it("!cal set with no args still emits its usage line (USAGE['date.set'] survives the table trim)", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal set"));
    const msg = String(lastChat().msg);
    assert(msg.includes("Usage: !cal set "), "USAGE['date.set'] still reads directly: " + msg);
  });
});

describe("Retired settings keys — migration", () => {
  it("ensureSettings deletes offCyclePlanes, eventsEnabled, and subsystemVerbosity from a seeded old-style settings object", () => {
    freshInstall();
    const state = (globalThis as any).state;
    state[state_name] = {
      settings: {
        calendarSystem: "eberron",
        calendarVariant: "standard",
        seasonVariant: "eberron",
        offCyclePlanes: true,
        eventsEnabled: false,
        subsystemVerbosity: "minimal",
      },
    };
    const s = ensureSettings();
    assertEquals(Object.prototype.hasOwnProperty.call(s, "offCyclePlanes"), false, "offCyclePlanes deleted");
    assertEquals(Object.prototype.hasOwnProperty.call(s, "eventsEnabled"), false, "eventsEnabled deleted");
    assertEquals(Object.prototype.hasOwnProperty.call(s, "subsystemVerbosity"), false, "subsystemVerbosity deleted");
  });
});
