// Section 21: Planar System (canon-only, read-only Roll20 surface)
//
// This is a thin Roll20 wrapper around the Eberron planar canon data.
// Per CLAUDE.md / DESIGN.md / ENGINE_CONTRACT.md §5.4, the wrapper surfaces
// planar phase information for display only — no GM overrides, no seeded
// generation, no anchor wizardry, no knowledge tiers. Players and GMs see
// the same canon-derived state.
//
// Phase math AND lore are engine-owned. `getPlanarState` delegates to
// `@partybuff/calendar-engine/planes.stateOf`, passing `getPlanePositions()`
// (always `{}` — canon-only per #198) as `PlanePositions`, and sources
// the plane's `effects` and canonical `note` from the engine's returned
// `Plane` (canonicalNote requires engine ≥0.39.0; undefined-safe on older).
// So editing plane lore/mechanics in the engine auto-bumps to Roll20. The
// wrapper's `PLANE_DATA` table now carries ONLY presentation + orbit
// metadata (name, title, color, orbit params, associatedMoon, seasonHint) —
// NO lore text.
import { enginePlanes, getPlanePositions, serialToCalendarDate } from './engine-opts.js';
import { ensureSettings, getCal, titleCase } from './state.js';
import { fromSerial, toSerial, todaySerial } from './date-math.js';
import { _monthRangeFromSerial, _renderSyntheticMiniCal, button, esc, handoutWrap } from './rendering.js';
import { _chunkMonthsForDelivery, _deliverAdditionalCalendarRange, _deliverTopLevelCalendarRange, buildAdditionalRangesCommand } from './events.js';
import { _displayModeLabel, _legendLine, _menuBox, _normalizeDisplayMode, _serialToDateSpec, _shiftSerialByMonth, dateLabelFromSerial, formalDateLabelFromSerial, parseDatePrefixForAdd } from './ui.js';
import { whisper, whisperParts } from './commands.js';

/* ============================================================================
 * 21) PLANAR SYSTEM — canon-only
 * ============================================================================
 * Each Eberron plane orbits the Material in a cycle: coterminous → neutral →
 * remote → neutral → coterminous. Planes snap between active states with no
 * gradual transition. This module computes current phase from canonical
 * anchor dates and cycle parameters and renders read-only displays.
 * ==========================================================================*/

// ---------------------------------------------------------------------------
// 21a) Planar data — canon cycle definitions for Eberron's 13 planes
// ---------------------------------------------------------------------------

// Phase durations in days. Full orbit = coterminous + neutral + remote + neutral.
// Neutral gaps are computed as (orbit - coterminous - remote) / 2.
// Special planes have 'fixed' type instead of 'cyclic'.

