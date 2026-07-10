import { describe, it, beforeEach } from 'node:test';
import { strictEqual as assertEquals, ok as assert } from 'node:assert/strict';
import { completeSetup, freshInstall } from './helpers.js';
import { state_name } from '../src/constants.js';
import { handleInput } from '../src/boot-register.js';
import {
  applyToken,
  parseToken,
  TOKEN_SCHEMA_VERSION,
  type ParseResult,
} from '../src/token.js';

/** UTF-8-safe base64 encode for test fixtures. Mirrors the web
 *  producer's `btoa(unescape(encodeURIComponent(json)))` semantics
 *  (which is what the consumer's `decodeURIComponent(escape(atob(...)))`
 *  inverts). */
function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function gmMsg(content: string) {
  return { type: 'api', content, who: 'GM (GM)', playerid: 'GM' } as any;
}

function playerMsg(content: string) {
  return { type: 'api', content, who: 'Alice', playerid: 'P1' } as any;
}

function lastChat() {
  const log = (globalThis as any)._chatLog;
  return log[log.length - 1] || null;
}

function freshAndComplete() {
  freshInstall();
  completeSetup();
}

/** Narrow a ParseResult to the failure branch in a TS-friendly way. */
function expectFail(r: ParseResult, errorRegex: RegExp): void {
  if (r.ok === true) {
    throw new Error('expected parse to fail, but got ok with token: ' + JSON.stringify(r.token));
  }
  assert(errorRegex.test(r.error), `error "${r.error}" did not match ${errorRegex}`);
}

function expectOk(r: ParseResult) {
  if (r.ok === false) throw new Error('expected parse to succeed, but got error: ' + r.error);
  return r.token;
}

const MIN_VALID = {
  v: TOKEN_SCHEMA_VERSION,
  world: 'eberron',
  date: { kind: 'month', year: 998, monthIndex: 0, day: 1 },
};

describe('parseToken — decode and structural validation', () => {
  it('rejects empty input', () => {
    expectFail(parseToken(''), /empty/i);
  });

  it('rejects non-base64 garbage', () => {
    const r = parseToken('!!!not valid base64 at all###');
    if (r.ok) throw new Error('expected failure');
  });

  it('rejects base64 that decodes to non-JSON', () => {
    expectFail(
      parseToken(Buffer.from('hello world', 'utf8').toString('base64')),
      /json/i,
    );
  });

  it('rejects payloads with missing v', () => {
    expectFail(
      parseToken(encode({ world: 'eberron', date: MIN_VALID.date })),
      /schema version/i,
    );
  });

  it("rejects newer-than-supported schema versions per §10.5", () => {
    expectFail(
      parseToken(encode({ ...MIN_VALID, v: TOKEN_SCHEMA_VERSION + 1 })),
      /newer version/i,
    );
  });

  it('rejects unknown worlds', () => {
    expectFail(parseToken(encode({ ...MIN_VALID, world: 'mars' })), /unknown world/i);
  });

  it('rejects malformed date', () => {
    expectFail(
      parseToken(encode({ ...MIN_VALID, date: { kind: 'month', year: 'abc', monthIndex: 0, day: 1 } })),
      /year/i,
    );
  });

  it('rejects intercalary date missing intercalaryKey', () => {
    expectFail(
      parseToken(encode({ ...MIN_VALID, date: { kind: 'intercalary', year: 998, day: 1 } })),
      /intercalary/i,
    );
  });

  it('rejects lunarAnchors with bad phase', () => {
    expectFail(
      parseToken(encode({
        ...MIN_VALID,
        lunarAnchors: { olarune: { year: 998, monthIndex: 0, day: 1, phase: 'quarter' } },
      })),
      /phase/i,
    );
  });

  it('rejects planarAnchors on non-Eberron tokens', () => {
    expectFail(
      parseToken(encode({
        ...MIN_VALID,
        world: 'faerun',
        date: { kind: 'month', year: 1372, monthIndex: 0, day: 1 },
        planarAnchors: { daanvi: 5 },
      })),
      /eberron/i,
    );
  });

  it('rejects planarAnchors with non-integer offsets', () => {
    expectFail(
      parseToken(encode({ ...MIN_VALID, planarAnchors: { daanvi: 'oops' } })),
      /integer/i,
    );
  });

  it('accepts the minimal valid token', () => {
    const token = expectOk(parseToken(encode(MIN_VALID)));
    assertEquals(token.world, 'eberron');
    assertEquals(token.v, TOKEN_SCHEMA_VERSION);
  });

  it('accepts a fully-populated token', () => {
    const token = expectOk(parseToken(encode({
      ...MIN_VALID,
      variant: 'standard',
      palette: 'lunar',
      lunarAnchors: {
        olarune: { year: 998, monthIndex: 0, day: 12, phase: 'full' },
        aryth: { year: 998, monthIndex: 5, day: 3, phase: 'new', hour: 14 },
      },
      planarAnchors: { daanvi: 0, fernia: 14 },
    })));
    assertEquals(token.palette, 'lunar');
    assert(token.lunarAnchors);
    assertEquals(Object.keys(token.lunarAnchors).length, 2);
    assertEquals(token.planarAnchors?.fernia, 14);
  });

  it('strips wrapping whitespace before decode', () => {
    const tok = encode(MIN_VALID);
    const r = parseToken(`   \n  ${tok}   \n`);
    expectOk(r);
  });

  it('decodes UTF-8 safely (round-trips non-Latin1 glyphs)', () => {
    const token = expectOk(parseToken(encode({
      ...MIN_VALID,
      world: 'faerun',
      date: { kind: 'month', year: 1372, monthIndex: 0, day: 1 },
      palette: 'fearûn-default',
    })));
    assertEquals(token.palette, 'fearûn-default');
  });
});

