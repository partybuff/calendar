import { describe, it } from "node:test";
import { ok as assert, strictEqual as assertEquals } from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { getCal } from "../src/state.js";
import { toSerial } from "../src/date-math.js";
import { handleInput } from "../src/boot-register.js";
import { eventKey } from "../src/events.js";
import { handleMoonCommand } from "../src/moon.js";
import { handlePlanesCommand } from "../src/planes.js";

function gmMessage(content: string) {
  return {
    type: "api",
    content,
    who: "GM (GM)",
    playerid: "GM"
  } as any;
}

function gmUser() {
  return { who: "GM (GM)", playerid: "GM" } as any;
}

function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1];
}

describe("Redesigned panel routing", () => {
  it("routes Today additional-options Events into the Events panel", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal today options events"));

    const msg = String(lastChat().msg);
    assert(msg.includes("Events"));
    assert(msg.includes("Send to Players"));
    assert(msg.includes("Additional Ranges"));
    // Retired custom-event management (add/monthly/yearly, source/list) is gone.
    assert(!msg.includes("Add Single Event"));
    assert(!msg.includes("Manage Event Sources"));
    assert(!msg.includes("Hide/Show Event"));
    assert(!msg.includes("events source"));
    assert(!msg.includes("events list"));
  });

  it("gates the Events panel's Send-to-Players button to the GM (players would only hit the GM-only error)", () => {
    freshInstall();
    completeSetup();

    // Player opens the same panel — everything renders except the Send
    // button, which fires the GM-only `!cal send`.
    handleInput({ type: "api", content: "!cal events panel", who: "Alyra (Player)", playerid: "player1" } as any);
    const playerMsg = String(lastChat().msg);
    assert(playerMsg.includes("Events"), "player still sees the events panel");
    assert(playerMsg.includes("Additional Ranges"), "player still sees the rest of the panel");
    assert(!playerMsg.includes("Send to Players"), "player must NOT see the GM-only Send button");

    // GM opens it — the button is back.
    handleInput(gmMessage("!cal events panel"));
    assert(String(lastChat().msg).includes("Send to Players"), "GM still gets the Send button");
  });

  it("hints the live events subcommands, not the retired add/remove family", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal events bogus"));

    const msg = String(lastChat().msg);
    assert(msg.includes("Try: current | all"), "hint lists the live subcommands");
    assert(!msg.includes("addmonthly"), "no addmonthly in the hint");
    assert(!msg.includes("addyearly"), "no addyearly in the hint");
    assert(!/Try:.*\bremove\b/.test(msg), "no remove in the hint");
    assert(!/Try:.*\brestore\b/.test(msg), "no restore in the hint");
  });

  it("keeps the Events send button aligned to the displayed month", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal events panel " + toSerial(998, 1, 12)));

    const msg = String(lastChat().msg);
    assert(msg.includes("!cal send Olarune 998"));
    assert(!msg.includes("send ?{Calendar range|this month}"));
  });

  // Removed: "opens Source Controls and the real list workflow from
  // Events management" \u2014 exercised `!cal events manage source` and
  // `!cal events manage list`, both retired with the GM event-management
  // family. Events are canon-pack only per DESIGN.md \u00a71; configuration
  // flows through `!cal token` from the web app.

  it("routes Today additional-options Admin into the GM menu without undefined output", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal today options admin"));

    const log = (globalThis as any)._chatLog;
    const msg = String(lastChat().msg);
    // Admin/help routes to the docs-only Help reference (config now lives in Manage).
    assert(msg.includes("Reading the Calendar"));
    assert(!log.some((entry: any) => String(entry.msg) === "undefined"));
  });

  it("renders source controls in the default priority order with plain Show/Hide labels", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal source list"));

    const msg = String(lastChat().msg);
    const order = ["Khorvaire", "Sovereign Host", "Sharn", "Dark Six", "Silver Flame", "Stormreach"];
    for (let i = 1; i < order.length; i++) {
      assert(msg.indexOf(order[i - 1]) < msg.indexOf(order[i]));
    }
    assert(msg.includes("[Hide](!cal source disable Khorvaire"));
    assert(!msg.includes("[\uD83D\uDCC5 Hide]"));
    assert(!msg.includes("[\uD83D\uDCC5 Show]"));
  });

  // Removed: "shows hide/show controls directly in the event list" and
  // "treats source controls as bulk hide/show for the shared event
  // list" \u2014 both exercised `!cal list` / `!cal remove key` / `!cal
  // restore key`, the GM event-management surface retired in this PR.
  // The source-pack toggle (`!cal source disable/enable Silver Flame`)
  // still exists as a separate GM tool, but its end-to-end coupling
  // with the event list is gone.

  it("builds viewed-date Additional Ranges commands for events and renders year, rolling, month, and specific ranges", () => {
    freshInstall();
    completeSetup();

    const serial = toSerial(998, 1, 12);
    handleInput(gmMessage("!cal events panel " + serial));

    let msg = String(lastChat().msg);
    assert(msg.includes("Full Calendar Year &#40;998&#41;,year 998"));
    assert(msg.includes("Rolling 12 Months,rolling " + serial));
    assert(msg.includes("Upcoming Month,?\\{Upcoming Month&#124;Therendor 998 YK&#44;month Therendor 998"));
    assert(msg.includes("Zarantyr 999 YK&#44;month Zarantyr 999"));
    assert(!msg.includes("Olarune 998 YK&#44;month Olarune 998"));
    assert(msg.indexOf("Therendor 998 YK&#44;month Therendor 998") < msg.indexOf("Zarantyr 999 YK&#44;month Zarantyr 999"));
    assert(msg.includes("Specific Month,specific ?\\{Month&#124;Therendor 998\\}"));

    handleInput(gmMessage("!cal events ranges year 998"));
    msg = String(lastChat().msg);
    assert(msg.includes("Full Calendar Year (998)"));
    assert(msg.includes("Zarantyr"));
    assert(!msg.includes("Calendar Jump Syntax"));
    assert(!msg.includes("997 YK"));

    handleInput(gmMessage("!cal events ranges rolling " + serial));
    msg = String(lastChat().msg);
    assert(msg.includes("Rolling 12 Months"));
    assert(msg.includes("Zarantyr"));
    assert(msg.includes("Vult"));
    assert(!msg.includes("Calendar Jump Syntax"));

    handleInput(gmMessage("!cal events ranges month Zarantyr 999"));
    msg = String(lastChat().msg);
    assert(msg.includes("Zarantyr 999 YK"));
    assert(!msg.includes("Calendar Jump Syntax"));

    handleInput(gmMessage("!cal events ranges specific Therendor 998"));
    msg = String(lastChat().msg);
    assert(msg.includes("Therendor 998 YK"));
    assert(!msg.includes("Calendar Jump Syntax"));
  });
});