export var PLANE_DATA = {
  eberron: [
    { name:'Daanvi',    title:'The Perfect Order',
      color: '#C9A227',
      type:'cyclic',
      orbitYears: 400,   coterminousDays: null, remoteDays: null,
      coterminousYears: 100, remoteYears: 100,
      anchorYear: 800, anchorPhase: 'coterminous',
      associatedMoon: 'Nymm'},
    { name:'Dal Quor',  title:'The Region of Dreams',
      color: '#7B68AE',
      type:'fixed', fixedPhase:'remote',
      associatedMoon: 'Crya'},
    { name:'Dolurrh',   title:'The Realm of the Dead',
      color: '#808080',
      type:'cyclic',
      orbitYears: 100,   coterminousDays: null, remoteDays: null,
      coterminousYears: 1, remoteYears: 1,
      anchorYear: 950, anchorPhase: 'coterminous',
      associatedMoon: 'Aryth'},
    { name:'Fernia',    title:'The Sea of Fire',
      color: '#FF5722',
      type:'cyclic',
      orbitYears: 5,     coterminousDays: 28, remoteDays: 28,
      coterminousYears: null, remoteYears: null,
      anchorYear: 998, anchorPhase: 'coterminous', anchorMonth: 7,
      seasonHint: 'midsummer',
      associatedMoon: 'Eyre'},
    { name:'Irian',     title:'The Eternal Dawn',
      color: '#F0F0F0',
      type:'cyclic',
      orbitYears: 3,     coterminousDays: 10, remoteDays: 10,
      coterminousYears: null, remoteYears: null,
      anchorYear: 998, anchorPhase: 'coterminous', anchorMonth: 4, anchorDay: 1,
      seasonHint: 'spring',
      associatedMoon: 'Barrakas'},
    { name:'Kythri',    title:'The Churning Chaos',
      color: '#2E8B8B',
      type:'fixed', fixedPhase:'neutral',
      associatedMoon: 'Zarantyr'},
    { name:'Lamannia',  title:'The Twilight Forest',
      color: '#228B22',
      type:'cyclic',
      orbitYears: 1,     coterminousDays: 7, remoteDays: 7,
      coterminousYears: null, remoteYears: null,
      anchorYear: 998, anchorPhase: 'coterminous', anchorMonth: 6, anchorDay: 24,
      seasonHint: 'summer solstice',
      associatedMoon: 'Olarune'},
    { name:'Mabar',     title:'The Endless Night',
      color: '#111111',
      type:'cyclic',
      orbitYears: 1,     coterminousDays: 3, remoteDays: 0,
      coterminousYears: null, remoteYears: null,
      anchorYear: 998, anchorPhase: 'coterminous', anchorMonth: 12, anchorDay: 26,
      seasonHint: 'winter solstice',
      associatedMoon: 'Sypheros',
      remoteOrbitYears: 5, remoteDaysSpecial: 5, remoteSeasonHint: 'summer solstice'},
    { name:'Risia',     title:'The Plain of Ice',
      color: '#00ACC1',
      type:'cyclic',
      orbitYears: 5,     coterminousDays: 28, remoteDays: 28,
      coterminousYears: null, remoteYears: null,
      anchorYear: 996, anchorPhase: 'coterminous', anchorMonth: 1,
      linkedTo: 'Fernia',
      seasonHint: 'midwinter',
      associatedMoon: 'Dravago'},
    { name:'Shavarath', title:'The Eternal Battleground',
      color: '#8B0000',
      type:'cyclic',
      orbitYears: 36,    coterminousDays: null, remoteDays: null,
      coterminousYears: 1, remoteYears: 1,
      anchorYear: 990, anchorPhase: 'coterminous',
      associatedMoon: 'Vult'},
    { name:'Syrania',   title:'The Azure Sky',
      color: '#64B5F6',
      type:'cyclic',
      orbitYears: 10,    coterminousDays: 1, remoteDays: 1,
      coterminousYears: null, remoteYears: null,
      anchorYear: 998, anchorPhase: 'coterminous', anchorMonth: 9, anchorDay: 9,
      associatedMoon: 'Therendor'},
    { name:'Thelanis',  title:'The Faerie Court',
      color: '#50C878',
      type:'cyclic',
      orbitYears: 225,   coterminousDays: null, remoteDays: null,
      coterminousYears: 7, remoteYears: 7,
      anchorYear: 800, anchorPhase: 'coterminous',
      associatedMoon: 'Rhaan'},
    { name:'Xoriat',    title:'The Realm of Madness',
      color: '#9ACD32',
      type:'fixed', fixedPhase:'remote',
      associatedMoon: 'Lharvion'}
  ]
};

// ---------------------------------------------------------------------------
// 21c) Plane data lookups
// ---------------------------------------------------------------------------

// Get the plane definition by name (case-insensitive).
export function _getPlaneData(name){
  var planes = _getAllPlaneData();
  if (!planes || !planes.length) return null;
  var lc = String(name || '').toLowerCase();
  for (var i = 0; i < planes.length; i++){
    if (planes[i].name.toLowerCase() === lc) return planes[i];
  }
  return null;
}

// Get all plane definitions for the current calendar system.
// Returns empty array for worlds without planar data.
export function _getAllPlaneData(){
  var st = ensureSettings();
  return PLANE_DATA[st.calendarSystem] || [];
}

// Convert years to days using the calendar's year length.
export function _planarYearDays(){
  return getCal().months.reduce(function(s, m){ return s + (m.days|0); }, 0);
}

// ---------------------------------------------------------------------------
// 21d) Phase calculation — canon-only
// ---------------------------------------------------------------------------

// Calculate the current phase of a plane at a given serial day.
// Returns { plane, phase, daysIntoPhase, daysUntilNextPhase, phaseDuration,
//          nextPhase, note, sourceLabel } or null if the plane is unknown.
// opts.ignoreGenerated is accepted for legacy callers and ignored.
// Delegates to `@partybuff/calendar-engine/planes.stateOf`, passing the
// engine's `positions` argument via `getPlanePositions()` (always `{}` —
// canon-only per #198). The wrapper-side `PLANE_DATA` table contributes
// the display-only enrichment (`note`, `sourceLabel`) that the engine
// doesn't carry.
export function getPlanarState(planeName, serial, _opts?){
  var plane = _getPlaneData(planeName);
  if (!plane) return null;
  // Engine plane keys are snake_case (e.g. "Dal Quor" → "dal_quor"), so map
  // spaces to underscores. Without this, multi-word planes throw "unknown
  // plane" in stateOf and silently fall back (no engine phase or lore).
  var key = String(plane.key || (plane.name || '').toLowerCase().replace(/\s+/g, '_'));

  try {
    var date = serialToCalendarDate(serial);
    var ps = enginePlanes.stateOf(key, date, getPlanePositions());
    var phaseDur = ps.phaseDuration;
    // Plane LORE (effects + note) is engine-sourced so edits in the engine
    // auto-bump to Roll20; the wrapper's PLANE_DATA contributes only
    // presentation/orbit metadata (name, color, orbitYears, associatedMoon).
    // `canonicalNote` is present on engine ≥0.39.0 — undefined-safe on older.
    var enginePlane: any = ps.plane || {};
    return {
      plane: Object.assign({}, plane, { effects: enginePlane.effects || null }),
      phase: ps.phase,
      phaseIndex: null,
      daysIntoPhase: phaseDur != null ? ps.daysIntoPhase : null,
      daysUntilNextPhase: phaseDur != null ? ps.daysUntilNextPhase : null,
      phaseDuration: phaseDur != null ? phaseDur : null,
      nextPhase: phaseDur != null ? ps.nextPhase : null,
      overridden: false,
      note: enginePlane.canonicalNote || '',
      sourceLabel: 'traditional'
    };
  } catch (_e){
    // Engine validation can throw on unknown plane keys (worlds without
    // planes) or invalid dates. Fall back to a safe inert shape so the
    // chat UI never crashes mid-render.
    return {
      plane: plane,
      phase: plane.fixedPhase || 'neutral',
      phaseIndex: null,
      daysIntoPhase: null,
      daysUntilNextPhase: null,
      phaseDuration: null,
      nextPhase: null,
      overridden: false,
      note: '',
      sourceLabel: 'traditional'
    };
  }
}

