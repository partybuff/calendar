// Regression for the year-scale message-size blocker: a full 12-month year
// rendered in ONE sendChat runs ~300KB, far past Roll20's practical chat
// message size limit. Fix: chunk year-scale ranges (>2 month tables) into
// one message per month group (events.ts buildCalendarsHtmlPartsForSpec /
// _chunkMonthsForDelivery), delivered as sequential sendChat calls.
//
// Covers all three verified producers: the whispered `!cal year` view, the
// GM `!cal send year` broadcast, and `!cal planes ranges year <year>`. Also
// guards that small/single-month ranges are NOT chunked (still exactly one
// message, byte-identical to the pre-fix behavior).
import { describe, it } from 'node:test';
import { ok as assert, strictEqual as assertEquals } from 'node:assert/strict';
import './roll20-shim.js';
import { handleInput } from '../src/boot-register.js';
import { freshInstall, completeSetup } from './helpers.js';
import { getCal } from '../src/state.js';
import { handlePlanesCommand } from '../src/planes.js';

function gm(content: string) {
  return { type: 'api', content, who: 'GM (GM)', playerid: 'GM' } as any;
}

function gmUser() {
  return { who: 'GM (GM)', playerid: 'GM' } as any;
}

function chatLog(): Array<{ who: string; msg: string; opts: any }> {
  return (globalThis as any)._chatLog;
}

function clearLog() {
  chatLog().length = 0;
}

const MAX_MESSAGE_BYTES = 100 * 1024; // 100 KB per the task's chunking cap

function byteSize(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

describe('year-scale range chunking', () => {
  it('`!cal year` produces multiple messages, each under 100KB, covering all 12 months in order', () => {
    freshInstall();
    completeSetup();

    const cal = getCal();
    const monthNames = cal.months.map((m: any) => m.name);

    clearLog();
    handleInput(gm('!cal year'));
    const log = chatLog();

    assert(log.length > 1, 'year-scale whisper should be split into multiple messages, got ' + log.length);

    for (const entry of log) {
      const size = byteSize(String(entry.msg || ''));
      assert(size < MAX_MESSAGE_BYTES, 'every chunked message must stay under 100KB, got ' + (size / 1024).toFixed(1) + 'KB');
    }

    // Every whispered message must stay whisper-first (no public broadcast).
    for (const entry of log) {
      assert(!/^\/direct\b/.test(String(entry.msg || '')), 'whispered year view must not broadcast: ' + entry.msg);
    }

    // All 12 months appear across the set, IN CALENDAR ORDER. Match on the
    // month-table header markup specifically (name immediately followed by
    // the year/era span) so an incidental substring elsewhere can't fake a
    // hit; a boundary "previous month" strip (rendered when today sits in
    // the year's first calendar row) may legitimately repeat the last
    // month's name in an earlier message, so the search only requires
    // non-decreasing message indices, not strictly increasing ones.
    const joined = log.map((e) => String(e.msg || ''));
    let cursorMsgIdx = 0;
    for (const name of monthNames) {
      let found = false;
      for (let i = cursorMsgIdx; i < joined.length; i++) {
        if (joined[i].includes('>' + name + '<span style="float:right;')) {
          cursorMsgIdx = i;
          found = true;
          break;
        }
      }
      assert(found, 'expected month "' + name + '" table header to appear in the chunked output, in calendar order');
    }
  });

  it('`!cal send year` (broadcast) also chunks, with every message under 100KB and no button markup', () => {
    freshInstall();
    completeSetup();

    clearLog();
    handleInput(gm('!cal send year'));
    const log = chatLog();

    assert(log.length > 1, 'broadcast year view should be split into multiple messages, got ' + log.length);

    for (const entry of log) {
      const msg = String(entry.msg || '');
      const size = byteSize(msg);
      assert(size < MAX_MESSAGE_BYTES, 'every broadcast chunk must stay under 100KB, got ' + (size / 1024).toFixed(1) + 'KB');
      assert(/^\/direct\b/.test(msg), 'send year must broadcast via /direct: ' + msg.slice(0, 40));
      // Broadcasts are non-interactive — Roll20's /direct strips button
      // markup anyway, but the producer must not emit any `!cal ...`
      // command links for a public range broadcast.
      assert(!/\]\(!cal /.test(msg), 'broadcast must carry no !cal button markup: ' + msg.slice(0, 200));
    }
  });

  it('`!cal planes ranges year <year>` chunks into multiple whispered messages, all under 100KB', () => {
    freshInstall();
    completeSetup();

    clearLog();
    handlePlanesCommand(gmUser(), ['planes', 'ranges', 'year', '998']);
    const log = chatLog();

    assert(log.length > 1, 'planar year range should be split into multiple messages, got ' + log.length);
    for (const entry of log) {
      const size = byteSize(String(entry.msg || ''));
      assert(size < MAX_MESSAGE_BYTES, 'every planar chunk must stay under 100KB, got ' + (size / 1024).toFixed(1) + 'KB');
    }
    const joined = log.map((e) => String(e.msg || '')).join('\n---\n');
    assert(joined.includes('Full Calendar Year (998)'), 'range title should appear: ' + joined.slice(0, 200));
  });

  it('`!cal show month` still produces exactly one message (no chunking regression)', () => {
    freshInstall();
    completeSetup();

    clearLog();
    handleInput(gm('!cal show month'));
    const log = chatLog();

    assertEquals(log.length, 1, 'single-month view must remain exactly one message, got ' + log.length);
    const size = byteSize(String(log[0].msg || ''));
    assert(size < MAX_MESSAGE_BYTES, 'single-month message unexpectedly huge: ' + (size / 1024).toFixed(1) + 'KB');
  });
});
