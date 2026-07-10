// Section 17: Commands & Routing
import { script_name } from './constants.js';
import { ensureSettings, getCal } from './state.js';
import { todaySerial } from './date-math.js';
import { eventDisplayName, occurrencesInRange } from './events.js';
import { button, esc } from './rendering.js';
import { _displayMonthDayParts, _menuBox, currentDateLabel, sendCurrentDate, taskCardHtml } from './ui.js';
import { _getMoonSys, _moonPeakPhaseDay, moonEnsureSequences } from './moon.js';
import { _planesTodaySummaryHtml } from './planes.js';
import { whisper } from './messaging.js';
export { send, sendToAll, sendToAllParts, sendToGM, sendUi, sendUiToAll, sendUiToGM, whisper, whisperParts, whisperUi, warnGM, warnGMUi, cleanWho } from './messaging.js';


/* ============================================================================
 * 17) COMMANDS & ROUTING
 * ==========================================================================*/

export function _normalizePackedWords(q){
  return String(q||'')
    .replace(/\b(nextmonth)\b/gi, 'next month')
    .replace(/\b(nextyear)\b/gi, 'next year')
    .replace(/\b(currentmonth|thismonth)\b/gi, 'month')
    .replace(/\b(thisyear)\b/gi, 'year')
    .replace(/\b(lastmonth)\b/gi, 'last month')
    .replace(/\b(lastyear)\b/gi, 'last year')
    .replace(/\b(previousmonth|prevmonth)\b/gi, 'previous month')
    .replace(/\b(previousyear|prevyear)\b/gi, 'previous year')
    .replace(/\b(next[-_]month)\b/gi,'next month')
    .replace(/\b(next[-_]year)\b/gi,'next year')
    .trim();
}

// Default !cal entrypoint routing:
// events minical first (if enabled), then other enabled subsystems.
export function _showDefaultCalView(m){
  moonEnsureSequences();
  sendCurrentDate(m.who, false, { playerid:m.playerid, dashboard:true, includeButtons:true });
}

export function _playerTodayHtml(playerid){
  var st = ensureSettings();
  var today = todaySerial();
  var cal = getCal();
  var c = cal.current;
  var sections = [];
  var promptDate = String(cal.months[c.month].name || '') + ' ' + c.day_of_the_month + ' ' + c.year;

  var occNow = [];
  try { occNow = occurrencesInRange(today, today); } catch(e0){}
  var eventNames = [];
  var eventSeen = {};
  for (var oi0 = 0; oi0 < occNow.length; oi0++){
    var nm0 = eventDisplayName(occNow[oi0].e);
    var key0 = String(nm0 || '').toLowerCase();
    if (!eventSeen[key0]){
      eventSeen[key0] = 1;
      eventNames.push(nm0);
    }
  }

  sections.push(taskCardHtml(
    'Date',
    '<b>' + esc(currentDateLabel()) + '</b>',
    [
      button('Calendar','show month')
    ]
  ));

  sections.push(taskCardHtml(
    'Events Today',
    eventNames.length
      ? 'Today includes <b>' + eventNames.slice(0, 3).map(esc).join(', ') + '</b>' + (eventNames.length > 3 ? ' <span style="opacity:.7;">+' + (eventNames.length - 3) + ' more</span>' : '') + '.'
      : 'No calendar events are scheduled for today.',
    [
      button('Show Month','show month')
    ]
  ));

  var moonSummary = 'Lunar tracking is currently off.';
  if (st.moonsEnabled !== false){
    try {
      moonEnsureSequences();
      var moonBitsCard = [];
      var moonSysCard = _getMoonSys();
      ((moonSysCard && moonSysCard.moons) || []).forEach(function(moon){
        var peakType = _moonPeakPhaseDay(moon.name, today);
        if (peakType === 'full') moonBitsCard.push(moon.name + ' full');
        else if (peakType === 'new') moonBitsCard.push(moon.name + ' new');
      });
      moonSummary = moonBitsCard.length ? esc(moonBitsCard.join(' · ')) + '.' : 'No moons are at full or new today.';
    } catch(e2){
      moonSummary = 'Moon data is not available right now.';
    }
  }
  sections.push(taskCardHtml(
    'Moons',
    moonSummary,
    [
      button('Detail','moon'),
      button('Prompt !cal moon on','moon on ?{Date|' + promptDate + '}')
    ]
  ));

  var planeSummary = 'Planar tracking is currently off.';
  if (st.planesEnabled !== false){
    try {
      planeSummary = _planesTodaySummaryHtml(today, false);
    } catch(e3){
      planeSummary = 'Planar data is not available right now.';
    }
  }
  sections.push(taskCardHtml(
    'Planes',
    planeSummary,
    [
      button('Detail','planes'),
      button('Prompt !cal planes on','planes on ?{Date|' + promptDate + '}')
    ]
  ));

  return _menuBox('Today — ' + esc(_displayMonthDayParts(c.month, c.day_of_the_month).label), sections.join(''));
}
