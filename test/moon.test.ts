// Tests for the moon read API after the engine swap. The legacy internal
// math (sequence buffer, festival nudges, anti-phase coupling, associated
// plane phase pulls, 60-day history cache, illumination-coverage threshold
// model) was deleted when those concerns moved into
// `@partybuff/calendar-engine`. Moons and planes are canon-only: they always
// use the engine's standard default-seed anchors. GM in-Roll20 anchor
// overrides were cut in #198 (`getMoonOpts()` / `getPlanePositions()`
// always return `{}`), and the token's `lunarAnchors` / `krynnAnchor` /
// `planarAnchors` fields were removed entirely as a follow-up — a token
// no longer has anywhere to put an override. There is no Roll20-side
// `!cal moon eye` command any more.
import { describe, it } from "node:test";
import { strictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { holidays as engineHolidays } from "@partybuff/calendar-engine";
import { freshInstall } from "./helpers.js";
import { toSerial, todaySerial } from "../src/date-math.js";
import { applyCalendarSystem } from "../src/state.js";
import { applyToken } from "../src/token.js";
import {
  MOON_SYSTEMS,
  moonPhaseAt, _moonPeakPhaseDay,
  _getMoonSys,
} from "../src/moon.js";

describe("Moon read API (engine-backed)", () => {
  it("Eberron has 12 moons with required properties", () => {
    freshInstall();
    const moons = _getMoonSys().moons;
    assertEquals(moons.length, 12);
    for (const m of moons) {
      assert(m.name, "name");
      assert((m.synodicPeriod || m.baseCycleDays) > 0, `${m.name} synodic period`);
      assert(m.color, `${m.name} color`);
    }
  });

  it("moonPhaseAt returns the engine's MoonPhase shape on Eberron canon", () => {
    freshInstall();
    const today = todaySerial();
    for (const m of MOON_SYSTEMS.eberron.moons) {
      const phase = moonPhaseAt(m.name, today);
      assert(phase, `${m.name} phase`);
      assert(typeof phase.illum === 'number', `${m.name} illum`);
      assert(typeof phase.waxing === 'boolean', `${m.name} waxing`);
      assert(typeof phase.label === 'string', `${m.name} label`);
    }
  });

  it("Dragonlance Night of the Eye triple-full canon holds without overrides", () => {
    freshInstall();
    applyCalendarSystem("dragonlance", "standard");

    // The true Night of the Eye is a triple-full conjunction — Solinari,
    // Lunitari, and Nuitari standing full together — which recurs on the
    // beat period of their orbits (~every 3 years). Derive the canonical
    // date(s) from the engine holiday (never hardcode: the anchor is the
    // engine's to move) and assert the conjunction physically lands on one.
    // Scanning a multi-year window keeps this stable across engine models
    // that mark Night of the Eye every year vs. only on the cadence year;
    // either way the wrapper must surface a real triple-full.
    const isTripleFull = (serial: number) =>
      ["Solinari", "Lunitari", "Nuitari"].every(
        (mn) => _moonPeakPhaseDay(mn, serial) === "full",
      );
    let found = null;
    for (let y = 346; y < 362 && !found; y++) {
      // Dragonlance has no intercalaries, so wrapper structural month index
      // equals the engine monthIndex.
      for (const d of engineHolidays.allOccurrencesIn("dragonlance", y, "night_of_the_eye")) {
        if (d.kind !== "month") continue; // NotE is always a month-kind date
        const serial = toSerial(d.year, d.monthIndex, d.day);
        if (isTripleFull(serial)) { found = d; break; }
      }
    }
    assert(
      found,
      "engine must ship a Night of the Eye whose date is a genuine triple-full conjunction",
    );
  });

  it("Dragonlance moons stay canon-only after applyToken — no krynnAnchor field exists any more", () => {
    // The Token type no longer declares krynnAnchor at all (removed as a
    // #198 follow-up), so there is nothing left to "ignore" — assert the
    // canon phases directly, and confirm going through applyToken's
    // world/date-switch path doesn't itself perturb them.
    const probe = toSerial(346, 6, 14);
    freshInstall();
    applyCalendarSystem("dragonlance", "standard");
    const canonPhases = ["Solinari", "Lunitari", "Nuitari"]
      .map((n) => _moonPeakPhaseDay(n, probe)).join(",");

    freshInstall();
    applyToken({
      v: 1,
      world: "dragonlance",
      date: { kind: "month", year: 346, monthIndex: 0, day: 1 },
    });
    const afterTokenPhases = ["Solinari", "Lunitari", "Nuitari"]
      .map((n) => _moonPeakPhaseDay(n, probe)).join(",");

    assertEquals(afterTokenPhases, canonPhases,
      "applying a token must not change canon moon phases");
  });

  it("Eberron planes stay canon-only after applyToken — no planarAnchors field exists any more", async () => {
    // Same structural guarantee for planes: planarAnchors is gone from the
    // Token type, so assert Fernia's canon phase directly (see also
    // planes.test.ts's dedicated canon-anchor coverage for this date) and
    // confirm applyToken's date-switch path doesn't perturb it.
    const { getPlanarState } = await import("../src/planes.js");
    const target = toSerial(998, 6, 14);

    freshInstall();
    const canon = getPlanarState("Fernia", target);

    freshInstall();
    applyToken({
      v: 1,
      world: "eberron",
      date: { kind: "month", year: 998, monthIndex: 0, day: 1 },
    });
    const afterToken = getPlanarState("Fernia", target);

    assert(canon && afterToken, "expected Fernia state both ways");
    assertEquals(canon.phase, "coterminous", "Fernia is canon-coterminous during Lharvion 998");
    assertEquals(afterToken.phase, canon.phase, "applying a token must not change Fernia's phase");
    assertEquals(afterToken.daysIntoPhase, canon.daysIntoPhase,
      "applying a token must not change Fernia's progress");
  });
});
