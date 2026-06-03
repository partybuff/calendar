// Today — Combined detail from all subsystems
import { CALENDAR_SYSTEMS, CONFIG_DEFAULTS } from './config.js';
import { COLOR_THEMES, SEASON_SETS, STYLES, script_name, state_name } from './constants.js';
import { _sourceAllowedForCalendar, applyCalendarSystem, applySeasonSet, defaults, ensureSettings, getAutoSuppressedSources, getCal, refreshAndSend, refreshCalendarState, resetToDefaults, sourceSuppressionState, titleCase } from './state.js';
import { handleTokenCommand } from './token.js';
import { colorsAPI } from './color.js';
import { _invalidateSerialCache, _isLeapMonth, fromSerial, toSerial, todaySerial } from './date-math.js';
import { DaySpec, Parse } from './parsing.js';
import { _deliverAdditionalCalendarRange, _deliverTopLevelCalendarRange, buildAdditionalRangesCommand, buildCalendarsHtmlForSpec, defaultKeyFor, eventDisplayName, mergeInNewDefaultEvents, occurrencesInRange } from './events.js';
import { button, clamp, esc, listAllEventsTableHtml, _monthRangeFromSerial, removeListHtml, removeMatchesListHtml, restoreDefaultEvents, suppressedDefaultsListHtml } from './rendering.js';
import { _displayMonthDayParts, _menuBox, _serialToDateSpec, _shiftSerialByMonth, activeEffectsPanelHtml, addEventSmart, addMonthlySmart, addYearlySmart, calendarSystemListHtml, currentDateLabel, formalCurrentDateLabel, helpCalendarSystemMenu, helpEventColorsMenu, helpRootMenu, helpSeasonsMenu, helpThemesMenu, nextForDayOnly, removeEvent, seasonSetListHtml, sendCurrentDate, setDate, stepDays, taskCardHtml, themeListHtml } from './ui.js';
import { _normalizePackedWords, _playerTodayHtml, _showDefaultCalView, runEventsShortcut, send, whisper, whisperUi } from './commands.js';
import { MOON_SYSTEMS, _getMoonSys, _moonPeakPhaseDay, _moonPhaseEmoji, _moonPhaseLabel, handleMoonCommand, invalidateMoonModel, moonEnsureSequences } from './moon.js';
import { _planarNotableToday, getPlanarState, _getAllPlaneData, handlePlanesCommand } from './planes.js';


// ── Today — Combined detail from all subsystems ────────────────────────

function _todayEventSummaryHtml(serial){
  try {
    var occ = occurrencesInRange(serial, serial);
    if (!occ.length){
      return '<div style="font-size:.82em;opacity:.6;margin-top:2px;">📅 No calendar events today.</div>';
    }
    var seenNames = {};
    var names = [];
    for (var oi = 0; oi < occ.length; oi++){
      var nm = eventDisplayName(occ[oi].e);
      var keyNm = String(nm || '').toLowerCase();
      if (!seenNames[keyNm]){
        seenNames[keyNm] = 1;
        names.push(nm);
      }
    }
    var shown = names.slice(0, 3).map(esc).join(', ');
    var more = names.length > 3 ? (' <span style="opacity:.65;">+' + (names.length - 3) + ' more</span>') : '';
    return '<div style="font-size:.82em;opacity:.75;margin-top:2px;">🎉 ' + shown + more + '</div>';
  } catch(eOcc){
    return '';
  }
}

