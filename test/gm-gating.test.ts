// Regression test for the `!cal today manage <action>` GM-gate bypass.
//
// today.ts's `sub === 'manage'` branch re-dispatches `commands[mAction]`
// directly (it backs the GM-only Management dropdown reached via
// `!cal today` → "Manage" → a button). It used to call `.run()` (or the
// bare function) without checking the target command's `gm:true` flag —
// unlike the top-level dispatcher (src/boot-register.ts), which gates on
// `cmd.gm && !playerIsGM(msg.playerid)` before ever calling `.run()`. That
// let a non-GM reach gm:true actions (resetcalendar, advance, retreat, …)
// straight through the "manage" redirect, bypassing the gate entirely.
import { describe, it } from "node:test";
import { ok as assert, strictEqual as assertEquals } from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { handleInput } from "../src/boot-register.js";
import { getCal, getSetupState } from "../src/state.js";

function gmMessage(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}
function playerMessage(content: string) {
  return { type: "api", content, who: "Alice", playerid: "P1" } as any;
}
function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1];
}

describe("!cal today manage <action> — GM gate", () => {
  it("a non-GM caller cannot reset the campaign via the manage redirect", () => {
    freshInstall();
    completeSetup();
    const before = JSON.stringify(getCal());
    const beforeStatus = getSetupState().status;

    handleInput(playerMessage("!cal today manage resetcalendar"));

    // State must be untouched: resetToDefaults() wipes state[state_name]
    // and reruns checkInstall(), which flips setup status back to
    // 'uninitialized' — so an unchanged status is a strong signal the
    // reset never fired.
    assertEquals(getSetupState().status, beforeStatus, "setup status unchanged");
    assertEquals(JSON.stringify(getCal()), before, "calendar state unchanged");

    const chat = lastChat();
    assert(chat, "a whisper was sent");
    assert(/only the gm/i.test(String(chat.msg)), "GM-only notice shown");
  });

  it("a non-GM caller cannot advance the date via the manage redirect", () => {
    freshInstall();
    completeSetup();
    const beforeDay = getCal().current.day_of_the_month;
    const beforeMonth = getCal().current.month;
    const beforeYear = getCal().current.year;

    handleInput(playerMessage("!cal today manage advance 30"));

    assertEquals(getCal().current.day_of_the_month, beforeDay, "day unchanged");
    assertEquals(getCal().current.month, beforeMonth, "month unchanged");
    assertEquals(getCal().current.year, beforeYear, "year unchanged");

    const chat = lastChat();
    assert(chat, "a whisper was sent");
    assert(/only the gm/i.test(String(chat.msg)), "GM-only notice shown");
  });

  it("a GM caller still routes 'manage advance' through to the real handler", () => {
    freshInstall();
    completeSetup();
    const before = getCal().current.day_of_the_month;

    handleInput(gmMessage("!cal today manage advance 3"));

    assertEquals(getCal().current.day_of_the_month, before + 3, "GM advance still applies");
  });

  it("a GM caller can still reset via the manage redirect", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal today manage resetcalendar"));

    // resetToDefaults() reruns checkInstall(), which sets setup status back
    // to 'uninitialized' — the clearest signal the GM's reset actually ran.
    assertEquals(getSetupState().status, "uninitialized", "GM reset still applies");
  });
});
