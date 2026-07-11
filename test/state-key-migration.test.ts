// Regression coverage for the state.CALENDAR -> state.PartyBuffCalendar
// persistence-key rename.
//
// The old key was a maximally generic Roll20 state slot (`state.CALENDAR`)
// that any other installed API script could also claim, colliding with or
// corrupting this script's saved data. The rename namespaces it to
// `state.PartyBuffCalendar`. Because `state.CALENDAR` held every live GM's
// campaign, the rename ships with a one-time migration at the top of
// checkInstall() (src/state.ts) that moves the whole blob to the new key —
// this file is the safety net proving that migration doesn't drop or
// clobber data.
import { describe, it } from "node:test";
import { ok as assert, strictEqual as assertEquals } from "node:assert/strict";
import "./roll20-shim.js";
import { state_name } from "../src/constants.js";
import { checkInstall, getCal, getSetupState, ensureSettings } from "../src/state.js";
import { handleInput } from "../src/boot-register.js";

function stateRoot() {
  return (globalThis as any).state;
}

/** A realistic complete campaign blob, shaped like `_setupRoot()` output
 *  for a long-lived faerunian (Harptos) game — settings, a fully-populated
 *  calendar with a non-default date, and a couple of GM-visible events.
 *  Distinct from the fresh-install defaults (eberron, year 998) on every
 *  axis so a clobbered migration is easy to detect. */
function seedLegacyCampaignBlob() {
  return {
    setup: { status: "complete" },
    settings: {
      calendarSystem: "faerunian",
      calendarVariant: "standard",
      seasonVariant: "faerun",
      hemisphere: "north",
      colorTheme: null,
    },
    calendar: {
      current: { month: 0, day_of_the_month: 15, day_of_the_week: 3, year: 1500 },
      weekdays: ["Firstday", "Secondday", "Thirdday", "Fourthday", "Fifthday", "Sixthday", "Seventhday", "Eighthday", "Ninthday", "Tenthday"],
      months: Array.from({ length: 12 }, (_, i) => ({ days: 30, regularIndex: i })),
      events: [
        { name: "Founding of the Lodge", month: 3, day: 10, year: null, color: "#1E88E5", source: null },
        { name: "Harvest Feast", month: 8, day: 1, year: null, color: "#43A047", source: null },
      ],
    },
  };
}