describe('parseToken — Dragonlance krynnAnchor and per-moon constraints', () => {
  const DL_DATE = { kind: 'month' as const, year: 350, monthIndex: 0, day: 1 };
  const DL_BASE = { v: 1, world: 'dragonlance', date: DL_DATE };

  it('accepts krynnAnchor on a Dragonlance token', () => {
    const token = expectOk(parseToken(encode({
      ...DL_BASE,
      krynnAnchor: { kind: 'month', year: 350, monthIndex: 6, day: 14 },
    })));
    assertEquals(token.krynnAnchor?.day, 14);
  });

  it('rejects krynnAnchor on non-Dragonlance tokens', () => {
    expectFail(
      parseToken(encode({
        ...MIN_VALID,
        krynnAnchor: { kind: 'month', year: 998, monthIndex: 0, day: 1 },
      })),
      /dragonlance/i,
    );
  });

  it('rejects krynnAnchor that is not month-kind', () => {
    expectFail(
      parseToken(encode({
        ...DL_BASE,
        krynnAnchor: { kind: 'intercalary', year: 350, intercalaryKey: 'x', day: 1 },
      })),
      /month-kind/i,
    );
  });

  it('rejects non-Krynn moon keys in Dragonlance lunarAnchors', () => {
    expectFail(
      parseToken(encode({
        ...DL_BASE,
        lunarAnchors: { olarune: { year: 350, monthIndex: 0, day: 1, phase: 'full' } },
      })),
      /dragonlance has no moon/i,
    );
  });

  it('rejects Krynn lunarAnchors that disagree on date or phase', () => {
    expectFail(
      parseToken(encode({
        ...DL_BASE,
        lunarAnchors: {
          solinari: { year: 350, monthIndex: 6, day: 14, phase: 'full' },
          lunitari: { year: 350, monthIndex: 6, day: 14, phase: 'full' },
          nuitari: { year: 350, monthIndex: 6, day: 15, phase: 'full' },
        },
      })),
      /disagrees with the triad/i,
    );
  });

  it('rejects krynnAnchor and lunarAnchors together on Dragonlance', () => {
    expectFail(
      parseToken(encode({
        ...DL_BASE,
        krynnAnchor: { kind: 'month', year: 350, monthIndex: 6, day: 14 },
        lunarAnchors: { solinari: { year: 350, monthIndex: 6, day: 14, phase: 'full' } },
      })),
      /either krynnanchor or lunaranchors/i,
    );
  });

  it('accepts legacy triplicated Krynn lunarAnchors when all entries agree', () => {
    const token = expectOk(parseToken(encode({
      ...DL_BASE,
      lunarAnchors: {
        solinari: { year: 350, monthIndex: 6, day: 14, phase: 'full' },
        lunitari: { year: 350, monthIndex: 6, day: 14, phase: 'full' },
        nuitari: { year: 350, monthIndex: 6, day: 14, phase: 'full' },
      },
    })));
    // Parse leaves the entries on the token as-is; applyToken does the
    // translation to canonical krynnAnchor on persistence.
    assertEquals(Object.keys(token.lunarAnchors ?? {}).length, 3);
  });
});

