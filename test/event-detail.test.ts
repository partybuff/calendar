import { describe, it } from 'node:test';
import { ok as assert } from 'node:assert/strict';
import './roll20-shim.js';
import { handleInput } from '../src/boot-register.js';
import { completeSetup, freshInstall } from './helpers.js';
import { applyCalendarSystem } from '../src/state.js';
import { worlds as engineWorlds } from '@partybuff/calendar-engine';

function gm(content: string) { return { type: 'api', content, who: 'GM (GM)', playerid: 'GM' } as any; }
function lastMsg(): string { const log = (globalThis as any)._chatLog; return String((log[log.length - 1] || {}).msg || ''); }

describe('!cal event <name> — engine-sourced lore', () => {
  it('Night of the Eye shows the engine holiday description', () => {
    freshInstall(); completeSetup();
    applyCalendarSystem('dragonlance', 'standard');
    const noe: any = (engineWorlds.get('dragonlance').holidays || [])
      .find((h: any) => h.key === 'night_of_the_eye');
    assert(noe && noe.description, 'engine ships a Night of the Eye description');

    handleInput(gm('!cal event Night of the Eye'));
    const msg = lastMsg();
    assert(msg.includes('Night of the Eye'), 'card names the event: ' + msg.slice(0, 200));
    // The engine description text (or a distinctive slice of it) appears.
    const slice = noe.description.slice(0, 40).replace(/[&<>]/g, (c: string) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
    assert(msg.includes(slice), 'card shows the engine description: ' + msg);
  });

  it('unknown event reports not found, does not crash', () => {
    freshInstall(); completeSetup();
    applyCalendarSystem('eberron', 'standard');
    handleInput(gm('!cal event Totally Not A Real Holiday'));
    assert(/No event named/.test(lastMsg()), 'graceful not-found');
  });
});