export function _todayAllHtml(){
  var st = ensureSettings();
  var today = todaySerial();
  var cal = getCal(), c = cal.current;
  var lines = [];
  var sp = '<div style="height:6px;"></div>';

  // ── Minical (Events minical) ───────────────────────────────────────────
  try {
    var mr = _monthRangeFromSerial(today);
    var miniCalHtml = buildCalendarsHtmlForSpec({
      start: mr.start, end: mr.end,
      months: [{ y: mr.year, mi: mr.mi }],
      title: cal.months[mr.mi].name + ' ' + mr.year
    });
    lines.push(miniCalHtml);
  } catch(eMini){}

  // ── Text Info ──────────────────────────────────────────────────────────
  // Current Date
  lines.push('<div style="font-weight:bold;margin:3px 0;">' + esc(formalCurrentDateLabel()) + '</div>');

  lines.push(sp);

  // Events/Holidays
  var occNow = [];
  try { occNow = occurrencesInRange(today, today); } catch(e3){}
  var eventNames = [];
  var eventSeen = {};
  for (var oi = 0; oi < occNow.length; oi++){
    var nm = eventDisplayName(occNow[oi].e);
    var key = String(nm || '').toLowerCase();
    if (!eventSeen[key]){ eventSeen[key] = 1; eventNames.push(nm); }
  }
  if (eventNames.length){
    lines.push('<div style="font-size:.85em;margin:1px 0;">🎉 ' + eventNames.map(esc).join(', ') + '</div>');
  }

  lines.push(sp);

  // Moons: Ascendant, New, Full
  if (st.moonsEnabled !== false){
    try {
      moonEnsureSequences();
      var moonSys = _getMoonSys();
      if (moonSys && moonSys.moons){
        var newMoons = [], fullMoons = [];
        moonSys.moons.forEach(function(moon){
          var verdict = _moonPeakPhaseDay(moon.name, today);
          if (verdict === 'full') fullMoons.push(moon.name);
          else if (verdict === 'new') newMoons.push(moon.name);
        });
        var moonLines = [];
        if (newMoons.length) moonLines.push('\uD83C\uDF11 <b>New:</b> ' + newMoons.map(esc).join(', '));
        if (fullMoons.length) moonLines.push('\uD83C\uDF15 <b>Full:</b> ' + fullMoons.map(esc).join(', '));
        if (moonLines.length){
          lines.push('<div style="font-size:.82em;opacity:.8;line-height:1.5;">' + moonLines.join('<br>') + '</div>');
        }
      }
    } catch(e5){}
  }

  lines.push(sp);

  // Planes: Coterminous, Remote
  if (st.planesEnabled !== false){
    try {
      var allPlanes = _getAllPlaneData();
      var ypd = 336; // typical year days
      var coterminous = [], remote = [];
      for (var pi = 0; pi < allPlanes.length; pi++){
        if (allPlanes[pi].type === 'fixed') continue;
        var ps2 = getPlanarState(allPlanes[pi].name, today);
        if (!ps2) continue;
        if (ps2.phaseDuration != null && ps2.phaseDuration > ypd) continue;
        if (ps2.phase === 'coterminous') coterminous.push(ps2.plane.name);
        else if (ps2.phase === 'remote') remote.push(ps2.plane.name);
      }
      var planeLines = [];
      if (coterminous.length) planeLines.push('🔴 <b>Coterminous:</b> ' + coterminous.map(esc).join(', '));
      if (remote.length) planeLines.push('🔵 <b>Remote:</b> ' + remote.map(esc).join(', '));
      if (planeLines.length){
        lines.push('<div style="font-size:.82em;opacity:.8;line-height:1.5;">' + planeLines.join('<br>') + '</div>');
      }
    } catch(e6){}
  }

  // ── Buttons ────────────────────────────────────────────────────────────
  var btns = [];

  // Date step arrows
  btns.push('<div style="margin:3px 0;">' + button('Back','retreat 1') + ' ' + button('Forward','advance 1') + '</div>');

  // Send Today View to Players
  btns.push('<div style="margin:3px 0;">' + button('Send Today View to Players','send') + '</div>');

  // Subsystems dropdown
  btns.push('<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Subsystems', 'today options ?{Subsystem|Events,events|Moons,moon|Planes,planes}') +
    '</div>');

  // Management dropdown (GM only)
  btns.push('<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Management', 'today manage ?{Action|Enable/Disable Moons,moon toggle|Enable/Disable Planes,planes toggle|Theme,help themes|Calendar System,help calendarsystems|Hemisphere,help hemisphere|Season Set,help seasons|Reset Calendar,help resetconfirm}') +
    '</div>');

  return _menuBox('Today — ' + esc(_displayMonthDayParts(c.month, c.day_of_the_month).label),
    lines.join('') + btns.join(''));
}

export var USAGE = {
  'events.add':     'Usage: !cal add [MM DD [YYYY] | <MonthName> DD [YYYY] | DD] NAME [#COLOR|color] (DD may be an ordinal like 1st or fourteenth)',
  'events.remove':  'Usage: !cal remove [list | key <KEY> | series <KEY> | <name fragment>]',
  'events.restore': 'Usage: !cal restore [all] [exact] <name...> | restore key <KEY> | restore series <KEY>',
  'date.set':       'Usage: !cal set [MM] DD [YYYY] or !cal set <MonthName> DD [YYYY] (DD may be an ordinal like 1st or fourteenth)'
};

export function usage(key, m){ whisper(m.who, USAGE[key]); }

export function invokeEventSub(m, sub, args){
  var cfg = EVENT_SUB[sub];
  if (!cfg) return whisper(m.who, 'Unknown events subcommand. Try: add | addmonthly | addyearly | remove | restore | list');
  if (cfg.usage && (!args || args.length === 0)) return usage(cfg.usage, m);
  return cfg.run(m, args || []);
}

