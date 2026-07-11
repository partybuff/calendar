// Setup gate — first-run welcome and post-paint state for the
// per-world default factory.
//
// The pre-revision wrapper carried a 9-step setup wizard that asked
// the GM about variant, season model, hemisphere, color theme,
// default events, lunar tracking, planar tracking, and per-world
// extras. That all lived here and across setup.ts / state.ts / ui.ts.
//
// The §10 token revision (ENGINE_CONTRACT.md, partybuff/calendar#146)
// retired in-script customization in favor of "configure on the web,
// paste a token in Roll20." This file now hosts only:
//
//   - the one-step Welcome ("pick a world, that's it")
//   - the post-pick informational chain ("use !cal to start, dismiss
//     by wiping state, customize via web tokens")
//   - the setup-gate dispatcher that routes pre-init messages to the
//     welcome or the player-waiting-room message
//   - the boot-ready summary for already-initialized campaigns
//
// Per-world defaults: when a world is picked, applyCalendarSystem
// installs its canonical variant, palette, seasons, and pack-event
// list — no further questions. Tokens (PR §10) replay setup later.

import { CALENDAR_SYSTEMS } from './config.js';
import { state_name } from './constants.js';
import { cleanWho, sendUiToGM, whisperUi } from './messaging.js';
import { button, esc } from './rendering.js';
import { applyCalendarSystem, checkInstall, ensureSettings, getCal, getSetupState, setupIsComplete } from './state.js';
import { currentDateLabel, dateLabelFromSerial } from './ui.js';
import { toSerial } from './date-math.js';
import { WORLD_ORDER, WORLDS } from './worlds/index.js';

/** URL surfaced on first-pick so the GM can find the web-side
 *  configuration UI. Update via env / build flag when the site moves;
 *  for now this lives as a static string inside the script. */
const LEARN_MORE_URL = 'https://partybuff.com/calendar';

function _menu(title: string, body: string): string {
  return '<div style="border:1px solid #555;border-radius:4px;padding:6px;margin:6px 0;">' +
    '<div style="font-style:italic;margin-bottom:4px;">' + esc(title) + '</div>' +
    '<div>' + body + '</div>' +
    '</div>';
}

function _welcomeHtml(): string {
  const rows = WORLD_ORDER.map((sysKey) => {
    const world = WORLDS[sysKey];
    const label = world ? world.label : sysKey;
    const desc = world ? world.description : '';
    return '<div style="margin:3px 0 8px;">' +
      button(label, 'setup pick ' + sysKey) +
      (desc ? '<br><span style="opacity:.68;font-size:.82em;">' + esc(desc) + '</span>' : '') +
      '</div>';
  }).join('');
  return _menu(
    "Welcome to Party Buff's Roll20 Calendar",
    '<div style="margin-bottom:6px;">Select a calendar to get started.</div>' + rows,
  );
}

function _waitingForGMHtml(): string {
  return _menu(
    'Calendar',
    '<div style="opacity:.78;">Calendar is waiting for the GM to finish setup. Please check back in once initialization is complete.</div>',
  );
}

function _postPickHelpHtml(worldLabel: string): string {
  return _menu(
    "You've chosen " + worldLabel,
    '<div>Use <code>!cal</code> to get started — everything else can be done with buttons in the chat window.</div>',
  );
}

function _resetHintHtml(): string {
  return _menu(
    'Reset hint',
    '<div>If you wish to see this setup again, you\'ll need to wipe state with <code>!cal resetcalendar</code>.</div>',
  );
}

function _tokenHintHtml(): string {
  return _menu(
    'Customization',
    '<div>There are a lot of customization options available for this calendar, but they\'re difficult to manage from within the Roll20 chat interface. Instead, you can use a unique token to tell the calendar what to load.</div>',
  );
}

function _learnMoreHtml(): string {
  return _menu(
    'Learn more',
    '<div>If you\'re interested, head to <a href="' + esc(LEARN_MORE_URL) + '">' + esc(LEARN_MORE_URL) + '</a> to learn more.</div>',
  );
}

function _bootSummaryHtml(calLabel: string): string {
  const cal = getCal();
  const cur = cal.current;
  const dateLine = dateLabelFromSerial(toSerial(cur.year, cur.month, cur.day_of_the_month));
  return '<div style="border:1px solid #555;border-radius:4px;padding:6px;margin:6px 0;">' +
    '<div style="font-style:italic;margin-bottom:4px;">' + esc(calLabel) + ' Initialized</div>' +
    '<div style="opacity:.85;">Current date: <b>' + esc(dateLine) + '</b></div>' +
    '<div style="margin-top:6px;">Use <code>!cal</code> to start. Use <code>!cal help</code> for the command list.</div>' +
    '</div>';
}

