// Tests for the moon read API after the engine swap. The legacy internal
// math (sequence buffer, festival nudges, anti-phase coupling, associated
// plane phase pulls, 60-day history cache, illumination-coverage threshold
// model) was deleted when those concerns moved into
// `@partybuff/calendar-engine`. The Dragonlance Night-of-the-Eye anchor
// is now sourced from `state.imported.krynnAnchor`, written by the token
// consumer in `src/token.ts`; there is no Roll20-side `!cal moon eye`
// command any more.
import { describe, it } from "node:test";
import { strictEqual as assertEquals, ok as assert } from "node:assert/strict";
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

    // Canon Night of the Eye for 346 PC. Engine ships this anchor; no
    // wrapper-side override or `state.imported.krynnAnchor` is required
    // for the canon date to register as a triple-full conjunction.
    const anchorSerial = toSerial(346, 6, 7);
    for (const moonName of ["Solinari", "Lunitari", "Nuitari"]) {
      const v = _moonPeakPhaseDay(moonName, anchorSerial);
      assertEquals(v, "full", `${moonName} should be full on default Night of the Eye`);
    }
  });

  it("krynnAnchor from a setup token relocates Night of the Eye", () => {
    freshInstall();
    applyCalendarSystem("dragonlance", "standard");
    const overrideSerial = toSerial(346, 6, 14);

    applyToken({
      v: 1,
      world: "dragonlance",
      date: { kind: "month", year: 346, monthIndex: 0, day: 1 },
      krynnAnchor: { kind: "month", year: 346, monthIndex: 6, day: 14 },
    });

    for (const moonName of ["Solinari", "Lunitari", "Nuitari"]) {
      const v = _moonPeakPhaseDay(moonName, overrideSerial);
      assertEquals(v, "full", `${moonName} should be full on the overridden Night of the Eye`);
    }
  });

  it("planar opts pass through: planarAnchors slide the canon Fernia cycle", async () => {
    // Bridge test: writing planarAnchors into state.imported (via the
    // token apply path) must affect engine `planes.stateOf` queries via
    // the wrapper's `getPlanarState`. The legacy wrapper had its own
    // cycle math; this test pins the engine pass-through behavior.
    freshInstall();
    const { getPlanarState } = await import("../src/planes.js");
    const targetSerial = toSerial(998, 6, 14);
    const baseline = getPlanarState("Fernia", targetSerial);
    assert(baseline, "expected a baseline Fernia state");

    applyToken({
      v: 1,
      world: "eberron",
      date: { kind: "month", year: 998, monthIndex: 0, day: 1 },
      planarAnchors: { fernia: 28 },
    });

    const shifted = getPlanarState("Fernia", targetSerial);
    assert(shifted, "expected a shifted Fernia state");
    // The 28-day position offset shifts the cycle relative to the same
    // serial; daysIntoPhase has to differ (either phase changed entirely
    // or its progress within the phase changed).
    const differs =
      baseline.phase !== shifted.phase ||
      baseline.daysIntoPhase !== shifted.daysIntoPhase;
    assert(differs, "planarAnchors should change Fernia's state on the target serial");
  });
});
