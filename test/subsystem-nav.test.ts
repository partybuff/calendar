// Subsystem panels use their OWN stepper vocabulary (distinct from the
// month stepper), and event rows are clickable → their detail card.
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

describe("Subsystem panel navigation", () => {
  it("events panel: distinct stepper labels + clickable event rows", () => {
    freshInstall();
    completeSetup();
    handleInput(gmMessage("!cal events panel"));
    const msg = String(lastChat().msg);
    // Reads distinct from the top-level month stepper.
    assert(msg.includes("Prev Events"), "prev label");
    assert(msg.includes("Next Events"), "next label");
    assert(!msg.includes("This Month"), "no month stepper on a subsystem panel");
    // Each of today's canon events is a button to its detail card.
    assert(/!cal event [A-Za-z]/.test(msg), "an event row is an `event <name>` button");
  });

  it("moon panel uses the Moon stepper vocabulary", () => {
    freshInstall();
    completeSetup();
    const log = (globalThis as any)._chatLog;
    log.length = 0;
    // moonPanelParts() sends multiple messages (Roll20 size limits), so scan
    // all of them, not just the last.
    handleInput(gmMessage("!cal moon on Zarantyr 1 998"));
    const all = log.map((e: any) => String(e.msg)).join("\n");
    assert(all.includes("Prev Moon"), "prev moon label");
    assert(all.includes("Next Moon"), "next moon label");
  });
});