/** Boot-side summary fired by `init.ts` after `checkInstall`. For
 *  already-complete campaigns, a GM-only "calendar's up" whisper — Roll20
 *  restarts sandboxes often, and `!cal send` is the only public broadcast
 *  surface (CLAUDE.md), so this must never go to the whole table. For
 *  uninitialized campaigns, the welcome whisper. For dismissed
 *  campaigns, silence (the GM said "not now"). */
export function notifySetupStatusOnReady() {
  if (setupIsComplete()) {
    const st = ensureSettings();
    const sys: any = CALENDAR_SYSTEMS[st.calendarSystem] || {};
    const variant: any = ((sys.variants || {})[st.calendarVariant]) || {};
    const calLabel = String(variant.label || sys.label || 'Calendar');
    sendUiToGM(_bootSummaryHtml(calLabel));
    return;
  }
  const setup = getSetupState();
  if (setup.status === 'dismissed') return;
  sendUiToGM(_welcomeHtml());
}

function _applyWorldPick(msg: any, sysKey: string): void {
  const sys: any = CALENDAR_SYSTEMS[sysKey];
  if (!sys) {
    whisperUi(
      cleanWho(msg.who),
      _menu('Welcome', '<div>Unknown world "' + esc(sysKey) + '". Pick one of the offered options.</div>'),
    );
    return;
  }
  const variantKey = String(sys.defaultVariant || Object.keys(sys.variants || {})[0] || 'standard').toLowerCase();

  // Reset state to a clean baseline before applying the world. The
  // legacy multi-step wizard interleaved partial writes here; the new
  // flow is a single atomic switch. checkInstall() lays down the
  // default calendar shell (months, weekdays, events) on top of the
  // wiped state so applyCalendarSystem has something to mutate.
  delete (state as any)[state_name];
  (state as any)[state_name] = {
    setup: { status: 'complete' },
  };
  ensureSettings();
  checkInstall();

  applyCalendarSystem(sysKey, variantKey);
  const st = ensureSettings();
  st.calendarSystem = sysKey;
  st.calendarVariant = variantKey;
  // colorTheme = null falls back to the variant's default at render time;
  // GMs override via web → token, not via !cal commands.
  st.colorTheme = null;

  const worldEntry: any = WORLDS[sysKey];
  const worldLabel = worldEntry ? worldEntry.label : sysKey;

  // Post-pick chain. Whispered to the GM as five separate cards so
  // each tip stands on its own — the GM can scroll back to find any
  // one of them without a stacked-block layout.
  const who = cleanWho(msg.who);
  whisperUi(who, _postPickHelpHtml(worldLabel));
  whisperUi(who, _resetHintHtml());
  whisperUi(who, _tokenHintHtml());
  whisperUi(who, _learnMoreHtml());
}

export function maybeHandleSetupGate(msg: any, args: any[]): boolean {
  if (setupIsComplete()) return false;
  if (typeof playerIsGM === 'function' && !playerIsGM(msg.playerid)) {
    whisperUi(cleanWho(msg.who), _waitingForGMHtml());
    return true;
  }

  const sub = String(args[1] || '').toLowerCase();

  // `!cal setup …` — explicit setup sub-commands. Only `pick` and
  // `dismiss` matter post-revision; anything else falls through to the
  // welcome screen so a GM exploring legacy `!cal setup calendar/...`
  // commands gets re-oriented to the new flow.
  if (sub === 'setup') {
    const action = String(args[2] || '').toLowerCase();
    if (action === 'pick') {
      const sysKey = String(args[3] || '').toLowerCase();
      _applyWorldPick(msg, sysKey);
      return true;
    }
    if (action === 'dismiss' || action === 'later') {
      getSetupState().status = 'dismissed';
      whisperUi(cleanWho(msg.who), 'No problem! Just call !cal at any time to begin the process.');
      return true;
    }
    // Any other / no action → show welcome.
    whisperUi(cleanWho(msg.who), _welcomeHtml());
    return true;
  }

  // Any other `!cal <something>` before setup is complete → welcome.
  whisperUi(cleanWho(msg.who), _welcomeHtml());
  return true;
}
