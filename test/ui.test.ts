import { describe, it } from "node:test";
import { ok as assert, strictEqual as assertEquals } from "node:assert/strict";
import { completeSetup, freshInstall } from "./helpers.js";
import { _showDefaultCalView } from "../src/commands.js";
import { handleInput } from "../src/boot-register.js";
import { setDate, stepDays } from "../src/ui.js";
import { sendToAll, sendUiToGM } from "../src/messaging.js";
import { helpEventColorsMenu, helpRootMenu } from "../src/ui.js";
import { fromSerial, toSerial } from "../src/date-math.js";
import { MOON_SYSTEMS, _moonNextThresholdEntry, _moonPeakPhaseDay, _moonPhaseEmoji, moonEnsureSequences, moonPhaseAt } from "../src/moon.js";
import { _getAllPlaneData, getPlanarState } from "../src/planes.js";

function setSerial(serial: number) {
  const d = fromSerial(serial);
  setDate(d.mi + 1, d.day, d.year);
}

describe("Task-focused UI", () => {
  it("routes transient GM UI through noarchive but archives public broadcasts", () => {
    // sendUi* paths are transient interactive panels (buttons re-render the
    // panel) — they should never clutter Roll20's chat archive. Public
    // broadcasts (!cal send, reset announcement) ARE the campaign's in-game
    // timestamp anchor and must persist in chat history.
    freshInstall();
    sendUiToGM("<div>GM menu</div>");
    sendToAll("<div>Story-facing content</div>");
    const log = (globalThis as any)._chatLog;
    assertEquals(log[0].opts.noarchive, true);
    assert(log[1].opts.noarchive !== true,
      "sendToAll must archive so the broadcast persists in Roll20 chat history");
  });

  it("renders the root help menu as a docs-only reference (setup lives in Manage)", () => {
    freshInstall();
    helpRootMenu({ who: "GM (GM)", playerid: "GM" } as any);
    const msg = (globalThis as any)._chatLog.slice(-1)[0];
    assertEquals(msg.opts.noarchive, true);
    // Documentation pages
    assert(msg.msg.includes("Reading the Calendar"), "reading-the-calendar doc");
    assert(msg.msg.includes("!cal help calendar"));
    assert(msg.msg.includes("!cal help themes"));
    assert(msg.msg.includes("!cal help eventcolors"));
    // GM config launchers moved to Manage — not duplicated in Help.
    assert(!msg.msg.includes("!cal set ?{"), "Set Date prompt moved to Manage");
    assert(!msg.msg.includes("!cal source list"), "Sources moved to Manage");
    assert(!msg.msg.includes("Prompt !cal moon on"), "moon-on prompt gone");
    assert(!msg.msg.includes("Prompt !cal planes on"), "planes-on prompt gone");
    // Retired custom-event prompts stay gone.
    assert(!msg.msg.includes("Prompt !cal add"));
  });

  it("Event Colors help page explains colors without teaching the retired add command", () => {
    freshInstall();
    helpEventColorsMenu({ who: "GM (GM)", playerid: "GM" } as any);
    const msg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    assert(msg.includes("Event Colors"), "title");
    assert(!msg.includes("!cal add"), "no retired add-event example");
    assert(!/March 14 Feast/.test(msg), "no dead command example");
    // The named-color reference table itself is still expected (e.g.
    // "emerald" is a legitimate swatch entry) — only the retired-command
    // example that used to reference it is gone.
    assert(msg.includes("emerald"), "named-color table still lists its entries");
    // Still explains what colors mean / where they come from.
    assert(/color/i.test(msg), "still describes event colors");
  });

  it("Reading the Calendar help page explains the grid instead of the Name Variants picker", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal help calendar", who: "GM (GM)", playerid: "GM" } as any);
    const msg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    assert(msg.includes("Reading the Calendar"), "title");
    assert(/today/i.test(msg) && /highlight/i.test(msg), "explains the today highlight");
    assert(/dot/i.test(msg), "explains event dots for secondary events");
    assert(/!cal send/.test(msg), "explains the whisper-first model and !cal send");
    // Name Variants no longer lives behind this page — it moved to Manage.
    assert(!msg.includes("Name Variants"), "Name Variants picker is not this page anymore");
  });

  it("Name Variants stays reachable from the Manage hub (not from Help)", () => {
    freshInstall();
    completeSetup();
    handleInput({ type: "api", content: "!cal manage", who: "GM (GM)", playerid: "GM" } as any);
    const manageMsg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    assert(manageMsg.includes("Calendar / Variant"), "Manage hub carries the Calendar/Variant button");
    handleInput({ type: "api", content: "!cal calendar list", who: "GM (GM)", playerid: "GM" } as any);
    const variantMsg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    assert(variantMsg.includes("Name Variants"), "Calendar/Variant button still renders the Name Variants list");
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

  it("dashboard chip and Lunar Current panel agree on label + emoji for the same moon/day (single source of truth: the engine phase)", () => {
    freshInstall();
    completeSetup();

    // Find an Eberron moon's engine Full inflection day within the first
    // canonical year — `_moonPeakPhaseDay` reads the engine's isFull
    // verdict directly, so this is genuinely the crossing day.
    const start = toSerial(998, 0, 1);
    let found: { serial: number; moon: string } | null = null;
    outer: for (let s = start; s < start + 400; s++) {
      for (const moon of MOON_SYSTEMS.eberron.moons as any[]) {
        if (_moonPeakPhaseDay(moon.name, s) === "full") {
          found = { serial: s, moon: moon.name };
          break outer;
        }
      }
    }
    assert(found, "expected a Full inflection day within the first year");
    const { serial, moon } = found!;

    // The engine phase is the thing both UI paths must agree with.
    const ph = moonPhaseAt(moon, serial);
    assertEquals(ph.label, "Full", "engine phase must read Full on its own inflection day");
    const expectedEmoji = _moonPhaseEmoji(ph.label);

    setSerial(serial);

    // Dashboard path (today.ts notable-moon chip, driven by ui.ts).
    _showDefaultCalView({ who: "GM (GM)", playerid: "GM" } as any);
    const dashboardMsg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    const dashboardMatch = dashboardMsg.match(
      new RegExp(`>(\\p{Extended_Pictographic})\\s*<b>${moon}</b>[^<]*is Full`, "u"),
    );
    assert(dashboardMatch, `expected dashboard chip line for ${moon} in:\n${dashboardMsg}`);
    assertEquals(dashboardMatch![1], expectedEmoji, "dashboard chip emoji must equal the engine-mapped emoji");

    // Lunar Current panel path (separate code path, today.ts _lunarCurrentHtml).
    handleInput({ type: "api", content: "!cal lunar current", who: "GM (GM)", playerid: "GM" } as any);
    const lunarMsg = String((globalThis as any)._chatLog.slice(-1)[0].msg);
    const lunarMatch = lunarMsg.match(
      new RegExp(`>(\\p{Extended_Pictographic})\\s*<b>${moon}</b> &mdash; ([^<]+?)(?: <span|</div>)`, "u"),
    );
    assert(lunarMatch, `expected Lunar Current row for ${moon} in:\n${lunarMsg}`);
    assertEquals(lunarMatch![1], expectedEmoji, "Lunar Current emoji must equal the engine-mapped emoji");
    assertEquals(lunarMatch![2], "Full", "Lunar Current label must read Full on the engine crossing day");

    // The two paths must not just individually be right — they must match
    // each other, since that agreement is the point of the unification.
    assertEquals(dashboardMatch![1], lunarMatch![1], "dashboard and Lunar Current emoji must match");
  });

  it("Full/New land exactly on the engine crossing day, not a day early (0.98/0.02 threshold retired)", () => {
    freshInstall();
    completeSetup();

    // Slow-cycle moons spend several days above 98% illumination around
    // their crossing, which is exactly what made the old threshold-based
    // label wrong. Vult (~102d cycle) has the widest band of any Eberron
    // moon, so it's the sharpest demonstration.
    const moonName = "Vult";
    const start = toSerial(998, 0, 1);
    let peakSerial: number | null = null;
    for (let s = start; s < start + 400; s++) {
      if (_moonPeakPhaseDay(moonName, s) === "full") { peakSerial = s; break; }
    }
    assert(peakSerial != null, "expected a Vult Full inflection day within the first year");

    const OLD_FULL_THRESHOLD = 0.98; // retired wrapper threshold, reproduced here only to characterize the fix
    const peakPh = moonPhaseAt(moonName, peakSerial!);
    assertEquals(peakPh.label, "Full");
    assertEquals(peakPh.isFull, true);

    // At least one neighboring day must be a case the OLD threshold would
    // have mislabeled Full (illum >= 0.98) but the engine does not: the
    // whole point of this migration.
    const before = moonPhaseAt(moonName, peakSerial! - 1);
    const after = moonPhaseAt(moonName, peakSerial! + 1);
    const oldWouldHaveSaidFull = (ph: any) => ph.illum >= OLD_FULL_THRESHOLD;
    assert(
      oldWouldHaveSaidFull(before) || oldWouldHaveSaidFull(after),
      `expected at least one neighbor of the Vult Full day to sit above the old 0.98 threshold ` +
      `(before.illum=${before.illum}, after.illum=${after.illum})`,
    );
    // Regardless of illumination, the engine (and thus the wrapper, which
    // no longer re-derives Full from illum) must NOT call either neighbor
    // Full — the crossing is exactly one day.
    assert(before.label !== "Full" && before.isFull === false, `day before must not read Full, got "${before.label}"`);
    assert(after.label !== "Full" && after.isFull === false, `day after must not read Full, got "${after.label}"`);
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
