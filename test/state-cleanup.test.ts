// Regression coverage for the write-only-state / obsolete-key cleanup:
//   - the moon `recentHistory` chat-history cache (write-only — no render
//     path ever read `bySerial`) and the other vestigial pre-engine
//     `root.moons` fields (sequences/systemSeed/systemAnchors/gmAnchors/
//     generatedFrom/generatedThru/modelRevision);
//   - the dead `root.planes` blob (its sole accessor, `getPlanesState`,
//     had zero callers);
//   - `state.imported` (`!cal token` lunar/krynn/planar anchor
//     persistence) — moons and planes are canon-only, so these anchors
//     were validated and stored but never read;
//   - `setup.draft` (the multi-step wizard it backed was retired);
//   - `settings.structureSet` (re-written on every applyCalendarSystem()
//     call but never read — applyStructureSet takes the set name as a
//     direct parameter).
//
// checkInstall() must sweep all of the above from old-style saved state,
// the sweep must be idempotent, and normal play must no longer grow
// state.PartyBuffCalendar with a moon-history cache on every date change.
import { describe, it } from "node:test";
import { ok as assert, strictEqual as assertEquals } from "node:assert/strict";
import { freshInstall, completeSetup } from "./helpers.js";
import { handleInput } from "../src/boot-register.js";
import { state_name } from "../src/constants.js";
import { checkInstall } from "../src/state.js";

function gmMessage(content: string) {
  return { type: "api", content, who: "GM (GM)", playerid: "GM" } as any;
}

describe("Obsolete-key sweep — checkInstall cleans old-style persisted state", () => {
  it("strips root.moons / root.planes / state.imported / setup.draft / settings.structureSet from a seeded pre-engine blob", () => {
    freshInstall();
    const state = (globalThis as any).state;

    // Seed an OLD-style blob: a plausible snapshot of what a long-lived
    // campaign carried before the engine swap + #198 canon-only cut +
    // this cleanup — populated calendar/settings plus every retired slot.
    state[state_name] = {
      setup: { status: "complete", draft: { step: 3, answers: { world: "eberron" } } },
      settings: {
        calendarSystem: "eberron",
        calendarVariant: "standard",
        seasonVariant: "eberron",
        structureSet: "eberron-standard",
      },
      calendar: {
        current: { month: 0, day_of_the_month: 1, day_of_the_week: 0, year: 998 },
        months: [{ name: "Zarantyr", days: 28, regularIndex: 0 }],
        weekdays: ["Sul", "Mol", "Zol", "Wir", "Zor", "Far", "Sar"],
        events: [],
      },
      moons: {
        sequences: { olarune: [1, 2, 3] },
        systemSeed: 42,
        systemAnchors: { olarune: 100 },
        gmAnchors: { olarune: 50 },
        generatedFrom: 0,
        generatedThru: 1000,
        modelRevision: 3,
        recentHistory: {
          bySerial: { "100": { serial: 100, modelRevision: 3, miniCalEvents: [] } },
          minSerial: 100,
          maxSerial: 100,
        },
      },
      planes: {
        overrides: { fernia: "coterminous" },
        anchors: { fernia: 998 },
        suppressedEvents: { x: true },
        gmCustomEvents: { y: true },
      },
      imported: {
        lunarAnchors: { olarune: { year: 998, monthIndex: 0, day: 1, phase: "full" } },
        krynnAnchor: { kind: "month", year: 350, monthIndex: 6, day: 14 },
        planarAnchors: { fernia: 5 },
        appliedAt: 12345,
        schemaVersion: 1,
      },
    };

    checkInstall();

    const root = state[state_name];
    assertEquals(root.moons, undefined, "root.moons swept");
    assertEquals(root.planes, undefined, "root.planes swept");
    assertEquals(root.imported, undefined, "root.imported swept");
    assertEquals(root.setup.draft, undefined, "setup.draft swept");
    assertEquals(
      Object.prototype.hasOwnProperty.call(root.settings, "structureSet"),
      false,
      "settings.structureSet swept",
    );
    // The campaign itself must still be usable — checkInstall repaired the
    // truncated seeded calendar back to a full Eberron month set.
    assert(root.calendar.months.length > 1, "calendar was rebuilt, not left truncated");
  });

  it("the sweep is idempotent — a second checkInstall on already-clean state is a no-op", () => {
    freshInstall();
    completeSetup();
    checkInstall();
    const state = (globalThis as any).state;
    const before = JSON.stringify(state[state_name]);
    checkInstall();
    const after = JSON.stringify(state[state_name]);
    assertEquals(after, before, "checkInstall must not perturb an already-clean campaign");
  });
});

describe("Normal play no longer grows persisted state with moon history", () => {
  it("advance/set/show/lunar keep working, and state.PartyBuffCalendar does not grow the way the old recentHistory cache did", () => {
    freshInstall();
    completeSetup();
    const state = (globalThis as any).state;
    const sizeBefore = JSON.stringify(state[state_name]).length;

    // A handful of advances is enough that the old write-only 60-day
    // history cache would have visibly grown state on every call.
    for (let i = 0; i < 5; i++) {
      handleInput(gmMessage("!cal advance 7"));
    }
    handleInput(gmMessage("!cal set Sypheros 10 999"));
    handleInput(gmMessage("!cal show"));
    handleInput(gmMessage("!cal lunar"));

    const sizeAfter = JSON.stringify(state[state_name]).length;
    assert(!(state[state_name] as any).moons, "no root.moons slot resurrected by normal play");
    assert(!(state[state_name] as any).planes, "no root.planes slot resurrected by normal play");
    assert(!(state[state_name] as any).imported, "no state.imported slot resurrected by normal play");
    assert(
      sizeAfter <= sizeBefore + 200,
      `state size must not grow materially from date advances (before=${sizeBefore}, after=${sizeAfter})`,
    );
  });
});