describe("Moon management routing", () => {
  it("routes today-options moon and moon phases into the compact moon summary", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal today options moon"));
    let log = (globalThis as any)._chatLog.map((entry: any) => String(entry.msg)).join("\n");
    assert(log.includes("Moon Summary"));
    assert(!log.includes("Moon Overview"));

    (globalThis as any)._chatLog.length = 0;
    handleMoonCommand(gmUser(), ["moon", "phases"]);
    log = (globalThis as any)._chatLog.map((entry: any) => String(entry.msg)).join("\n");
    assert(log.includes("Moon Summary"));
    assert(!log.includes("Moon Overview"));
  });

  it("emits the toggle-only moon management dropdown", () => {
    freshInstall();

    handleMoonCommand(gmUser(), ["moon"]);

    let msg = String(lastChat().msg);
    // After PR 2c the wrapper only owns the moons-enabled toggle; per-
    // moon anchors and reseeds (`Set New`, `Set Full`, `Reseed Moons`,
    // `Set Night of the Eye`) moved to the web app and flow in via
    // `!cal token`. The dropdown carries Toggle only.
    assert(msg.includes("moon manage ?{Action|Toggle Moons On/Off,toggle}"));
    assert(!msg.includes("Reseed Moons,reseed"));
    assert(!msg.includes("Set New,setnew"));
    assert(!msg.includes("Set Full,setfull"));
    assert(!msg.includes("Bind Moon Page,page bind"));
    assert(!msg.includes("Show Moon Page,page show"));
    assert(!msg.includes("Set Night of the Eye"));
    assert(!msg.includes("moon phases"));
  });
});

