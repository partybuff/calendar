// Plane lore (effects + canonical note) must be sourced from the engine, so
// editing it engine-side auto-bumps to Roll20 — the wrapper carries no
// hardcoded copy. Version-agnostic: `effects` is present on engine ≥0.38.0;
// `canonicalNote` on ≥0.39.0 (undefined → empty on older, which still
// matches the wrapper's undefined-safe read).
import { describe, it } from 'node:test';
import { strictEqual as assertEquals, deepStrictEqual as assertDeep, ok as assert } from 'node:assert/strict';
import './roll20-shim.js';
import { planes as enginePlanes } from '@partybuff/calendar-engine';
import { freshInstall } from './helpers.js';
import { applyCalendarSystem } from '../src/state.js';
import { toSerial } from '../src/date-math.js';
import { getPlanarState, PLANE_DATA } from '../src/planes.js';

describe('plane lore is engine-sourced', () => {
  it('effects and note come from the engine, not a wrapper copy', () => {
    freshInstall();
    applyCalendarSystem('eberron', 'standard');
    const date = { kind: 'month' as const, year: 998, monthIndex: 0, day: 1 };
    const serial = toSerial(998, 0, 1);
    for (const p of (PLANE_DATA as any).eberron) {
      const key = p.name.toLowerCase().replace(/\s+/g, '_');
      const eng: any = enginePlanes.stateOf(key, date);
      const ps: any = getPlanarState(p.name, serial);
      assert(ps, `${p.name} getPlanarState`);
      assertDeep(ps.plane.effects, eng.plane.effects || null,
        `${p.name} effects sourced from engine`);
      assertEquals(ps.note, eng.plane.canonicalNote || '',
        `${p.name} note sourced from engine canonicalNote`);
    }
  });

  it('PLANE_DATA carries no hardcoded lore text', () => {
    for (const p of (PLANE_DATA as any).eberron) {
      assert(!('effects' in p), `${p.name} has no hardcoded effects`);
      assert(!('note' in p), `${p.name} has no hardcoded note`);
    }
  });
});