describe("state key migration — state.CALENDAR -> state.PartyBuffCalendar", () => {
  it("moves a realistic complete campaign wholesale to the new key, without clobbering it", () => {
    (globalThis as any)._resetShim();
    const state = stateRoot();
    const seeded = seedLegacyCampaignBlob();

    // Seed the OLD key directly (bypassing state_name, which now points at
    // the new key) to simulate a pre-upgrade campaign.
    state.CALENDAR = seeded;
    assertEquals(state.PartyBuffCalendar, undefined, "precondition: new key must be absent before migration");
    assertEquals(state_name, "PartyBuffCalendar", "precondition: state_name must point at the new key");

    checkInstall();

    // The old key is gone; the new key holds the migrated data.
    assertEquals(state.CALENDAR, undefined, "state.CALENDAR must be deleted after migration");
    assert(state.PartyBuffCalendar, "state.PartyBuffCalendar must exist after migration");
    assertEquals(state[state_name], state.PartyBuffCalendar, "state_name must resolve to the migrated blob");

    // Not a fresh install: the seeded world/date/setup status survived.
    const settings = ensureSettings();
    assertEquals(settings.calendarSystem, "faerunian", "calendarSystem must be the seeded world, not the eberron default");

    const cal = getCal();
    assertEquals(cal.current.year, 1500, "year must be the seeded year, not the eberron default (998)");
    assertEquals(cal.current.day_of_the_month, 15, "day must be the seeded day, not clobbered to 1");

    assertEquals(getSetupState().status, "complete", "setup status must stay complete, not reset to uninitialized");

    // Custom events survived the move (by name — checkInstall re-derives
    // month indices/colors, so compare on the field that can't drift).
    const names = cal.events.map((e: any) => e.name);
    assert(names.includes("Founding of the Lodge"), "seeded event 1 must survive the migration");
    assert(names.includes("Harvest Feast"), "seeded event 2 must survive the migration");
  });

  it("is idempotent: a campaign already on the new key (no state.CALENDAR) is untouched by a second checkInstall", () => {
    (globalThis as any)._resetShim();
    const state = stateRoot();
    // Eberron (no intercalary festival months) rather than faerunian here:
    // the Harptos default-event merge takes a couple of checkInstall passes
    // to settle its color backfill regardless of the persistence key (see
    // test/state-cleanup.test.ts, which warms up the same way for its own
    // idempotency check) — an existing, unrelated quirk. Eberron settles in
    // one pass, so it isolates this test to what it's actually checking:
    // the migration/checkInstall combo doesn't churn an already-settled,
    // already-migrated campaign. Year 1250 (not the eberron default 998) so
    // "untouched" can't be confused with "reset to defaults."
    state[state_name] = {
      setup: { status: "complete" },
      settings: { calendarSystem: "eberron", calendarVariant: "standard", seasonVariant: "eberron" },
      calendar: {
        current: { month: 3, day_of_the_month: 12, day_of_the_week: 0, year: 1250 },
        months: [{ name: "Zarantyr", days: 28, regularIndex: 0 }],
        weekdays: ["Sul", "Mol", "Zol", "Wir", "Zor", "Far", "Sar"],
        events: [],
      },
    };
    assertEquals(state.CALENDAR, undefined, "precondition: no old key present");

    // Warm up once so the default-event merge/backfill (see comment above)
    // has already settled, the same way state-cleanup.test.ts's idempotency
    // check does, before comparing two back-to-back calls.
    checkInstall();
    assertEquals(state.CALENDAR, undefined, "old key must not be resurrected by checkInstall");
    const before = JSON.stringify(state[state_name]);

    checkInstall();
    const after = JSON.stringify(state[state_name]);

    assertEquals(after, before, "a second checkInstall on an already-migrated campaign must not perturb state");
    assertEquals(state.CALENDAR, undefined, "old key must still be absent after the second checkInstall");
    assertEquals(JSON.parse(after).calendar.current.year, 1250, "sanity: still the seeded year, not reset to the eberron default (998)");
  });

  it("fresh install (neither key present) creates state.PartyBuffCalendar normally", () => {
    (globalThis as any)._resetShim();
    const state = stateRoot();
    assertEquals(state.CALENDAR, undefined, "precondition: no old key");
    assertEquals(state.PartyBuffCalendar, undefined, "precondition: no new key");

    checkInstall();

    assertEquals(state.CALENDAR, undefined, "old key must not appear on a fresh install");
    assert(state.PartyBuffCalendar, "new key must be created on a fresh install");
    assertEquals(getSetupState().status, "uninitialized", "a genuinely fresh install is uninitialized, not migrated-complete");
  });

  it("end-to-end: a real !cal dispatch after migration renders the seeded date/world, not a reset", () => {
    (globalThis as any)._resetShim();
    const state = stateRoot();
    state.CALENDAR = seedLegacyCampaignBlob();

    handleInput({ type: "api", content: "!cal", who: "GM (GM)", playerid: "GM" } as any);

    assertEquals(state.CALENDAR, undefined, "state.CALENDAR must be gone after handling a real command");
    assert(state.PartyBuffCalendar, "state.PartyBuffCalendar must be present after handling a real command");
    assertEquals(state.PartyBuffCalendar.settings.calendarSystem, "faerunian", "dispatched command must operate on the migrated world");
    assertEquals(state.PartyBuffCalendar.calendar.current.year, 1500, "dispatched command must operate on the migrated year");

    const chat = (globalThis as any)._chatLog;
    const last = chat[chat.length - 1];
    assert(last, "handleInput must have sent a whisper");
    assert(/1500/.test(last.msg), "rendered panel must show the migrated year, not a reset default");
  });
});