// ---------------------------------------------------------------------------
// 21e) Phase emoji and label helpers
// ---------------------------------------------------------------------------

export var PLANE_PHASE_EMOJI = {
  coterminous: '🟢',  // 🟢
  remote:      '🔴',  // 🔴
  neutral:     '⚪'          // ⚪
};

export var PLANE_PHASE_LABELS = {
  coterminous: 'Coterminous',
  remote:      'Remote',
  neutral:     'Neutral'
};

// Legacy stub: no generated events in the canon-only surface.
export function _isGeneratedNote(_note){
  return false;
}

// ---------------------------------------------------------------------------
// 21f) Notable planes for !cal default view
// ---------------------------------------------------------------------------

function _planarDaySpanTag(ps){
  if (!ps || ps.phaseDuration == null || ps.daysIntoPhase == null || ps.phaseDuration <= 1) return '';
  return ' <span style="opacity:.72;">(Day ' + (ps.daysIntoPhase + 1) + ' of ' + ps.phaseDuration + ')</span>';
}

function _planarInDaysLabel(days){
  var d = Math.max(0, days|0);
  if (d === 1) return 'tomorrow';
  return 'in ' + d + ' days';
}

// Returns array of HTML strings for planes worth mentioning today.
// Criteria: currently coterminous/remote, or transitioning within 2 days.
// Excludes: fixed planes. Active phases over 1 year are skipped (avoids
// noise from century-scale neutral spans), but upcoming transitions
// always surface regardless of current phase duration.
export function _planarNotableToday(serial){
  var planes = _getAllPlaneData();
  var notes  = [];
  var ypd    = _planarYearDays();

  for (var i = 0; i < planes.length; i++){
    if (planes[i].type === 'fixed') continue;
    var ps = getPlanarState(planes[i].name, serial);
    if (!ps) continue;

    var name = ps.plane.name;
    if (ps.phase === 'coterminous'){
      if (ps.phaseDuration != null && ps.phaseDuration > ypd) continue;
      notes.push((PLANE_PHASE_EMOJI.coterminous || '🟢') + ' <b>'+esc(name)+'</b> is ' + esc(PLANE_PHASE_LABELS.coterminous) + _planarDaySpanTag(ps));
    } else if (ps.phase === 'remote'){
      if (ps.phaseDuration != null && ps.phaseDuration > ypd) continue;
      notes.push((PLANE_PHASE_EMOJI.remote || '🔴') + ' <b>'+esc(name)+'</b> is ' + esc(PLANE_PHASE_LABELS.remote) + _planarDaySpanTag(ps));
    } else if (ps.phase === 'neutral' && ps.daysUntilNextPhase != null && ps.daysUntilNextPhase > 0 && ps.daysUntilNextPhase <= 2 && ps.nextPhase){
      if (ps.nextPhase === 'coterminous'){
        notes.push((PLANE_PHASE_EMOJI.coterminous || '🟢') + ' <b>'+esc(name)+'</b> ' + esc(PLANE_PHASE_LABELS.coterminous) + ' ' + _planarInDaysLabel(ps.daysUntilNextPhase));
      } else if (ps.nextPhase === 'remote'){
        notes.push((PLANE_PHASE_EMOJI.remote || '🔴') + ' <b>'+esc(name)+'</b> ' + esc(PLANE_PHASE_LABELS.remote) + ' ' + _planarInDaysLabel(ps.daysUntilNextPhase));
      }
    }
  }
  return notes;
}

// ---------------------------------------------------------------------------
// 21g) Mini-calendar event overlays
// ---------------------------------------------------------------------------

