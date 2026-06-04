import { describe, it } from "node:test";
import { ok as assert, strictEqual as assertEquals } from "node:assert/strict";
import { completeSetup, freshInstall } from "./helpers.js";
import { _showDefaultCalView } from "../src/commands.js";
import { handleInput } from "../src/boot-register.js";
import { setDate, stepDays } from "../src/ui.js";
import { sendToAll, sendUiToGM } from "../src/messaging.js";
import { helpRootMenu } from "../src/ui.js";
import { fromSerial, toSerial } from "../src/date-math.js";
import { MOON_SYSTEMS, _moonNextThresholdEntry, _moonPeakPhaseDay, moonEnsureSequences } from "../src/moon.js";
import { _getAllPlaneData, getPlanarState } from "../src/planes.js";

function setSerial(serial: number) {
  const d = fromSerial(serial);
  setDate(d.mi + 1, d.day, d.year);
}

describe("Task-focused UI", () => {
  it("routes both transient helpers and broadcasts through noarchive", () => {
    freshInstall();
    sendUiToGM("<div>GM menu</div>");
    sendToAll("<div>Story-facing content</div>");
    const log = (globalThis as any)._chatLog;
    assertEquals(log[0].opts.noarchive, true);
    assertEquals(log[1].opts.noarchive, true);
  });

  it("renders the root help menu through the transient noarchive path with updated date wording", () => {
    freshInstall();
    helpRootMenu({ who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assertEquals(msg.opts.noarchive, true);
    assert(msg.msg.includes("Set Date"));
    assert(msg.msg.includes("?{Set Date &#40;mm dd yyyy&#41;|"));
    assert(msg.msg.includes("Prompt !cal add"));
    assert(msg.msg.includes("Prompt !cal addmonthly"));
    assert(msg.msg.includes("Prompt !cal addyearly"));
    assert(msg.msg.includes("Prompt !cal moon on"));
    assert(msg.msg.includes("Prompt !cal planes on"));
    assert(!msg.msg.includes("Prompt !cal set"));
    assert(!msg.msg.includes("Prompt !cal send"));
  });

  it("!cal additional renders the §5.4 subsystem hub whispered to caller", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal additional", who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    // Hub is a single whispered card with subsystem launchers + Back.
    // Per PR 2d-a it carries one button per subsystem (Events / Moons /
    // Planes); 2d-b/c splits each into Current / All variants.
    assert(/Additional/.test(msg.msg), "title bar should say Additional");
    // PR 2d-b split Events; PR 2d-c split Lunar and Planar.
    assert(/events current/.test(msg.msg), "should launch Events Current");
    assert(/events all/.test(msg.msg), "should launch Events All");
    assert(/lunar current/.test(msg.msg), "should launch Lunar Current");
    assert(/lunar all/.test(msg.msg), "should launch Lunar All");
    assert(/planar current/.test(msg.msg), "should launch Planar Current (Eberron)");
    assert(/planar all/.test(msg.msg), "should launch Planar All (Eberron)");
    assert(/Back/.test(msg.msg), "should have a Back button");
  });

  it("!cal events current emits Past | Today | Upcoming sections with Back to additional", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal events current", who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assert(/Events . Current/.test(msg.msg) || />Events . Current</.test(msg.msg) || /Events &mdash; Current/.test(msg.msg) || /Events.*Current/.test(msg.msg), "title should be Events — Current");
    assert(/>Past</.test(msg.msg), "should have Past section");
    assert(/>Today</.test(msg.msg), "should have Today section");
    assert(/>Upcoming</.test(msg.msg), "should have Upcoming section");
    assert(/!cal additional/.test(msg.msg), "Back button should route to additional");
  });

  it("!cal events all defaults to the current year and surfaces year nav", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal events all", who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assert(/Events . 998|Events &mdash; 998|Events.*998/.test(msg.msg), "title should include the default year 998 YK");
    assert(/events all 997/.test(msg.msg), "should have previous-year button");
    assert(/events all 999/.test(msg.msg), "should have next-year button");
    assert(/!cal additional/.test(msg.msg), "Back button should route to additional");
  });

  it("!cal lunar current renders one row per Eberron moon with last/next inflections", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal lunar current", who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assert(/Lunar.*Current/.test(msg.msg), "title should mention Lunar — Current");
    assert(/<b>Olarune<\/b>/.test(msg.msg), "should include Olarune");
    assert(/<b>Vult<\/b>/.test(msg.msg), "should include Vult");
    assert(/Last:/.test(msg.msg), "should label Last event");
    assert(/Next:/.test(msg.msg), "should label Next event");
    assert(/!cal additional/.test(msg.msg), "Back button should route to additional");
  });

  it("!cal lunar all surfaces per-month chronological full/new entries", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal lunar all", who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assert(/Lunar.*998/.test(msg.msg), "title should include the default year 998 YK");
    assert(/(Full|New)/.test(msg.msg), "should include Full/New entries");
    assert(/lunar all 997/.test(msg.msg), "should have previous-year nav");
    assert(/lunar all 999/.test(msg.msg), "should have next-year nav");
    assert(/!cal additional/.test(msg.msg), "Back button should route to additional");
  });

  it("!cal planar current shows Past | Today | Upcoming sections on Eberron", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal planar current", who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assert(/Planar.*Current/.test(msg.msg), "title should mention Planar — Current");
    assert(/>Past</.test(msg.msg), "should have Past section");
    assert(/>Today</.test(msg.msg), "should have Today section");
    assert(/>Upcoming</.test(msg.msg), "should have Upcoming section");
    assert(/!cal additional/.test(msg.msg), "Back button should route to additional");
  });

  it("!cal planar all defaults to current year and surfaces year nav", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal planar all", who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assert(/Planar.*998/.test(msg.msg), "title should include the default year 998 YK");
    assert(/planar all 997/.test(msg.msg), "should have previous-year nav");
    assert(/planar all 999/.test(msg.msg), "should have next-year nav");
    assert(/!cal additional/.test(msg.msg), "Back button should route to additional");
  });

  it("uses the current-month minical as the default root view", () => {
    freshInstall();
    _showDefaultCalView({ who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assert(msg.msg.includes("Today&#39;s Calendar"));
    // §5.2 button rows: GM row [Retreat | Advance | Send] above
    // public row [Additional | Help]. The legacy "Subsystems"
    // dropdown was replaced by the explicit Additional button in
    // PR 2d-a; "Help" is the typed-only reference card.
    assert(msg.msg.includes("Additional"), "should have Additional hub button");
    assert(msg.msg.includes("Help"), "should have Help button");
    assert(msg.msg.includes("retreat 1"), "should have GM retreat button");
    assert(msg.msg.includes("advance 1"), "should have GM advance button");
    assert(msg.msg.includes("!cal send") || /Send[^A-Za-z]/.test(msg.msg), "should have GM send button");
  });

  it("redraws the dashboard minical after day advance", () => {
    freshInstall();
    stepDays(1);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assert(msg.msg.includes("<table"), "should redraw the month minical");
    assert(msg.msg.includes("advance 1") || msg.msg.includes("➡"), "should keep advance controls");
    assert(!msg.msg.includes("Stepped Forward"), "should send the refreshed Today view instead of the old step notice");
  });

  it("shows the inflection-day moon highlight in the dashboard without a span suffix", () => {
    freshInstall();

    // Engine model is inflection-only: each full / new lands on exactly
    // one serial per cycle, so there is no "Day X of Y" span to render.
    // Scan the first canonical year for any moon's full day and verify
    // the dashboard string mentions the moon + "Full" / "New" — but
    // NOT a span suffix.
    const start = toSerial(998, 0, 1);
    const end = start + 336;

    let found: any = null;
    for (let serial = start; serial <= end && !found; serial++) {
      for (const moon of MOON_SYSTEMS.eberron.moons as any[]) {
        const verdict = _moonPeakPhaseDay(moon.name, serial);
        if (verdict) { found = { serial, moon: moon.name, type: verdict }; break; }
      }
    }

    assert(found, "expected a full or new inflection day in the first year");
    setSerial(found.serial);
    _showDefaultCalView({ who: "GM (GM)", playerid: "GM" } as any);
    const msg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    const phaseWord = found.type === "full" ? "Full" : "New";
    // Inflection-only model: the moon line is "Foo is Full" without a
    // span suffix. Planes still use "(Day X of Y)" elsewhere in the
    // panel — we only check the moon line specifically.
    const moonLineMatch = msg.match(new RegExp(`${found.moon}</b>[^<]*is ${phaseWord}([^<]*)`));
    assert(moonLineMatch, `expected "${found.moon} is ${phaseWord}" line in dashboard`);
    assert(!moonLineMatch[1].includes("Day "), `moon line should have no "Day X of Y" suffix, got: ${moonLineMatch[1]}`);
  });

  it("surfaces long-span moon previews and plane day spans in the GM dashboard", () => {
    freshInstall();
    moonEnsureSequences(todayLikeStart(), 400);

    let moonPreview: any = null;
    const moonStart = toSerial(998, 0, 1);
    for (let serial = moonStart; serial <= moonStart + 336 && !moonPreview; serial++) {
      const next = _moonNextThresholdEntry("Vult", serial, 2);
      if (next && next.type === "full") moonPreview = { serial, days: next.days };
    }
    assert(moonPreview, "expected a Vult preview within the first year");

    setSerial(moonPreview.serial);
    _showDefaultCalView({ who: "GM (GM)", playerid: "GM" } as any);
    let msg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    assert(msg.includes("Vult</b> Full " + (moonPreview.days === 1 ? "tomorrow" : "in 2 days")));

    const planeStart = toSerial(998, 0, 1);
    let planeMatch: any = null;
    for (let serial = planeStart; serial <= planeStart + 336 && !planeMatch; serial++) {
      for (const plane of _getAllPlaneData()) {
        if (plane.type === "fixed") continue;
        const ps = getPlanarState(plane.name, serial);
        if (ps && (ps.phase === "coterminous" || ps.phase === "remote") && ps.phaseDuration != null && ps.phaseDuration > 1 && ps.phaseDuration <= 336) {
          planeMatch = { serial, plane: plane.name, phase: ps.phase === "coterminous" ? "Coterminous" : "Remote" };
          break;
        }
      }
    }
    assert(planeMatch, "expected an active multi-day planar phase");

    setSerial(planeMatch.serial);
    _showDefaultCalView({ who: "GM (GM)", playerid: "GM" } as any);
    msg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    assert(msg.includes(`${planeMatch.plane}</b> is ${planeMatch.phase} <span`) || msg.includes(`${planeMatch.plane}</b> is ${planeMatch.phase} (`));
    assert(msg.includes("Day "));

    let planePreview: any = null;
    for (let serial = planeStart; serial <= planeStart + 336 && !planePreview; serial++) {
      for (const plane of _getAllPlaneData()) {
        if (plane.type === "fixed") continue;
        const ps = getPlanarState(plane.name, serial);
        if (ps && ps.phase === "neutral" && ps.nextPhase && (ps.nextPhase === "coterminous" || ps.nextPhase === "remote") && ps.daysUntilNextPhase != null && ps.daysUntilNextPhase > 0 && ps.daysUntilNextPhase <= 2) {
          planePreview = {
            serial,
            plane: plane.name,
            phase: ps.nextPhase === "coterminous" ? "Coterminous" : "Remote",
            days: ps.daysUntilNextPhase
          };
          break;
        }
      }
    }
    assert(planePreview, "expected an upcoming planar transition within 2 days");

    setSerial(planePreview.serial);
    _showDefaultCalView({ who: "GM (GM)", playerid: "GM" } as any);
    msg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    assert(msg.includes(`${planePreview.plane}</b> ${planePreview.phase} ${planePreview.days === 1 ? "tomorrow" : "in 2 days"}`));
  });

  it("uses the formal dashboard header and avoids bogus neutral-span day counts", () => {
    freshInstall();

    setDate(9, 18, 998);
    _showDefaultCalView({ who: "GM (GM)", playerid: "GM" } as any);
    const msg = String((globalThis as any)._chatLog.slice(-1)[0].msg);

    assert(msg.includes("Wir, 18th of Rhaan, 998 YK"));
    assert(msg.includes("Early autumn"));
    assert(/font-style:italic[^"]*">Early autumn<\/div>/.test(msg));
    assert(!msg.includes("— Early autumn"));
    // When there are no events, don't print an empty "no events" placeholder —
    // the absence is obvious from the rest of the display.
    assert(!msg.includes("📅 No calendar events today."));
    assert(!msg.includes("Day 72 of 161"));
  });
});

function todayLikeStart() {
  return toSerial(998, 0, 1);
}
