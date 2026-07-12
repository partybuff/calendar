// Today card season line: the engine's own "Month N of Y" numeric
// orientation (engine seasons.label, canon per-world) plus the wrapper's
// own season NAME after a middle-dot separator, when the world has one
// (src/ui.ts::_getSeasonLabel). Worlds with no defined seasons (Barovia —
// defaultSeasonKey: '') show the position alone, with no dangling
// separator. See src/ui.ts::sendCurrentDate's seasonLine and
// src/engine-opts.ts::monthPositionLabel.
import { describe, it } from "node:test";
import { ok as assert } from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { handleInput } from "../src/boot-register.js";
import { applyCalendarSystem, getCal } from "../src/state.js";

function gmMessage(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}
function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1];
}

describe("Today card season line", () => {
  it("eberron: 'Month N of Y · <season>' — Mid-summer at structural month 7", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("eberron", "standard");
    const cal = getCal();
    // Eberron's SEASON_SETS names index 6 ("Mid-summer") lands on the 7th
    // month (1-based) — set the current date there directly.
    cal.current.month = 6;
    cal.current.day_of_the_month = 1;
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    assert(msg.includes("Month 7 of 12 · Mid-summer"), `expected season line in: ${msg}`);
  });

  it("faerunian: 'Month N of Y · <season>' at the engine default date", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("faerunian", "standard");
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    assert(/Month \d+ of \d+ · \S/.test(msg), `expected a "Month N of Y · Season" line in: ${msg}`);
  });

  it("barovia: shows the position alone — no dangling separator (no defined seasons)", () => {
    freshInstall();
    completeSetup();
    applyCalendarSystem("barovia");
    handleInput(gmMessage("!cal today"));
    const msg = String(lastChat().msg);
    assert(/Month \d+ of \d+/.test(msg), `expected a "Month N of Y" position label in: ${msg}`);
    assert(!msg.includes("·"), `expected no middle-dot separator for a world with no seasons in: ${msg}`);
  });
});