// Threshold for "short" vs "long" planar events.
// Events ≤ this many days get cell fills; longer events get header bars.
var PLANE_SHORT_EVENT_THRESHOLD = 28;

// generatedCutoffSerial parameter is retained for call-site compatibility but
// has no effect — there are no generated events to clip.
export function _planesMiniCalEvents(startSerial, endSerial, _generatedCutoffSerial?){
  var out = [];
  var planes = _getAllPlaneData();
  if (!planes || !planes.length) return out;

  var start = startSerial|0;
  var end = endSerial|0;
  if (end < start){ var t = start; start = end; end = t; }

  for (var ser = start; ser <= end; ser++){
    var fills = [];
    var tipCot = [];
    var tipRem = [];

    for (var j = 0; j < planes.length; j++){
      var plane = planes[j];
      var name = plane.name;
      var planeColor = plane.color || '#607D8B';
      var canon = getPlanarState(name, ser);
      if (canon && (canon.phase === 'coterminous' || canon.phase === 'remote')){
        var dur = canon.phaseDuration || 999;
        if (dur <= PLANE_SHORT_EVENT_THRESHOLD){
          fills.push({
            planeName: name,
            color: planeColor,
            phase: canon.phase,
            duration: dur
          });
        }
        if (canon.phase === 'coterminous') tipCot.push(name);
        else tipRem.push(name);
      }
    }

    fills.sort(function(a, b){ return a.duration - b.duration; });

    var tipParts = [];
    if (tipCot.length) tipParts.push('Coterminous:\n  • ' + tipCot.join('\n  • '));
    if (tipRem.length) tipParts.push('Remote:\n  • ' + tipRem.join('\n  • '));
    var tooltip = tipParts.join('\n');

    if (fills.length === 1){
      out.push({
        serial: ser,
        name: tooltip || (fills[0].planeName + ' ' + fills[0].phase),
        color: fills[0].color,
        isRemote: fills[0].phase === 'remote',
        planeFill: true
      });
    } else if (fills.length >= 2){
      out.push({
        serial: ser,
        name: tooltip || (fills[0].planeName + ' / ' + fills[1].planeName),
        color: fills[0].color,
        planeFill: true,
        isRemote: fills[0].phase === 'remote',
        splitColor: fills[1].color,
        splitIsRemote: fills[1].phase === 'remote'
      });
    }
  }

  return out;
}

// Compute header bars for long canonical planar events active during a month
// range. Returns array of { planeName, color, phase, tooltip }.
export function _planesHeaderBars(startSerial, endSerial){
  var bars = [];
  var planes = _getAllPlaneData();
  if (!planes || !planes.length) return bars;

  var mid = Math.floor((startSerial + endSerial) / 2);
  var seen = {};

  for (var j = 0; j < planes.length; j++){
    var plane = planes[j];
    var canon = getPlanarState(plane.name, mid);
    if (!canon) continue;
    if (canon.phase !== 'coterminous' && canon.phase !== 'remote') continue;
    var dur = canon.phaseDuration || 0;
    if (dur <= PLANE_SHORT_EVENT_THRESHOLD) continue;

    var key = plane.name + ':' + canon.phase;
    if (seen[key]) continue;
    seen[key] = true;

    var phaseLabel = (PLANE_PHASE_LABELS[canon.phase] || canon.phase).toLowerCase();
    var daysInto = canon.daysIntoPhase || 0;
    var daysLeft = canon.daysUntilNextPhase || 0;
    var totalDays = dur;
    var tipParts = [plane.name + ' ' + phaseLabel];

    var yearDays = _planarYearDays() || 336;
    if (totalDays > yearDays * 2){
      tipParts.push('~' + Math.round(totalDays / yearDays) + ' years total');
    } else if (totalDays > 56){
      tipParts.push('~' + Math.round(totalDays / 28) + ' months total');
    } else {
      tipParts.push(totalDays + ' days total');
    }
    if (daysInto > yearDays){
      tipParts.push('began ~' + Math.round(daysInto / yearDays) + ' years ago');
    } else if (daysInto > 56){
      tipParts.push('began ~' + Math.round(daysInto / 28) + ' months ago');
    } else {
      tipParts.push('began ' + daysInto + ' days ago');
    }
    if (daysLeft > yearDays){
      tipParts.push('ending in ~' + Math.round(daysLeft / yearDays) + ' years');
    } else if (daysLeft > 56){
      tipParts.push('ending in ~' + Math.round(daysLeft / 28) + ' months');
    } else {
      tipParts.push('ending in ' + daysLeft + ' days');
    }

    bars.push({
      planeName: plane.name,
      color: plane.color || '#607D8B',
      phase: canon.phase,
      label: plane.name + ' ' + titleCase(phaseLabel),
      tooltip: tipParts.join(', ')
    });
  }

  return bars;
}

// ---------------------------------------------------------------------------
// 21h) Today summary (compact one-liner for dashboards)
// ---------------------------------------------------------------------------

