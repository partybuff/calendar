// Dashboard "views" chips — one-click into each subsystem, world-gated the
// same way as the Additional hub (Moons when enabled, Planes only on Eberron).
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

describe("Dashboard view chips (world-gated)", () => {
  it("Eberron shows Events, Moons, and Planes chips", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    assert(msg.includes("!cal events current"), "Events chip");
    assert(msg.includes("!cal moon summary"), "Moons chip");
    assert(msg.includes("!cal planar current"), "Planes chip on Eberron");
  });

  it("a non-Eberron world hides the Planes chip but keeps Events/Moons", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("faerunian", "standard");
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    assert(msg.includes("!cal events current"), "Events chip");
    assert(msg.includes("!cal moon summary"), "Moons chip (Faerun has moons)");
    assert(!msg.includes("!cal planar current"), "no Planes chip off Eberron");
  });
});