export var EVENT_SUB = {
  add: {
    usage: 'events.add',
    run: function(m, args){ addEventSmart(args); }
  },
  addmonthly: {
    usage: null,
    run: function(m, args){ addMonthlySmart(args); }
  },
  addyearly: {
    usage: null,
    run: function(m, args){ addYearlySmart(args); }
  },
  remove: {
    usage: 'events.remove',
    run: function(m, args){
      if (!args || !args.length) { whisper(m.who, removeListHtml()); return; }
      var sub = String(args[0]||'').toLowerCase();
      if (sub === 'list') {
        if (args.length === 1) { whisper(m.who, removeListHtml()); return; }
        return usage('events.remove', m);
      }
      if (sub === 'key' || sub === 'series') { removeEvent(args.join(' ')); return; }
      whisper(m.who, removeMatchesListHtml(args.join(' ')));
    }
  },
  restore: {
    usage: 'events.restore',
    run: function(m, args){
      if ((args[0] || '').toLowerCase() === 'list'){
        whisper(m.who, suppressedDefaultsListHtml());
        return;
      }
      restoreDefaultEvents(args.join(' '));
    }
  },
  list: {
    usage: null,
    run: function(m){ whisper(m.who, listAllEventsTableHtml()); }
  },
  source: {
    usage: null,
    run: function(m){ return commands.source.run(m, ['!cal', 'source', 'list']); }
  },
  panel: {
    usage: null,
    run: function(m, args){
      whisper(m.who, _eventsPanelHtml(args[0] || null));
    }
  },
  ranges: {
    usage: null,
    run: function(m, args){
      _deliverAdditionalCalendarRange({
        who: m.who,
        args: args,
        dest: 'whisper',
        render: _eventsRangeHtml
      });
    }
  },
  manage: {
    usage: null,
    run: function(m, args){
      // Route management sub-actions
      var action = (args[0] || '').toLowerCase();
      if (!action) return whisper(m.who, 'Management: use the dropdown to select an action.');
      // The dropdown routes to existing commands, so this is a fallback
      return invokeEventSub(m, action, args.slice(1));
    }
  }
};

// ── Events Panel ──────────────────────────────────────────────────────────
function _eventsPanelHtml(serialArg){
  var cal = getCal(), c = cal.current;
  var today = todaySerial();

  // Determine which month to display
  var displaySerial = today;
  if (serialArg){
    var parsed = parseInt(serialArg, 10);
    if (isFinite(parsed)) displaySerial = parsed;
  }
  var dd = fromSerial(displaySerial);
  var mobj = cal.months[dd.mi];
  if (!mobj) return '';

  var monthStart = toSerial(dd.year, dd.mi, 1);
  var monthEnd = toSerial(dd.year, dd.mi, mobj.days | 0);

  // Minical
  var spec = {
    start: monthStart,
    end: monthEnd,
    months: [{ y: dd.year, mi: dd.mi }],
    title: mobj.name + ' ' + dd.year
  };
  var calHtml = buildCalendarsHtmlForSpec(spec);

  // Text Info
  var lines = [];
  lines.push('<div style="font-weight:bold;margin:3px 0;"><b>Current Date:</b> ' + esc(currentDateLabel()) + '</div>');

  // Bulleted events only if displayed month is the current month
  if (dd.year === c.year && dd.mi === c.month){
    try {
      var occ = occurrencesInRange(today, today);
      if (occ.length){
        var seen = {};
        var evList = [];
        for (var i = 0; i < occ.length; i++){
          var nm = eventDisplayName(occ[i].e);
          var k = String(nm || '').toLowerCase();
          if (!seen[k]){ seen[k] = 1; evList.push(nm); }
        }
        lines.push('<ul style="margin:4px 0;padding-left:18px;">');
        for (var j = 0; j < evList.length; j++){
          lines.push('<li style="font-size:.85em;">' + esc(evList[j]) + '</li>');
        }
        lines.push('</ul>');
      }
    } catch(e0){}
  }

  // Buttons
  var prevSer = _shiftSerialByMonth(displaySerial, -1);
  var nextSer = _shiftSerialByMonth(displaySerial, 1);

  var btns = [];
  btns.push('<div style="margin:6px 0 3px 0;">');
  btns.push(button('Show Previous','events panel ' + prevSer) + ' ');
  btns.push(button('Show Next','events panel ' + nextSer));
  btns.push('</div>');
  btns.push('<div style="margin:3px 0;">' + button('Send to Players','send ' + mobj.name + ' ' + dd.year) + '</div>');

  // Additional Ranges
  btns.push('<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Additional Ranges', buildAdditionalRangesCommand('events ranges', displaySerial)) +
    '</div>');

  // Management (GM only)
  btns.push('<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Add Single Event','add ?{Date DD or MM DD or MM DD YYYY} ?{Event Name} ?{Color (hex)|#50C878}') +
    '</div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Add Monthly Event','addmonthly ?{Day DD} ?{Event Name} ?{Color (hex)|#50C878}') +
    '</div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Add Yearly Event','addyearly ?{Month MM} ?{Day DD} ?{Event Name} ?{Color (hex)|#50C878}') +
    '</div>');
  btns.push('<div style="border-top:1px solid rgba(0,0,0,.08);margin:6px 0 4px 0;"></div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Manage Event Sources','events source') +
    '</div>');
  btns.push('<div style="margin:3px 0;">' +
    button('Hide/Show Event','events list', { icon:'' }) +
    '</div>');

  return _menuBox('Events — ' + esc(mobj.name + ' ' + dd.year),
    calHtml + lines.join('') + btns.join(''));
}