// _isGM and _viewHorizon are kept in the signature for back-compat with the
// caller in commands.ts. They no longer drive behaviour.
export function _planesTodaySummaryHtml(today, _isGM?, _viewTier?, _viewHorizon?){
  var planes = _getAllPlaneData();
  if (!planes || !planes.length) return '';
  var cot = 0, rem = 0;
  var next = null;
  for (var i = 0; i < planes.length; i++){
    var ps = getPlanarState(planes[i].name, today);
    if (!ps) continue;
    if (ps.phase === 'coterminous') cot++;
    if (ps.phase === 'remote') rem++;
    if (ps.daysUntilNextPhase != null && ps.nextPhase){
      var d = Math.max(0, ps.daysUntilNextPhase|0);
      if (!next || d < next.days){
        next = { days:d, plane:ps.plane.name, phase:PLANE_PHASE_LABELS[ps.nextPhase] || ps.nextPhase };
      }
    }
  }
  var bits = ['Coterminous '+cot, 'Remote '+rem];
  if (next) bits.push('Next: ' + next.plane + ' ' + next.phase + ' in ' + next.days + 'd');
  return '<div style="font-size:.8em;opacity:.72;margin:2px 0 6px 0;">'+esc(bits.join(' · '))+'</div>';
}

function _planarSummaryLines(today){
  var planes = _getAllPlaneData();
  var notes = [];
  for (var i = 0; i < planes.length; i++){
    if (planes[i].type === 'fixed') continue;
    var ps = getPlanarState(planes[i].name, today);
    if (!ps) continue;
    if (ps.phase === 'coterminous'){
      notes.push((PLANE_PHASE_EMOJI.coterminous || '🟢') + ' <b>' + esc(ps.plane.name) + '</b> is ' + esc(PLANE_PHASE_LABELS.coterminous) + _planarDaySpanTag(ps));
    } else if (ps.phase === 'remote'){
      notes.push((PLANE_PHASE_EMOJI.remote || '🔴') + ' <b>' + esc(ps.plane.name) + '</b> is ' + esc(PLANE_PHASE_LABELS.remote) + _planarDaySpanTag(ps));
    } else if (ps.phase === 'neutral' && ps.daysUntilNextPhase != null && ps.daysUntilNextPhase <= 2 && ps.nextPhase){
      if (ps.nextPhase === 'coterminous'){
        notes.push((PLANE_PHASE_EMOJI.coterminous || '🟢') + ' <b>' + esc(ps.plane.name) + '</b> ' + esc(PLANE_PHASE_LABELS.coterminous) + ' ' + _planarInDaysLabel(ps.daysUntilNextPhase));
      } else if (ps.nextPhase === 'remote'){
        notes.push((PLANE_PHASE_EMOJI.remote || '🔴') + ' <b>' + esc(ps.plane.name) + '</b> ' + esc(PLANE_PHASE_LABELS.remote) + ' ' + _planarInDaysLabel(ps.daysUntilNextPhase));
      }
    }
  }
  return notes;
}

export function planesSummaryHtml(_isGM?, serialOverride?){
  var st = ensureSettings();
  if (st.planesEnabled === false){
    return _menuBox('🌀 Planar Summary',
      '<div style="opacity:.7;">Planar system is disabled.</div>'
    );
  }

  var today = isFinite(serialOverride) ? (serialOverride|0) : todaySerial();
  var lines = _planarSummaryLines(today);
  var planeQueryOpts = _getAllPlaneData().map(function(p){ return p.name; }).join('|');
  var body = '<div style="font-weight:bold;margin:0 0 4px 0;">' + esc(formalDateLabelFromSerial(today)) + '</div>';
  body += _planesTodaySummaryHtml(today);
  if (lines.length){
    body += '<div style="font-size:.85em;line-height:1.6;">' + lines.join('<br>') + '</div>';
  } else {
    body += '<div style="font-size:.82em;opacity:.55;">No active planar phases today.</div>';
  }
  body += '<div style="margin-top:6px;">' +
    button('Full View', 'planes') + ' ' +
    button('Specific Plane', 'planes view ?{Select Plane|' + planeQueryOpts + '}') +
  '</div>';
  return _menuBox('🌀 Planar Summary — ' + esc(formalDateLabelFromSerial(today)), body);
}

// ---------------------------------------------------------------------------
// 21i) Panel HTML
// ---------------------------------------------------------------------------