describe("Planes routing", () => {
  it("routes today-options planes into the compact planes summary", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal today options planes"));
    let log = (globalThis as any)._chatLog.map((entry: any) => String(entry.msg)).join("\n");
    assert(log.includes("Planar Summary"));
    assert(!log.includes("Planar Phases"));

    (globalThis as any)._chatLog.length = 0;
    handlePlanesCommand(gmUser(), ["planes", "phases"]);
    log = (globalThis as any)._chatLog.map((entry: any) => String(entry.msg)).join("\n");
    assert(log.includes("Planar Summary"));
    assert(!log.includes("Planes: <code>!cal planes</code>"));
  });

  it("exposes only read-only GM controls \u2014 no override, seed, or anchor wizardry", () => {
    freshInstall();

    handlePlanesCommand(gmUser(), ["planes"]);

    const log = (globalThis as any)._chatLog.map((entry: any) => String(entry.msg)).join("\n");
    assert(!log.includes("planes manage"), "no management dropdown should remain");
    assert(!log.includes("anchorwizard"), "no anchor wizard should remain");
    assert(!log.includes("seedinit"), "no seed wizard should remain");
    assert(log.includes("planes toggle"), "subsystem toggle should still be available to the GM");
  });

  it("retires the planes panel's Send to Players button \u2014 !cal send is the only public broadcast surface", () => {
    freshInstall();

    handlePlanesCommand(gmUser(), ["planes"]);

    const log = (globalThis as any)._chatLog.map((entry: any) => String(entry.msg)).join("\n");
    assert(!log.includes("planes send"), "no lingering 'planes send' button/command should remain in the panel");
    assert(!log.includes("Send to Players"), "the planes panel must not offer its own public broadcast button");
  });

  it("!cal planes send no longer broadcasts \u2014 it produces zero /direct messages", () => {
    freshInstall();

    handlePlanesCommand(gmUser(), ["planes", "send"]);

    const broadcasts = (globalThis as any)._chatLog.filter((entry: any) => String(entry.msg).startsWith("/direct "));
    assertEquals(broadcasts.length, 0, "!cal planes send must not broadcast publicly; !cal send is the only public broadcast surface");

    // Falls through to the ordinary whispered subcommand summary instead of
    // erroring or broadcasting \u2014 same shape as any other unrecognized sub.
    const msg = String(lastChat().msg);
    assert(msg.startsWith('/w "GM" '), "the response to a retired subcommand must still be a whisper");
    assert(!msg.includes("!cal planes send"), "the whispered summary should no longer advertise the retired command");
  });

  it("renders plane Additional Ranges against the viewed date and resolves real range output", () => {
    freshInstall();
    completeSetup();

    const serial = toSerial(998, 1, 12);
    handlePlanesCommand(gmUser(), ["planes", "on", "Olarune", "12", "998"]);

    let msg = String(lastChat().msg);
    assert(msg.includes("Full Calendar Year &#40;998&#41;,year 998"));
    assert(msg.includes("Rolling 12 Months,rolling " + serial));
    assert(msg.includes("Upcoming Month,?\\{Upcoming Month&#124;Therendor 998 YK&#44;month Therendor 998"));
    assert(msg.includes("Zarantyr 999 YK&#44;month Zarantyr 999"));
    assert(!msg.includes("Olarune 998 YK&#44;month Olarune 998"));
    assert(msg.includes("Specific Month,specific ?\\{Month&#124;Therendor 998\\}"));

    handlePlanesCommand(gmUser(), ["planes", "ranges", "year", "998"]);
    msg = String(lastChat().msg);
    assert(msg.includes("Full Calendar Year (998)"));
    assert(!msg.includes("Calendar Jump Syntax"));

    handlePlanesCommand(gmUser(), ["planes", "ranges", "rolling", String(serial)]);
    msg = String(lastChat().msg);
    assert(msg.includes("Rolling 12 Months"));
    assert(!msg.includes("Calendar Jump Syntax"));

    handlePlanesCommand(gmUser(), ["planes", "ranges", "month", "Zarantyr", "999"]);
    msg = String(lastChat().msg);
    assert(msg.includes("Zarantyr 999 YK"));
    assert(!msg.includes("Calendar Jump Syntax"));

    handlePlanesCommand(gmUser(), ["planes", "ranges", "specific", "Therendor", "998"]);
    msg = String(lastChat().msg);
    assert(msg.includes("Therendor 998 YK"));
    assert(!msg.includes("Calendar Jump Syntax"));
  });
});