function _eventsRangeHtml(spec){
  var rangeSpec = Object.assign({}, spec, { includeAdjacentStrips: false });
  return _menuBox('Events — ' + esc(spec.title || 'Range'),
    buildCalendarsHtmlForSpec(rangeSpec));
}

export var commands = {

  // ── Public ────────────────────────────────────────────────────────────────

  '': function(m, a){
    var restTokens = _normalizePackedWords(a.slice(1).join(' ')).split(/\s+/).filter(Boolean);
    if (!restTokens.length){
      _showDefaultCalView(m);
      return;
    }
    _deliverTopLevelCalendarRange({ who:m.who, args:restTokens, dest:'whisper' });
  },

  show: function(m, a){
    var restTokens = _normalizePackedWords(a.slice(2).join(' ')).split(/\s+/).filter(Boolean);
    if (!restTokens.length){
      _showDefaultCalView(m);
      return;
    }
    _deliverTopLevelCalendarRange({ who:m.who, args:restTokens, dest:'whisper' });
  },

  now: function(m){
    sendCurrentDate(m.who, false, { playerid:m.playerid, compact:true, includeButtons:false });
  },

  today: function(m, a){
    var sub = (a[2] || '').toLowerCase();
    // !cal today options <choice> — redirect from Additional Options dropdown
    if (sub === 'options'){
      var choice = (a[3] || '').toLowerCase();
      if (choice === 'events') return invokeEventSub(m, 'panel', []);
      if (choice === 'moon')   return handleMoonCommand(m, ['moon', 'summary']);
      if (choice === 'planes') return handlePlanesCommand(m, ['planes', 'summary']);
      if (choice === 'admin' || choice === 'help') return helpRootMenu(m);
      return helpRootMenu(m);
    }
    // !cal today manage <action> — GM-only Management dropdown
    if (sub === 'manage'){
      var mAction = (a[3] || '').toLowerCase();
      if (!mAction) return helpRootMenu(m);
      // Route management actions to their existing handlers
      var mRest = a.slice(3);
      return commands[mAction] ? (typeof commands[mAction] === 'function' ? commands[mAction](m, ['!cal'].concat(mRest)) : commands[mAction].run(m, ['!cal'].concat(mRest))) : helpRootMenu(m);
    }
    // Both GMs and players get the consolidated Today view.
    // sendCurrentDate handles audience-appropriate output internally.
    _showDefaultCalView(m);
  },

  // FIX: top-level !cal list now works
  list: function(m){ whisper(m.who, listAllEventsTableHtml()); },

  setup: function(m){
    whisperUi(m.who, 'Setup is already complete.');
  },

  // §10 cross-script setup token consumer. Pasted from the web app's
  // "Copy configuration token" affordance — applies world / date /
  // variant / palette / lunar anchors / planar anchors to the running
  // session in one shot. GM-only; handler does its own playerIsGM gate
  // since it reads msg.content directly (not the args-array path).
  token: function(m){
    handleTokenCommand(m);
  },

  effects: { gm:true, run:function(m){
    whisperUi(m.who, activeEffectsPanelHtml());
  }},

  help: function(m, a){
    var page = String(a[2]||'').toLowerCase();
    switch(page){
      case 'eventcolors': return helpEventColorsMenu(m);
      case 'calendar':    return helpCalendarSystemMenu(m);
      case 'themes':      return helpThemesMenu(m);
      case 'seasons':     return helpSeasonsMenu(m);
      case 'root':
      default:            return helpRootMenu(m);
    }
  },

  // ── GM Only ───────────────────────────────────────────────────────────────

  settings: { gm:true, run:function(m,a){
    var key = String(a[2]||'').toLowerCase();
    var val = String(a[3]||'').toLowerCase();
    var st = ensureSettings();
    function _settingsUsage(){
      return whisperUi(m.who,
        'Usage: <code>!cal settings (group|labels|events|moons|planes|offcycle|buttons) (on|off)</code><br>'+
        '<code>!cal settings density (compact|normal)</code> &nbsp;·&nbsp; '+
        '<code>!cal settings mode planes (calendar|list|both)</code><br>'+
        '<code>!cal settings verbosity (normal|minimal)</code>'
      );
    }
    if (!key){
      return _settingsUsage();
    }
    if (key === 'density'){
      if (!/^(compact|normal)$/.test(val)){
        return whisperUi(m.who,'Usage: <code>!cal settings density (compact|normal)</code>');
      }
      st.uiDensity = val;
      refreshAndSend();
      return whisperUi(m.who,'UI density set to <b>'+esc(val)+'</b>.');
    }
    if (key === 'verbosity'){
      if (!/^(normal|minimal)$/.test(val)){
        return whisperUi(m.who,'Usage: <code>!cal settings verbosity (normal|minimal)</code>');
      }
      st.subsystemVerbosity = val;
      refreshAndSend();
      return whisperUi(m.who,'Subsystem detail set to <b>'+esc(titleCase(val))+'</b>.');
    }
    if (key === 'mode'){
      var sysTok = String(a[3] || '').toLowerCase();
      var modeTok = String(a[4] || '').toLowerCase();
      if (!/^(planes|plane|planar)$/.test(sysTok) || !/^(calendar|list|both)$/.test(modeTok)){
        return whisperUi(m.who,'Usage: <code>!cal settings mode planes (calendar|list|both)</code>');
      }
      st.planesDisplayMode = modeTok;
      refreshAndSend();
      return whisperUi(m.who,'Display mode updated: <b>'+esc(titleCase(sysTok))+'</b> → <b>'+esc(titleCase(modeTok))+'</b>.');
    }
    if (!/^(group|labels|events|moons|planes|offcycle|buttons)$/.test(key) || !/^(on|off)$/.test(val)){
      return _settingsUsage();
    }
    if (key==='group')    st.groupEventsBySource = (val==='on');
    if (key==='labels')   st.showSourceLabels    = (val==='on');
    if (key==='events')   st.eventsEnabled       = (val==='on');
    if (key==='moons'){    st.moonsEnabled  = (val==='on'); st._moonsAutoToggle = false; }
    if (key==='planes'){  st.planesEnabled = (val==='on'); st._planesAutoToggle = false; }
    if (key==='offcycle') st.offCyclePlanes      = (val==='on');
    if (key==='buttons')  st.autoButtons         = (val==='on');
    refreshAndSend();
    whisperUi(m.who,'Setting updated.');
  }},

  events: { gm:true, run:function(m, a){
    var args = a.slice(2);
    var sub  = (args.shift() || 'panel').toLowerCase();
    return invokeEventSub(m, sub, args);
  }},

  add:     { gm:true, run:function(m,a){ runEventsShortcut(m, a, 'add'); } },
  remove:  { gm:true, run:function(m,a){
    var args = a.slice(2);
    if (!args.length) { whisper(m.who, removeListHtml()); return; }
    return invokeEventSub(m,'remove', args);
  }},
  restore: { gm:true, run:function(m,a){ runEventsShortcut(m, a, 'restore'); } },

  addmonthly: { gm:true, run:function(m,a){ addMonthlySmart(a.slice(2)); } },
  addyearly:  { gm:true, run:function(m,a){ addYearlySmart(a.slice(2)); } },
  addannual:  { gm:true, run:function(m,a){ addYearlySmart(a.slice(2)); } },

  send: { gm:true, run:function(m, a){
    var restTokens = _normalizePackedWords(a.slice(2).join(' ')).split(/\s+/).filter(Boolean);
    if (!restTokens.length){ sendCurrentDate(null, false, { playerid:m.playerid, includeButtons:false }); return; }
    _deliverTopLevelCalendarRange({ who:m.who, args:restTokens, dest:'broadcast' });
  }},

  advance: { gm:true, run:function(m,a){ stepDays( parseInt(a[2],10) || 1); } },
  retreat: { gm:true, run:function(m,a){ stepDays(-(parseInt(a[2],10) || 1)); } },

  set: { gm:true, run:function(m,a){
    var r = Parse.looseMDY(a.slice(2));
    if (!r){ return whisper(m.who, USAGE['date.set']); }
    var cal = getCal(), cur = cal.current, months = cal.months;
    if (r.kind === 'dayOnly'){
      var next = nextForDayOnly(cur, r.day, months.length);
      var d = clamp(r.day, 1, months[next.month].days|0);
      setDate(next.month+1, d, next.year);
      return;
    }
    var y  = (r.year != null) ? r.year : cur.year;
    // Guard: block setting the date to an inactive leap month.
    if (months[r.mi] && months[r.mi].leapEvery && !_isLeapMonth(months[r.mi], y)){
      return whisper(m.who,
        '<b>'+esc(months[r.mi].name)+'</b> only exists in leap years (every '+
        months[r.mi].leapEvery+' years). Year '+y+' is not a leap year.');
    }
    var d2 = clamp(r.day, 1, months[r.mi].days|0);
    setDate(r.mi+1, d2, y);
  }},

  theme: { gm:true, run:function(m, a){
    var sub = String(a[2]||'').toLowerCase();
    if (!sub || sub==='list'){ return whisper(m.who, themeListHtml()); }
    if (sub === 'reset' || sub === 'default'){
      ensureSettings().colorTheme = null;
      colorsAPI.reset();
      refreshAndSend();
      return whisper(m.who, 'Color theme reset to calendar default.');
    }
    if (!COLOR_THEMES[sub]) return whisper(m.who, 'Unknown theme. Try <code>!cal theme list</code>.');
    ensureSettings().colorTheme = sub;
    colorsAPI.reset();
    refreshAndSend();
    whisper(m.who, 'Color theme set to <b>'+esc(sub)+'</b>. Use <code>!cal theme reset</code> to return to calendar default.');
  }},

  calendar: { gm:true, run: function(m, a){
    var sysKey = (a[2]||'').toLowerCase();
    var varKey = (a[3]||'').toLowerCase();
    if (!sysKey || !CALENDAR_SYSTEMS[sysKey]){
      return whisper(m.who, calendarSystemListHtml());
    }
    var sys = CALENDAR_SYSTEMS[sysKey];
    if (varKey && !(sys.variants && sys.variants[varKey])){
      return whisper(m.who,
        'Unknown variant <b>'+esc(varKey)+'</b> for '+esc(sys.label||sysKey)+'. '+
        'Available: '+Object.keys(sys.variants||{}).join(', ')+'.');
    }
    var vk = varKey || sys.defaultVariant || 'standard';
    var variant = sys.variants && sys.variants[vk];
    // Reset manual theme override so variant default takes effect.
    ensureSettings().colorTheme = null;
    applyCalendarSystem(sysKey, vk);
    invalidateMoonModel(false);
    _invalidateSerialCache();
    refreshAndSend();
    var msg = 'Setting: <b>'+esc(sys.label||titleCase(sysKey))+'</b>';
    if (variant && (variant.label || '').trim()) msg += ' — '+esc(variant.label||titleCase(vk));
    if (variant && variant.description){
      msg += '.<br><span style="opacity:.78;">'+esc(variant.description)+'</span>';
    } else {
      msg += '.';
    }
    whisper(m.who, msg);
  }},

  seasons: { gm:true, run:function(m, a){
    var sub = String(a[2]||'').toLowerCase();
    if (!sub || sub==='list'){ return whisper(m.who, seasonSetListHtml()); }
    if (!SEASON_SETS[sub]) return whisper(m.who, 'Unknown variant. Options: '+Object.keys(SEASON_SETS).join(', ')+'.');
    if (!applySeasonSet(sub)){ return whisper(m.who, 'That season set doesn’t fit this calendar.'); }
    ensureSettings().seasonVariant = sub;
    refreshAndSend();
    whisper(m.who, 'Season variant: <b>'+esc(sub)+'</b>.');
  }},

  hemisphere: { gm:true, run:function(m, a){
    var sub = String(a[2]||'').toLowerCase();
    if (sub !== 'north' && sub !== 'south'){
      var st3 = ensureSettings();
      var cur = st3.hemisphere || CONFIG_DEFAULTS.hemisphere;
      var sv3 = st3.seasonVariant || CONFIG_DEFAULTS.seasonVariant;
      var entry3 = SEASON_SETS[sv3] || {};
      var aware = entry3.hemisphereAware ? 'yes' : 'no (current season set is not hemisphere-aware)';
      return whisper(m.who,
        'Current hemisphere: <b>'+esc(cur)+'</b>. Hemisphere-aware: '+aware+'.<br>'+
        button('North','hemisphere north')+' '+button('South','hemisphere south')
      );
    }
    var st4 = ensureSettings();
    st4.hemisphere = sub;
    // Re-apply the current season set so name arrays are shifted correctly.
    applySeasonSet(st4.seasonVariant || CONFIG_DEFAULTS.seasonVariant);
    refreshAndSend();
    whisper(m.who, 'Hemisphere: <b>'+esc(sub)+'</b>.');
  }},

  source: { gm:true, run: function(m, a){
    var args = a.slice(2).map(function(x){ return String(x).trim(); }).filter(Boolean);
    var sub = (args[0]||'').toLowerCase();
    var autoSuppressedSources = getAutoSuppressedSources();
    var tableStyle = STYLES.table + 'width:100%;max-width:100%;table-layout:auto;margin-right:0;';
    var thStyle = 'border:1px solid #444;padding:4px 6px;text-align:left;white-space:nowrap;';
    var tdStyle = 'border:1px solid #444;padding:4px 6px;vertical-align:middle;white-space:normal;';

    function sourceDefaultKeys(sourceKey){
      var key = String(sourceKey || '').trim().toLowerCase();
      var cal = getCal();
      var sysKey = ensureSettings().calendarSystem || CONFIG_DEFAULTS.calendarSystem;
      var lim = Math.max(1, cal.months.length);
      var out = [];
      defaults.events.forEach(function(de){
        var src = (de.source != null) ? String(de.source).toLowerCase() : null;
        if (src !== key) return;
        if (!_sourceAllowedForCalendar(src, sysKey)) return;
        var monthsList = (String(de.month).toLowerCase() === 'all')
          ? (function(){ var items = []; for (var i = 1; i <= lim; i++) items.push(i); return items; }())
          : [ clamp(parseInt(de.month, 10) || 1, 1, lim) ];
        monthsList.forEach(function(monthHuman){
          var monthObj = cal.months[monthHuman - 1];
          var maxD = monthObj ? (monthObj.days|0) : 28;
          out.push(defaultKeyFor(monthHuman, DaySpec.canonicalForKey(de.day, maxD), de.name));
        });
      });
      return out;
    }

    function sourceVisibility(key){
      var sup = state[state_name].suppressedDefaults || {};
      var defaultKeys = sourceDefaultKeys(key);
      var hidden = 0;
      defaultKeys.forEach(function(defKey){
        if (sup[defKey]) hidden++;
      });
      var total = defaultKeys.length;
      var shown = Math.max(0, total - hidden);
      var mode = 'shown';
      if (total && hidden >= total) mode = 'hidden';
      else if (hidden > 0) mode = 'mixed';
      return { total: total, hidden: hidden, shown: shown, mode: mode };
    }

    // Collect all known source keys → canonical display names.
    function allSources(){
      var cal = getCal(), seen = {};
      defaults.events.forEach(function(de){ if (de.source) seen[String(de.source).toLowerCase()] = String(de.source); });
      cal.events.forEach(function(e){ if (e.source) seen[String(e.source).toLowerCase()] = String(e.source); });
      return seen;
    }

    function listSources(){
      var seen  = allSources();
      var keys  = Object.keys(seen);
      if (!keys.length){ return whisper(m.who, '<div><b>Manage Event Sources</b></div><div style="opacity:.7;">No sources found.</div>'); }

      var pList = ensureSettings().eventSourcePriority;

      // Build display rows sorted by current priority rank, then alphabetically.
      function pRank(k){ var i=pList.indexOf(k); return i>=0 ? i : pList.length; }
      keys.sort(function(a,b){
        var rd = pRank(a) - pRank(b);
        return rd !== 0 ? rd : a.localeCompare(b);
      });

      // Filter out sources that are purely calendar-managed for another system.
      var displayKeys = keys.filter(function(k){
        var suppression = sourceSuppressionState(k);
        if (suppression.auto) return false;
        return sourceDefaultKeys(k).length > 0;
      });
      if (!displayKeys.length){
        return whisper(m.who, '<div><b>Manage Event Sources</b></div><div style="opacity:.7;">No sources are available for this calendar.</div>');
      }

      var head = '<tr>'+
        '<th style="'+thStyle+'">Source</th>'+
        '<th style="'+thStyle+'text-align:center;">Current Status</th>'+
        '<th style="'+thStyle+'text-align:center;">Move</th>'+
        '</tr>';

      var rows = displayKeys.map(function(k, i){
        var label    = titleCase(seen[k]);
        var stats = sourceVisibility(k);
        var upBtn    = i > 0
          ? button('↑', 'source up '   + label, {icon:''})
          : '';
        var downBtn  = i < displayKeys.length - 1
          ? button('↓', 'source down ' + label, {icon:''})
          : '';
        var statusCell = '';
        if (stats.mode === 'hidden'){
          statusCell = 'Hidden<br>' + button('Show', 'source enable ' + label, {icon:''});
        } else if (stats.mode === 'mixed'){
          statusCell = 'Partially Hidden<br><span style="opacity:.72;">' + stats.hidden + ' of ' + stats.total + ' hidden</span><br>' +
            button('Show All', 'source enable ' + label, {icon:''}) + ' ' +
            button('Hide All', 'source disable ' + label, {icon:''});
        } else {
          statusCell = 'Shown<br>' + button('Hide', 'source disable ' + label, {icon:''});
        }
        return '<tr>'+
          '<td style="'+tdStyle+'">'+esc(label)+'</td>'+
          '<td style="'+tdStyle+'text-align:center;white-space:nowrap;">'+statusCell+'</td>'+
          '<td style="'+tdStyle+'text-align:center;white-space:nowrap;">'+upBtn+(upBtn && downBtn ? ' ' : '')+downBtn+'</td>'+
          '</tr>';
      }).join('');

      whisper(m.who,
        '<div style="margin:4px 0;"><b>Manage Event Sources</b></div>'+
        '<div style="overflow-x:auto;max-width:100%;"><table style="'+tableStyle+'">'+head+rows+'</table></div>'+
        '<div style="font-size:.8em;opacity:.7;margin-top:4px;">'+
        'Order = priority. Top source sets cell color. Hide/show acts like a bulk toggle for each source&#39;s default events, and hidden entries still appear in the main hide/show list.'+
        '</div>'
      );
    }

    function movePriority(name, dir){
      var key  = String(name||'').toLowerCase();
      var seen = allSources();
      if (!key || !seen[key]){ whisper(m.who, 'Source not found: '+esc(name)); return; }
      var st   = ensureSettings();
      var pList= st.eventSourcePriority;
      var idx  = pList.indexOf(key);

      if (idx < 0){
        // Not yet ranked: add it. 'up' puts it at front; 'down' appends.
        if (dir === 'up')   pList.unshift(key);
        else                pList.push(key);
      } else {
        var swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= pList.length){ listSources(); return; }
        var tmp = pList[swap]; pList[swap] = pList[idx]; pList[idx] = tmp;
      }

      // Prune keys that no longer exist as sources.
      var knownKeys = Object.keys(seen);
      st.eventSourcePriority = pList.filter(function(k){ return knownKeys.indexOf(k) >= 0; });
      listSources();
    }

    function disableSource(name){
      var key = String(name||'').toLowerCase();
      if (!key){ whisper(m.who, 'Usage: <code>!cal source disable &lt;name&gt;</code>'); return; }
      var sourceKeys = sourceDefaultKeys(key);
      if (!sourceKeys.length){ whisper(m.who, 'Source not found: ' + esc(name)); return; }
      var sourceKeySet = {};
      var sup = state[state_name].suppressedDefaults || (state[state_name].suppressedDefaults = {});
      sourceKeys.forEach(function(defKey){
        sourceKeySet[defKey] = 1;
        sup[defKey] = 1;
      });
      var cal = getCal();
      cal.events = cal.events.filter(function(e){
        var src = (e.source != null) ? String(e.source).toLowerCase() : null;
        if (src !== key) return true;
        var maxD = cal.months[e.month-1].days|0;
        var norm = DaySpec.canonicalForKey(e.day, maxD);
        return !sourceKeySet[defaultKeyFor(e.month, norm, e.name)];
      });
      refreshCalendarState(true);
      sendChat(script_name, '/w gm Hidden "'+esc(name)+'" source events in the shared hide/show list.', null, { noarchive: true });
    }

    function enableSource(name){
      var key = String(name||'').toLowerCase();
      if (!key){ whisper(m.who, 'Usage: <code>!cal source enable &lt;name&gt;</code>'); return; }
      var sourceKeys = sourceDefaultKeys(key);
      if (!sourceKeys.length && !autoSuppressedSources[key]){ whisper(m.who, 'Source not found: ' + esc(name)); return; }
      var sup = state[state_name].suppressedDefaults || (state[state_name].suppressedDefaults = {});
      sourceKeys.forEach(function(defKey){
        delete sup[defKey];
      });
      mergeInNewDefaultEvents(getCal());
      refreshCalendarState(true);
      if (autoSuppressedSources[key]){
        sendChat(script_name, '/w gm Source "'+esc(name)+'" was shown again where allowed, but the current calendar still auto-suppresses that source.', null, { noarchive: true });
      } else {
        sendChat(script_name, '/w gm Shown "'+esc(name)+'" source events again.', null, { noarchive: true });
      }
    }

    if (!sub || sub==='list') return listSources();
    if (sub==='up')   { return movePriority(args.slice(1).join(' '), 'up'); }
    if (sub==='down') { return movePriority(args.slice(1).join(' '), 'down'); }
    if (sub==='disable'){ if (!args[1]) return whisper(m.who,'Usage: <code>!cal source disable &lt;name&gt;</code>'); return disableSource(args.slice(1).join(' ')); }
    if (sub==='enable'){  if (!args[1]) return whisper(m.who,'Usage: <code>!cal source enable &lt;name&gt;</code>');  return enableSource(args.slice(1).join(' ')); }
    whisper(m.who, 'Usage: <code>!cal source [list|up|down|disable|enable] [&lt;name&gt;]</code>');
  }},

  resetcalendar: { gm:true, run:function(){ resetToDefaults(); } },

  // Moon system
  lunar:  function(m, a){ handleMoonCommand(m, ['moon'].concat(a.slice(2))); }, // alias
  moon:    function(m, a){ handleMoonCommand(m, a.slice(1)); },   // mixed: players=view, GM=edit

  // Planar system — parallel to moons
  planar: function(m, a){ handlePlanesCommand(m, ['planes'].concat(a.slice(2))); }, // alias
  planes:  function(m, a){ handlePlanesCommand(m, a.slice(1)); }
};