// Returns an array of HTML parts to send as separate messages.
export function planesPanelHtml(isGM, serialOverride?){
  var st = ensureSettings();
  if (st.planesEnabled === false){
    return [_menuBox('🌀 Planes',
      '<div style="opacity:.7;">Planar system is disabled.</div>'+
      (isGM ? '<div style="margin-top:4px;font-size:.85em;">Enable: <code>!cal settings planes on</code></div>' : '')
    )];
  }

  var planes = _getAllPlaneData();
  var today  = isFinite(serialOverride) ? (serialOverride|0) : todaySerial();
  var dateLabel = dateLabelFromSerial(today);
  var displayMode = _normalizeDisplayMode(st.planesDisplayMode);
  var rows = [];
  var pr = _monthRangeFromSerial(today);
  var planesMiniEvents = _planesMiniCalEvents(pr.start, pr.end);
  var headerBars = _planesHeaderBars(pr.start, pr.end);
  var planesMiniCal = _renderSyntheticMiniCal('Planar Movement', pr.start, pr.end, planesMiniEvents, headerBars);
  var prevSer = _shiftSerialByMonth(today, -1);
  var nextSer = _shiftSerialByMonth(today, 1);
  var navRow = '<div style="margin:3px 0 6px 0;">'+
    button('◂ Prev Planar','planes on '+_serialToDateSpec(prevSer))+' '+
    button('Next Planar ▸','planes on '+_serialToDateSpec(nextSer))+
    '</div>';

  for (var i = 0; i < planes.length; i++){
    var ps = getPlanarState(planes[i].name, today);
    if (!ps) continue;

    var emoji = PLANE_PHASE_EMOJI[ps.phase] || '⚪';
    var label = PLANE_PHASE_LABELS[ps.phase] || ps.phase;
    var name  = ps.plane.name;
    var isNotable = (ps.phase === 'coterminous' || ps.phase === 'remote');
    var isFixed   = ps.plane.type === 'fixed';

    // Next transition (GM only, compact)
    var nextTag = '';
    if (isGM && ps.daysUntilNextPhase != null && ps.nextPhase){
      nextTag = ' <span style="opacity:.4;font-size:.8em;">' +
        esc(PLANE_PHASE_LABELS[ps.nextPhase] || ps.nextPhase) + ' in ' + ps.daysUntilNextPhase + 'd</span>';
    }

    // Fixed planes that aren't notable get skipped — nothing to say.
    if (isFixed && !isNotable) continue;

    // Compact line for neutral planes
    if (!isNotable){
      rows.push(
        '<div style="margin:1px 0;line-height:1.3;font-size:.9em;opacity:.65;">'+
          emoji+' <span style="min-width:78px;display:inline-block;">'+esc(name)+'</span> '+
          esc(label) + nextTag +
        '</div>'
      );
      continue;
    }

    // Notable planes — fuller line
    var durationTag = '';
    if (isNotable){
      var yearDays = _planarYearDays() || 336;
      var dParts = [];
      var dInto = ps.daysIntoPhase || 0;
      var dLeft = ps.daysUntilNextPhase || 0;
      if (dInto > 0){
        if (dInto > yearDays * 2) dParts.push(label.toLowerCase() + ' ~' + Math.round(dInto / yearDays) + ' years ago');
        else if (dInto > 56) dParts.push(label.toLowerCase() + ' ~' + Math.round(dInto / 28) + ' months ago');
        else dParts.push(label.toLowerCase() + ' ' + dInto + ' days ago');
      }
      if (dLeft > 0){
        if (dLeft > yearDays * 2) dParts.push('ending in ~' + Math.round(dLeft / yearDays) + ' years');
        else if (dLeft > 56) dParts.push('ending in ~' + Math.round(dLeft / 28) + ' months');
        else dParts.push('ending in ' + dLeft + ' days');
      }
      if (dParts.length){
        durationTag = ' <span style="font-size:.8em;opacity:.6;">(' + esc(dParts.join(', ')) + ')</span>';
      }
    }

    var effectHtml = '';
    if (ps.phase === 'coterminous' || ps.phase === 'remote'){
      var eff = (ps.plane.effects && ps.plane.effects[ps.phase]) || '';
      if (eff){
        effectHtml = '<div style="font-size:.78em;opacity:.55;margin-left:14px;margin-top:1px;">'+esc(eff)+'</div>';
      }
    }

    var noteHtml = '';
    if (ps.note && isGM){
      noteHtml = '<div style="font-size:.75em;opacity:.45;margin-left:14px;font-style:italic;">'+esc(ps.note)+'</div>';
    }

    rows.push(
      '<div style="margin:3px 0;line-height:1.4;">'+
        emoji+' <b style="min-width:82px;display:inline-block;">'+esc(name)+'</b>'+
        '<span style="opacity:.85;">'+esc(label)+'</span>'+
        durationTag + nextTag +
      '</div>'+
      effectHtml + noteHtml
    );
  }

  // GM controls — read-only display only, plus plane picker.
  var gmControls = '';
  if (isGM){
    var planeQueryOpts = planes.map(function(p){ return p.name; }).join('|');
    gmControls = '<div style="margin:4px 0;">' +
      button('Show Specific Plane', 'planes view ?{Select Plane|' + planeQueryOpts + '}') +
      '</div>' +
      '<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>' +
      '<div style="margin:4px 0;">' +
      button('Additional Ranges', buildAdditionalRangesCommand('planes ranges', today)) +
      '</div>' +
      '<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>' +
      '<div style="margin:4px 0;">' +
      button('Toggle Planar System','planes toggle') + ' ' +
      button('📋 Summary','planes summary') +
      '</div>';
  }

  // Build parts array
  var parts = [];
  if (displayMode !== 'list'){
    var calBody = navRow +
      _planesTodaySummaryHtml(today) +
      planesMiniCal +
      _legendLine(['Cell fill = short event', 'Hatched = remote']);
    parts.push(_menuBox('🌀 Planes — ' + esc(dateLabel), calBody));
  }
  if (displayMode !== 'calendar'){
    var listBody = (displayMode === 'list' ? navRow + _planesTodaySummaryHtml(today) : '') +
      rows.join('');
    parts.push(_menuBox(displayMode === 'list' ? '🌀 Planes — ' + esc(dateLabel) : '🌀 Planar Phases', listBody));
  }
  if (!parts.length){
    parts.push(_menuBox('🌀 Planes', '<div style="opacity:.7;">No planar display mode selected.</div>'));
  }

  if (gmControls){
    parts.push(_menuBox('🌀 GM Controls',
      gmControls +
      '<div style="margin-top:7px;">'+ button('⬅️ Back','show') +'</div>'
    ));
  } else {
    // Player-facing back-link
    var playerPlaneQueryOpts = planes.map(function(p){ return p.name; }).join('|');
    var playerControls = '<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>' +
      '<div style="margin:4px 0;">' + button('Show Specific Plane', 'planes view ?{Select Plane|' + playerPlaneQueryOpts + '}') + '</div>' +
      '<div style="margin-top:7px;">'+ button('⬅️ Back','show') +'</div>';
    var lastIdx = parts.length - 1;
    parts[lastIdx] = parts[lastIdx].replace(/<\/div>$/, '') + playerControls + '</div>';
  }

  return parts;
}