describe('applyToken — writes setup to state.PartyBuffCalendar', () => {
  beforeEach(() => {
    freshAndComplete();
  });

  it('switches world + variant via applyCalendarSystem, resolving engine id to wrapper key', () => {
    // Token carries the ENGINE id ('faerun'); the wrapper's registry key is
    // 'faerunian'. Both the persisted calendarSystem and the actual month
    // structure must reflect the resolved wrapper world, not the raw
    // engine id (which would be an unknown CALENDAR_SYSTEMS key).
    const result = applyToken({
      v: 1,
      world: 'faerun',
      date: { kind: 'month', year: 1372, monthIndex: 6, day: 14 },
    });
    assertEquals(result.applied, true);
    const root = (globalThis as any).state[state_name];
    assertEquals(root.settings.calendarSystem, 'faerunian');
    assertEquals(root.calendar.months[0].name, 'Hammer', 'months must actually switch to Harptos');
  });

  it('applies a Barovia token (engineId === wrapperKey control, weekless world)', () => {
    const result = applyToken({
      v: 1,
      world: 'barovia',
      date: { kind: 'month', year: 735, monthIndex: 0, day: 1 },
    });
    assertEquals(result.applied, true);
    const root = (globalThis as any).state[state_name];
    assertEquals(root.settings.calendarSystem, 'barovia');
    assertEquals(root.calendar.months[0].name, 'First Moon');
    assertEquals(root.calendar.weekdays.length, 0);
  });

  it('applies a Greyhawk token (engineId === wrapperKey control)', () => {
    const result = applyToken({
      v: 1,
      world: 'greyhawk',
      date: { kind: 'month', year: 591, monthIndex: 0, day: 1 },
    });
    assertEquals(result.applied, true);
    const root = (globalThis as any).state[state_name];
    assertEquals(root.settings.calendarSystem, 'greyhawk');
    // Structural index 0 is Needfest (an intercalary placed 'before'
    // Fireseek); Fireseek itself is structural index 1.
    assertEquals(root.calendar.months[1].name, 'Fireseek');
  });

  it('fails cleanly on a genuinely unknown world, with no state change', () => {
    const root = (globalThis as any).state[state_name];
    const before = JSON.parse(JSON.stringify(root));
    const result = applyToken({
      v: 1,
      world: 'narnia',
      date: { kind: 'month', year: 1, monthIndex: 0, day: 1 },
    });
    assertEquals(result.applied, false);
    if (result.applied === false) assert(/unknown world/i.test(result.error));
    const after = (globalThis as any).state[state_name];
    assertEquals(JSON.stringify(after), JSON.stringify(before), 'state must be untouched on failure');
  });

  it('writes palette to settings.colorTheme (string when set, null when omitted)', () => {
    applyToken({
      v: 1,
      world: 'eberron',
      date: { kind: 'month', year: 998, monthIndex: 0, day: 1 },
      palette: 'lunar',
    });
    const root = (globalThis as any).state[state_name];
    assertEquals(root.settings.colorTheme, 'lunar');

    applyToken({
      v: 1,
      world: 'eberron',
      date: { kind: 'month', year: 998, monthIndex: 0, day: 1 },
    });
    const root2 = (globalThis as any).state[state_name];
    assertEquals(root2.settings.colorTheme, null);
  });

  it('persists lunarAnchors + planarAnchors under state.imported for engine wiring', () => {
    applyToken({
      v: 1,
      world: 'eberron',
      date: { kind: 'month', year: 998, monthIndex: 0, day: 1 },
      lunarAnchors: {
        olarune: { year: 998, monthIndex: 0, day: 12, phase: 'full' },
      },
      planarAnchors: { daanvi: 5 },
    });
    const root = (globalThis as any).state[state_name];
    assert(root.imported);
    assertEquals(root.imported.lunarAnchors.olarune.phase, 'full');
    assertEquals(root.imported.planarAnchors.daanvi, 5);
    assertEquals(root.imported.schemaVersion, 1);
  });

  it('persists krynnAnchor directly when the producer sent the canonical shape', () => {
    applyToken({
      v: 1,
      world: 'dragonlance',
      date: { kind: 'month', year: 350, monthIndex: 0, day: 1 },
      krynnAnchor: { kind: 'month', year: 350, monthIndex: 6, day: 14 },
    });
    const root = (globalThis as any).state[state_name];
    assert(root.imported);
    assertEquals(root.imported.krynnAnchor.day, 14);
    assertEquals(Object.keys(root.imported.lunarAnchors).length, 0);
  });

  it('translates legacy triplicated full Krynn lunarAnchors into krynnAnchor', () => {
    applyToken({
      v: 1,
      world: 'dragonlance',
      date: { kind: 'month', year: 350, monthIndex: 0, day: 1 },
      lunarAnchors: {
        solinari: { year: 350, monthIndex: 6, day: 14, phase: 'full' },
        lunitari: { year: 350, monthIndex: 6, day: 14, phase: 'full' },
        nuitari: { year: 350, monthIndex: 6, day: 14, phase: 'full' },
      },
    });
    const root = (globalThis as any).state[state_name];
    assert(root.imported.krynnAnchor);
    assertEquals(root.imported.krynnAnchor.day, 14);
    assertEquals(root.imported.krynnAnchor.monthIndex, 6);
    // Translated entries are stripped from lunarAnchors so PR 2c sees
    // only one Dragonlance path.
    assertEquals(Object.keys(root.imported.lunarAnchors).length, 0);
  });

  it('snapshots previous and new date labels in the result', () => {
    const result = applyToken({
      v: 1,
      world: 'eberron',
      date: { kind: 'month', year: 998, monthIndex: 6, day: 14 },
    });
    if (result.applied !== true) throw new Error('expected apply to succeed: ' + result.error);
    assert(result.previousDateLabel);
    assert(result.newDateLabel);
    // After freshInstall + completeSetup, the previous date is the
    // default start; the token shifts the day, so the labels should
    // differ.
    assertEquals(result.dateChanged, true);
  });
});

describe('!cal token — command routing + GM gate', () => {
  beforeEach(() => {
    freshAndComplete();
  });

  it('rejects a non-GM caller with a private whisper', () => {
    handleInput(playerMsg('!cal token ' + encode(MIN_VALID)));
    const chat = lastChat();
    assert(chat);
    assert(/GM-only/i.test(chat.msg));
  });

  it('whispers an error chip on malformed tokens', () => {
    handleInput(gmMsg('!cal token gibberish'));
    const chat = lastChat();
    assert(chat);
    assert(/token/i.test(chat.msg));
  });

  it('applies a valid token and surfaces the two §10.3 confirmations', () => {
    handleInput(gmMsg('!cal token ' + encode({
      v: 1,
      world: 'eberron',
      date: { kind: 'month', year: 998, monthIndex: 6, day: 14 },
    })));
    const log = (globalThis as any)._chatLog;
    const recent = log.slice(-2).map((e: any) => e.msg).join('\n');
    assert(/New configuration loaded/i.test(recent));
    assert(/previous date/i.test(recent));
  });
});
