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

  it('accepts the minimal valid token', () => {
    const token = expectOk(parseToken(encode(MIN_VALID)));
    assertEquals(token.world, 'eberron');
    assertEquals(token.v, TOKEN_SCHEMA_VERSION);
  });

  it('accepts a fully-populated token (variant + palette only — no anchor fields)', () => {
    const token = expectOk(parseToken(encode({
      ...MIN_VALID,
      variant: 'standard',
      palette: 'lunar',
    })));
    assertEquals(token.variant, 'standard');
    assertEquals(token.palette, 'lunar');
  });

  it('ignores legacy lunarAnchors/krynnAnchor/planarAnchors fields on the raw payload (canon-only, structural)', () => {
    // Moons and planes are canon-only (#198): getMoonOpts()/getPlanePositions()
    // always return {}. A token no longer declares these fields, and an
    // older producer that still sends them must not fail to parse — the
    // fields are simply not read.
    const token = expectOk(parseToken(encode({
      ...MIN_VALID,
      lunarAnchors: { olarune: { year: 998, monthIndex: 0, day: 1, phase: 'quarter' } },
      krynnAnchor: { kind: 'intercalary', year: 998, intercalaryKey: 'x', day: 1 },
      planarAnchors: { daanvi: 'oops' },
    })));
    assertEquals(token.world, 'eberron');
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

  it('never creates state.imported — anchors are retired, not persisted', () => {
    // Canon-only per #198: applyToken no longer reads or stores lunar/
    // krynn/planar anchors. Even a raw payload carrying legacy anchor
    // fields (an older web producer) must not leave a `state.imported`
    // slot behind.
    applyToken({
      v: 1,
      world: 'dragonlance',
      date: { kind: 'month', year: 350, monthIndex: 0, day: 1 },
      ...({ krynnAnchor: { kind: 'month', year: 350, monthIndex: 6, day: 14 } } as any),
    });
    const root = (globalThis as any).state[state_name];
    assertEquals(root.imported, undefined);
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