function _planesMonthCellHtml(wm){
  var month = getCal().months[wm.mi] || {};
  var start = toSerial(wm.y, wm.mi, 1);
  var end = toSerial(wm.y, wm.mi, month.days|0);
  var events = _planesMiniCalEvents(start, end);
  var bars = _planesHeaderBars(start, end);
  var miniCal = _renderSyntheticMiniCal(null, start, end, events, bars);
  return '<div style="display:inline-block;vertical-align:top;margin:4px;overflow:visible;">' + miniCal + '</div>';
}

// Returns a single HTML string for small ranges, or an ARRAY of HTML parts
// (one per month group) for year-scale ranges — see
// events.ts _chunkMonthsForDelivery / CALENDAR_RANGE_MAX_MONTHS_PER_MESSAGE.
// A full 12-month year rendered in one message runs ~300KB, well past
// Roll20's practical chat message size limit; _deliverAdditionalCalendarRange
// delivers array results as separate sequential sendChat calls.
function _planesRangeHtml(spec, _isGM){
  var months = spec.months || [];
  var chunks = _chunkMonthsForDelivery(months);
  var title = '🌀 Planes — ' + esc(spec.title || 'Range');
  var legend = _legendLine(['Cell fill = short event', 'Hatched = remote']);

  if (chunks.length <= 1){
    var calParts = months.map(_planesMonthCellHtml);
    var body = handoutWrap(calParts.join('')) + legend;
    return _menuBox(title, body);
  }

  var parts = [];
  for (var i = 0; i < chunks.length; i++){
    var chunkParts = chunks[i].map(_planesMonthCellHtml);
    var chunkBody = handoutWrap(chunkParts.join('')) + legend;
    parts.push(_menuBox(title + ' (' + (i + 1) + '/' + chunks.length + ')', chunkBody));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// 21k) Command handler (!cal planes ...) — read-only commands
// ---------------------------------------------------------------------------

export function handlePlanesCommand(m, args){
  // args[0]='planes', args[1]=subcommand
  var sub = String(args[1] || '').toLowerCase();
  var isGM = playerIsGM(m.playerid);

  // Temporary compatibility alias.
  if (sub === 'phases') sub = 'summary';

  if (sub === 'summary'){
    return whisper(m.who, planesSummaryHtml(isGM));
  }

  if (!sub || sub === 'show'){
    return whisperParts(m.who, planesPanelHtml(isGM));
  }

  // !cal planes on <dateSpec>  — inspect planar states on a specific day
  if (sub === 'on' || sub === 'date'){
    var dateToks = args.slice(2).map(function(t){ return String(t||'').trim(); }).filter(Boolean);
    var pref = parseDatePrefixForAdd(dateToks);
    if (!pref){
      return whisper(m.who, 'Usage: <code>!cal planes on &lt;dateSpec&gt;</code>');
    }
    var serialOn = toSerial(pref.year, pref.mHuman - 1, pref.day);
    return whisperParts(m.who, planesPanelHtml(isGM, serialOn));
  }

  // !cal planes view <PlaneName> — single-plane detail (player- and GM-safe)
  if (sub === 'view'){
    var viewNameRaw = String(args[2] || '').trim();
    var allPlanes = _getAllPlaneData();
    if (!viewNameRaw){
      var viewQueryOpts = allPlanes.map(function(p){ return p.name; }).join('|');
      return whisper(m.who, _menuBox('🌀 Plane Detail',
        '<div style="margin-bottom:4px;">'+button('Show Specific Plane', 'planes view ?{Select Plane|' + viewQueryOpts + '}')+'</div>'
      ));
    }
    var viewPlane = _getPlaneData(viewNameRaw);
    if (!viewPlane) return whisper(m.who, 'Unknown plane: <b>'+esc(viewNameRaw)+'</b>. Try <code>!cal planes view</code> for a list.');

    var viewToday = todaySerial();
    var viewPs = getPlanarState(viewPlane.name, viewToday);
    var viewEmoji = PLANE_PHASE_EMOJI[viewPs.phase] || '⚪';
    var viewLabel = PLANE_PHASE_LABELS[viewPs.phase] || viewPs.phase;

    var viewHtml = '<div style="margin:4px 0;">';
    viewHtml += '<div style="margin:3px 0;font-size:1.05em;">'+viewEmoji+' Currently: <b>'+esc(viewLabel)+'</b></div>';
    if (viewPs.daysUntilNextPhase != null && viewPs.nextPhase){
      viewHtml += '<div style="margin:2px 0;font-size:.88em;opacity:.7;">Next: '+
        esc(PLANE_PHASE_LABELS[viewPs.nextPhase] || viewPs.nextPhase)+' in '+viewPs.daysUntilNextPhase+'d</div>';
    }
    if (viewPs.plane.effects && viewPs.plane.effects[viewPs.phase]){
      viewHtml += '<div style="margin:4px 0;font-size:.85em;padding:3px 6px;background:rgba(255,255,255,.06);border-radius:3px;">'+
        '<b>Effects:</b> '+esc(viewPs.plane.effects[viewPs.phase])+'</div>';
    }
    if (viewPlane.title){
      viewHtml += '<div style="margin:3px 0;font-size:.85em;opacity:.6;font-style:italic;">'+esc(viewPlane.title)+'</div>';
    }
    if (viewPlane.associatedMoon){
      viewHtml += '<div style="margin:2px 0;font-size:.82em;opacity:.55;">Associated moon: <b>'+esc(viewPlane.associatedMoon)+'</b></div>';
    }
    if (viewPlane.type === 'cyclic' && viewPlane.orbitYears){
      viewHtml += '<div style="margin:2px 0;font-size:.82em;opacity:.55;">Orbit: '+viewPlane.orbitYears+' years</div>';
    } else if (viewPlane.type === 'fixed'){
      viewHtml += '<div style="margin:2px 0;font-size:.82em;opacity:.55;">Fixed phase (no natural orbit)</div>';
    }
    if (isGM && viewPs.note){
      viewHtml += '<div style="margin:4px 0;font-size:.78em;opacity:.45;font-style:italic;">'+esc(viewPs.note)+'</div>';
    }
    viewHtml += '</div>';

    return whisper(m.who, _menuBox('🌀 '+esc(viewPlane.name), viewHtml));
  }

  // Player commands stop here. The remaining subcommands are GM-only.
  if (!isGM){
    return whisper(m.who,
      'Planes: <code>!cal planes</code> &nbsp;·&nbsp; '+
      '<code>!cal planes on &lt;dateSpec&gt;</code>'
    );
  }

  if (sub === 'toggle'){
    var st = ensureSettings();
    st.planesEnabled = (st.planesEnabled === false);
    st._planesAutoToggle = false;
    return whisperParts(m.who, planesPanelHtml(true));
  }

  // !cal planes ranges <rangeArgs>  — Additional Ranges
  if (sub === 'ranges'){
    var rangeArgs = args.slice(2);
    return _deliverAdditionalCalendarRange({
      who: m.who,
      args: rangeArgs,
      dest: 'whisper',
      render: function(spec){ return _planesRangeHtml(spec, true); }
    });
  }

  whisper(m.who,
    'Planes: <code>!cal planes</code> &nbsp;·&nbsp; '+
    '<code>!cal planes summary</code> &nbsp;·&nbsp; '+
    '<code>!cal planes view &lt;name&gt;</code> &nbsp;·&nbsp; '+
    '<code>!cal planes on &lt;dateSpec&gt;</code> &nbsp;·&nbsp; '+
    '<code>!cal planes ranges &lt;rangeSpec&gt;</code> &nbsp;·&nbsp; '+
    '<code>!cal planes toggle</code>'
  );
}
