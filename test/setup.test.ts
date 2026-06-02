import { describe, it } from "node:test";
import { strictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { completeSetup, freshInstall } from "./helpers.js";
import { state_name } from "../src/constants.js";
import { handleInput } from "../src/boot-register.js";
import { notifySetupStatusOnReady } from "../src/setup.js";
import { checkInstall, getSetupState, resetToDefaults } from "../src/state.js";

function gmMsg(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}

function playerMsg(content: string) {
  return { type: "api", content, who: "Alice", playerid: "P1" } as any;
}

function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1] || null;
}

function chatLog() {
  return (globalThis as any)._chatLog as Array<{ who: string; msg: string; opts: any }>;
}

describe("Setup onboarding", () => {
  it("marks a blank install as uninitialized", () => {
    freshInstall();
    assertEquals(getSetupState().status, "uninitialized");
  });

  it("auto-migrates populated legacy state to complete", () => {
    (globalThis as any)._resetShim();
    (globalThis as any).state[state_name] = {
      settings: { calendarSystem: "eberron", calendarVariant: "standard" },
      calendar: {
        current: { month: 0, day_of_the_month: 1, day_of_the_week: 0, year: 998 },
        weekdays: ["Sul", "Mol", "Zol", "Wir", "Zor", "Far", "Sar"],
        months: Array.from({ length: 12 }, () => ({ days: 28 })),
        events: []
      }
    };
    checkInstall();
    assertEquals(getSetupState().status, "complete");
  });

  it("ready prompt whispers the welcome with all eight world picker buttons", () => {
    freshInstall();
    notifySetupStatusOnReady();
    const msg = lastChat();
    assert(msg);
    // Title carries an apostrophe — esc() emits &#39; so match on the
    // HTML-encoded form.
    assert(/Welcome to Party Buff(&#39;|')s Roll20 Calendar/.test(msg.msg));
    assert(/Select a calendar to get started/.test(msg.msg));
    // The button-emit pattern in this script renders chat buttons that
    // emit !cal setup pick <world>. We don't pin the exact HTML, just
    // confirm each canonical world's pick command is included.
    for (const sysKey of ['eberron', 'faerunian', 'greyhawk', 'dragonlance', 'exandria', 'mystara', 'birthright', 'gregorian']) {
      assert(msg.msg.includes('setup pick ' + sysKey), `welcome missing pick button for ${sysKey}`);
    }
    assertEquals(msg.opts.noarchive, true);
  });

  it("shows the boot summary without action buttons after setup is complete", () => {
    freshInstall();
    completeSetup();
    notifySetupStatusOnReady();
    const msg = lastChat();
    assert(msg);
    assert(msg.msg.startsWith("/direct "));
    assert(msg.msg.includes("Galifar Calendar Initialized"));
    assert(msg.msg.includes("font-style:italic"));
    assert(msg.msg.includes("Current date: <b>1st of Zarantyr, 998 YK</b>"));
    assert(msg.msg.includes("Use <code>!cal</code> to start."));
    assert(msg.msg.includes("Use <code>!cal help</code> for the command list."));
    assert(!msg.msg.includes("Calendar Script Initialized"));
    assert(!msg.msg.includes("Galifar Calendar is ready."));
    assert(!msg.msg.includes("!cal show"));
    assert(!msg.msg.includes("[📅 Show]"));
    assert(!msg.msg.includes("[❔ Help]"));
  });

  it("dismissal stores dismissed state and sends the exact follow-up", () => {
    freshInstall();
    handleInput(gmMsg("!cal setup dismiss"));
    assertEquals(getSetupState().status, "dismissed");
    assert(lastChat().msg.includes("No problem! Just call !cal at any time to begin the process."));
  });

  it("blocks players until the GM completes setup", () => {
    freshInstall();
    handleInput(playerMsg("!cal"));
    assert(lastChat().msg.includes("Calendar is waiting for the GM to finish setup"));
  });

  it("routes a GM root command into the welcome before initialization", () => {
    freshInstall();
    handleInput(gmMsg("!cal"));
    const msg = lastChat();
    assert(msg);
    assert(/Welcome to Party Buff(&#39;|')s Roll20 Calendar/.test(msg.msg));
    assert(/Select a calendar to get started/.test(msg.msg));
  });

  it("setup pick <world> applies the world default and completes setup", () => {
    freshInstall();
    handleInput(gmMsg("!cal setup pick eberron"));
    assertEquals(getSetupState().status, "complete");
    const root = (globalThis as any).state[state_name];
    assertEquals(root.settings.calendarSystem, "eberron");
    // colorTheme stays null in the default factory; tokens drive
    // customization, not the pick action.
    assertEquals(root.settings.colorTheme, null);
  });

  it("setup pick <world> fires the post-pick chain — chosen / reset / token / learn-more", () => {
    freshInstall();
    const before = chatLog().length;
    handleInput(gmMsg("!cal setup pick eberron"));
    const cards = chatLog().slice(before).map((e) => e.msg).join('\n');
    // Apostrophes are HTML-escaped (&#39;) — match the rendered form.
    assert(/You(&#39;|')ve chosen/i.test(cards), 'missing chosen-world card');
    assert(/resetcalendar/i.test(cards), 'missing reset hint card');
    assert(/token/i.test(cards), 'missing token hint card');
    assert(/partybuff\.com/i.test(cards), 'missing learn-more URL card');
  });

  it("setup pick <unknown> shows an error and stays uninitialized", () => {
    freshInstall();
    handleInput(gmMsg("!cal setup pick mars"));
    assertEquals(getSetupState().status, "uninitialized");
    assert(/Unknown world/i.test(lastChat().msg));
  });

  it("setup pick works for every offered world", () => {
    for (const sysKey of ['eberron', 'faerunian', 'greyhawk', 'dragonlance', 'exandria', 'mystara', 'birthright', 'gregorian']) {
      freshInstall();
      handleInput(gmMsg(`!cal setup pick ${sysKey}`));
      assertEquals(
        getSetupState().status,
        "complete",
        `pick ${sysKey} should complete setup`,
      );
      const root = (globalThis as any).state[state_name];
      assertEquals(
        root.settings.calendarSystem,
        sysKey,
        `pick ${sysKey} should set calendarSystem`,
      );
    }
  });

  it("resetcalendar returns the campaign to the onboarding gate", () => {
    freshInstall();
    completeSetup();
    resetToDefaults();
    assertEquals(getSetupState().status, "uninitialized");
    assert(lastChat().msg.includes("Use <code>!cal</code> to begin setup."));
  });
});
