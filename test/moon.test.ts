// Tests for the moon read API after the engine swap. The legacy internal
// math (sequence buffer, festival nudges, anti-phase coupling, associated
// plane phase pulls, 60-day history cache, illumination-coverage threshold
// model) was deleted when those concerns moved into
// `@partybuff/calendar-engine`. Moons and planes are canon-only: they always
// use the engine's standard default-seed anchors. GM in-Roll20 anchor
// overrides (once threaded from `state.imported`) were cut, so a token's
// lunar/planar/krynn anchor fields never affect what players see; there is no
// Roll20-side `!cal moon eye` command any more.
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

  it("krynnAnchor from a setup token is IGNORED — moons stay canon-only", () => {
    const probe = toSerial(346, 6, 14);
    const phasesWith = (withAnchor: boolean) => {
      freshInstall();
      applyCalendarSystem("dragonlance", "standard");
      applyToken({
        v: 1,
        world: "dragonlance",
        date: { kind: "month", year: 346, monthIndex: 0, day: 1 },
        ...(withAnchor
          ? { krynnAnchor: { kind: "month" as const, year: 346, monthIndex: 6, day: 14 } }
          : {}),
      });
      return ["Solinari", "Lunitari", "Nuitari"].map((n) => _moonPeakPhaseDay(n, probe)).join(",");
    };
    // The anchor-override pathway was cut: a token's krynnAnchor must not
    // shift the canon Night-of-the-Eye alignment. Phases are identical
    // whether or not the token carries the override.
    assertEquals(phasesWith(true), phasesWith(false),
      "krynnAnchor override must not change canon moon phases");
  });

  it("planarAnchors from a setup token are IGNORED — planes stay canon-only", async () => {
    // The GM plane-position override pathway was cut (CLAUDE.md: planes are
    // canon-only, no overrides). Writing planarAnchors via the token apply
    // path must NOT affect engine `planes.stateOf` queries.
    const { getPlanarState } = await import("../src/planes.js");
    const target = toSerial(998, 6, 14);
    const stateWith = (withAnchor: boolean) => {
      freshInstall();
      applyToken({
        v: 1,
        world: "eberron",
        date: { kind: "month", year: 998, monthIndex: 0, day: 1 },
        ...(withAnchor ? { planarAnchors: { fernia: 28 } } : {}),
      });
      return getPlanarState("Fernia", target);
    };
    const canon = stateWith(false);
    const withAnchor = stateWith(true);
    assert(canon && withAnchor, "expected Fernia state both ways");
    assertEquals(withAnchor.phase, canon.phase, "planarAnchors must not change Fernia's phase");
    assertEquals(withAnchor.daysIntoPhase, canon.daysIntoPhase,
      "planarAnchors must not change Fernia's progress");
  });
});
