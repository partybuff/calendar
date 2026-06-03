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
    assert(msg.includes("Add Single Event"));
    assert(msg.includes("Manage Event Sources"));
    assert(msg.includes("Hide/Show Event"));
    assert(msg.includes("events source"));
    assert(msg.includes("events list"));
    assert(!msg.includes("events removeflow"));
  });

  it("keeps the Events send button aligned to the displayed month", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal events panel " + toSerial(998, 1, 12)));

    const msg = String(lastChat().msg);
    assert(msg.includes("!cal send Olarune 998"));
    assert(!msg.includes("send ?{Calendar range|this month}"));
  });

  it("opens Source Controls and the real list workflow from Events management", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal events manage source"));
    let msg = String(lastChat().msg);
    assert(msg.includes("Manage Event Sources"));
    assert(msg.includes("source"));

    handleInput(gmMessage("!cal events manage list"));
    msg = String(lastChat().msg);
    assert(msg.includes(">Status<"));
    assert(msg.includes("Source"));
    assert(!msg.includes(">Index<"));
    assert(msg.includes("[\u2796 Hide](!cal remove "));
    assert(!msg.includes("events removeflow"));
  });

  it("routes Today additional-options Admin into the GM menu without undefined output", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal today options admin"));

    const log = (globalThis as any)._chatLog;
    const msg = String(lastChat().msg);
    assert(msg.includes("GM Admin"));
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

  it("shows hide/show controls directly in the event list", () => {
    freshInstall();
    completeSetup();

    handleInput(gmMessage("!cal list"));
    let msg = String(lastChat().msg);
    assert(msg.includes(">Status<"));
    assert(msg.includes("Source"));
    assert(!msg.includes(">Index<"));
    assert(msg.includes("[\u2796 Hide](!cal remove "));

    const evt = getCal().events.find((entry: any) => entry.source === "khorvaire");
    assert(evt);
    handleInput(gmMessage("!cal remove key " + encodeURIComponent(eventKey(evt))));
    handleInput(gmMessage("!cal list"));

    msg = String(lastChat().msg);
    assert(msg.includes("Hidden"));
    assert(msg.includes("[\u2795 Show](!cal restore key "));
  });

  it("treats source controls as bulk hide/show for the shared event list", () => {
    freshInstall();
    completeSetup();

    const evt = getCal().events.find((entry: any) => entry.name === "Day of Cleansing Fire" && entry.source === "silver flame");
    assert(evt);
    const key = encodeURIComponent(eventKey(evt));

    handleInput(gmMessage("!cal source disable Silver Flame"));
    handleInput(gmMessage("!cal list"));

    let msg = String(lastChat().msg);
    assert(msg.includes("Day of Cleansing Fire"));
    assert(msg.includes("#F2F7FF"));
    assert(msg.includes("Silver Flame"));
    assert(msg.includes("restore key "));

    handleInput(gmMessage("!cal restore key " + key));
    handleInput(gmMessage("!cal source list"));

    msg = String(lastChat().msg);
    assert(msg.includes("Partially Hidden"));
    assert(msg.includes("[Show All](!cal source enable Silver Flame"));
    assert(msg.includes("[Hide All](!cal source disable Silver Flame"));
  });

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
