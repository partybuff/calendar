// Section: Cross-script setup token.
//
// Implements the §10 token format from ENGINE_CONTRACT.md. The web app
// (`@partybuff/party-buff`) emits a base64-encoded JSON payload via a
// "Copy configuration token" affordance in its calendar settings; the
// GM pastes it into Roll20 with `!cal token <paste>` to apply the
// same world / date / variant / palette / lunar anchors / planar
// anchors to a running session.
//
// The token carries setup only — never campaign content. Custom
// events, notes, weather, and forecast gating stay on the web. See
// ENGINE_CONTRACT.md §10 for the full wire format and validation
// rules.
//
// PR 1 scope (this file): decode + validate + apply to the existing
// `state.PartyBuffCalendar` shape. World, date, variant and palette
// are applied via the existing helpers (`applyCalendarSystem`,
// `setDate`, `ensureSettings`). Lunar and planar anchors are persisted
// into a dedicated `imported` slot so the next PR (engine consumption)
// can pass them through to the engine without losing data. They have
// no visible effect yet — that lands when moon.ts and planes.ts
// switch to engine calls.

import { CALENDAR_SYSTEMS } from './config.js';
import { state_name } from './constants.js';
import { cleanWho, whisper, whisperUi } from './messaging.js';
import { applyCalendarSystem, ensureSettings, getCal } from './state.js';
import { _menuBox, currentDateLabel, setDate } from './ui.js';
import { esc } from './rendering.js';

interface MoonAnchor {
  year: number;
  monthIndex: number;
  day: number;
  phase: 'full' | 'new';
  hour?: number;
}

interface Token {
  v: 1;
  world: string;
  date:
    | { kind: 'month'; year: number; monthIndex: number; day: number }
    | { kind: 'intercalary'; year: number; intercalaryKey: string; day: number };
  variant?: string;
  palette?: string;
  lunarAnchors?: Record<string, MoonAnchor>;
  planarAnchors?: Record<string, number>;
}

export const TOKEN_SCHEMA_VERSION = 1;

/** Supported world ids — must mirror the engine's WorldId union. Used
 *  for token world-validation. */
const SUPPORTED_WORLDS: ReadonlySet<string> = new Set([
  'eberron', 'faerun', 'greyhawk', 'dragonlance',
  'exandria', 'mystara', 'birthright', 'gregorian',
]);

/** Strip any wrapping whitespace and Roll20's chat-injected zero-width
 *  characters. A pasted token can pick up surrounding spaces, an
 *  errant newline, or Roll20's whisper-thread invisible markers, and
 *  any of those will break base64 decode. */
function _sanitizeRawToken(raw: string): string {
  return String(raw || '')
    .replace(/\s+/g, '')
    .replace(/[​-‍﻿]/g, '');
}

/** UTF-8-safe base64 decode for browser-emitted tokens — atob alone
 *  returns Latin1 codepoints and butchers any non-ASCII glyph in the
 *  payload. Mirrors the producer's `btoa(unescape(encodeURIComponent(json)))`
 *  encode. The decodeURIComponent path is the canonical inverse. */
function _decodeBase64Utf8(encoded: string): string {
  const raw = atob(encoded);
  // The escape/decodeURIComponent dance converts the Latin1 bytes back
  // into a UTF-8 string. `escape` is deprecated but its semantics here
  // are exactly what we want — it's the documented inverse of the
  // producer's `unescape`.
  // eslint-disable-next-line @typescript-eslint/no-deprecated, no-deprecated-api
  return decodeURIComponent((globalThis as any).escape(raw));
}

export type ParseResult =
  | { ok: true; token: Token }
  | { ok: false; error: string };

/** Decode + structurally validate a token. Does not check world-
 *  specific bounds (date range, known moon/plane keys for the world);
 *  those checks need engine-resolved world data and run in the apply
 *  step. */
export function parseToken(raw: string): ParseResult {
  const sanitized = _sanitizeRawToken(raw);
  if (!sanitized) {
    return { ok: false, error: 'Token is empty.' };
  }

  let json: string;
  try {
    json = _decodeBase64Utf8(sanitized);
  } catch (_e) {
    return { ok: false, error: 'Token is not valid base64.' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch (_e) {
    return { ok: false, error: 'Token payload is not valid JSON.' };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Token payload is not an object.' };
  }
  const p = payload as Record<string, unknown>;

  // v: schema version. Reject newer-than-supported with the §10.5
  // forward-compat error.
  if (typeof p.v !== 'number' || !Number.isInteger(p.v)) {
    return { ok: false, error: "Token is missing a schema version ('v')." };
  }
  if (p.v > TOKEN_SCHEMA_VERSION) {
    return { ok: false, error: 'This token requires a newer version of the Roll20 calendar. Update the script.' };
  }

  // world
  if (typeof p.world !== 'string' || !SUPPORTED_WORLDS.has(p.world)) {
    return { ok: false, error: `Unknown world "${String(p.world)}".` };
  }

  // date — discriminated union check
  const date = p.date as unknown;
  if (!date || typeof date !== 'object') {
    return { ok: false, error: 'Token is missing a date.' };
  }
  const d = date as Record<string, unknown>;
  if (d.kind !== 'month' && d.kind !== 'intercalary') {
    return { ok: false, error: `Token date has unknown kind "${String(d.kind)}".` };
  }
  if (typeof d.year !== 'number' || !Number.isInteger(d.year)) {
    return { ok: false, error: 'Token date has a non-integer year.' };
  }
  if (typeof d.day !== 'number' || !Number.isInteger(d.day) || d.day < 1) {
    return { ok: false, error: 'Token date has a non-positive-integer day.' };
  }
  if (d.kind === 'month') {
    if (typeof d.monthIndex !== 'number' || !Number.isInteger(d.monthIndex) || d.monthIndex < 0) {
      return { ok: false, error: 'Token date has a bad monthIndex.' };
    }
  } else {
    if (typeof d.intercalaryKey !== 'string' || !d.intercalaryKey) {
      return { ok: false, error: 'Token date is intercalary but missing intercalaryKey.' };
    }
  }

  // variant — optional string
  if (p.variant !== undefined && typeof p.variant !== 'string') {
    return { ok: false, error: 'Token variant must be a string.' };
  }

  // palette — optional string
  if (p.palette !== undefined && typeof p.palette !== 'string') {
    return { ok: false, error: 'Token palette must be a string.' };
  }

  // lunarAnchors — optional record of {year, monthIndex, day, phase}
  if (p.lunarAnchors !== undefined) {
    if (!p.lunarAnchors || typeof p.lunarAnchors !== 'object') {
      return { ok: false, error: 'Token lunarAnchors must be an object.' };
    }
    for (const [moonKey, entry] of Object.entries(p.lunarAnchors as Record<string, unknown>)) {
      if (!moonKey) return { ok: false, error: 'lunarAnchors has an empty moon key.' };
      if (!entry || typeof entry !== 'object') {
        return { ok: false, error: `lunarAnchors.${moonKey} is not an object.` };
      }
      const a = entry as Record<string, unknown>;
      if (a.phase !== 'full' && a.phase !== 'new') {
        return { ok: false, error: `lunarAnchors.${moonKey}.phase must be 'full' or 'new'.` };
      }
      if (typeof a.year !== 'number' || !Number.isInteger(a.year)) {
        return { ok: false, error: `lunarAnchors.${moonKey}.year must be an integer.` };
      }
      if (typeof a.monthIndex !== 'number' || !Number.isInteger(a.monthIndex) || a.monthIndex < 0) {
        return { ok: false, error: `lunarAnchors.${moonKey}.monthIndex must be a non-negative integer.` };
      }
      if (typeof a.day !== 'number' || !Number.isInteger(a.day) || a.day < 1) {
        return { ok: false, error: `lunarAnchors.${moonKey}.day must be a positive integer.` };
      }
      if (a.hour !== undefined && (typeof a.hour !== 'number' || !Number.isInteger(a.hour))) {
        return { ok: false, error: `lunarAnchors.${moonKey}.hour must be an integer.` };
      }
    }
  }

  // planarAnchors — optional record of integer offsets. Planes are
  // Eberron-only; non-Eberron tokens with a non-empty planarAnchors
  // are rejected per §10.2.9.
  if (p.planarAnchors !== undefined) {
    if (!p.planarAnchors || typeof p.planarAnchors !== 'object') {
      return { ok: false, error: 'Token planarAnchors must be an object.' };
    }
    const planarEntries = Object.entries(p.planarAnchors as Record<string, unknown>);
    if (planarEntries.length > 0 && p.world !== 'eberron') {
      return { ok: false, error: 'planarAnchors is only valid for Eberron tokens.' };
    }
    for (const [planeKey, value] of planarEntries) {
      if (!planeKey) return { ok: false, error: 'planarAnchors has an empty plane key.' };
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return { ok: false, error: `planarAnchors.${planeKey} must be an integer day offset.` };
      }
    }
  }

  return { ok: true, token: payload as Token };
}

interface ApplyResult {
  applied: true;
  previousDateLabel: string;
  newDateLabel: string;
  dateChanged: boolean;
}

/** Apply a parsed token to `state.PartyBuffCalendar`. Snapshots the
 *  previous current-date label first so the §10.3 confirmation can
 *  point the GM at it if they want to set it back.
 *
 *  Anchors (lunar + planar) land in `state.PartyBuffCalendar.imported`.
 *  PR 2 wires them into the engine moon/plane queries via the new
 *  `anchors?` / `positions?` parameters; until then they're persisted
 *  but inert. The dedicated slot keeps them outside the legacy
 *  `state.moons` / `state.planes` blobs so the migration is clean. */
export function applyToken(token: Token): ApplyResult {
  const previousDateLabel = currentDateLabel();

  // World + variant. The web producer omits `variant` when it matches
  // the world default, so absent = default per §10.3.
  const sysKey = String(token.world).toLowerCase();
  const sys = CALENDAR_SYSTEMS[sysKey] || {};
  const variantKey = String(
    token.variant || sys.defaultVariant || 'standard',
  ).toLowerCase();
  applyCalendarSystem(sysKey, variantKey);

  // Settings. Palette → settings.colorTheme. Mirror calendarSystem +
  // calendarVariant so future reads of state.settings line up with what
  // applyCalendarSystem just installed.
  const st = ensureSettings();
  st.calendarSystem = sysKey;
  st.calendarVariant = variantKey;
  st.colorTheme = token.palette ? String(token.palette).toLowerCase() : null;

  // Date.
  if (token.date.kind === 'month') {
    // setDate expects a 1-based month number (the legacy state shape
    // uses 0-based internally but the public helper takes 1-based, see
    // its callers in setup.ts). Add 1 here.
    setDate(token.date.monthIndex + 1, token.date.day, token.date.year, {
      announce: false,
    });
  } else {
    // Intercalary date — find the intercalary slot in the calendar's
    // month list. The legacy state model represents intercalaries as
    // months with `isIntercalary: true`, so we walk the months to find
    // the one whose key matches.
    const cal = getCal();
    let foundIdx = -1;
    for (let i = 0; i < cal.months.length; i++) {
      const m = cal.months[i] as { key?: string; isIntercalary?: boolean };
      if (m.isIntercalary && m.key === token.date.intercalaryKey) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx >= 0) {
      setDate(foundIdx + 1, token.date.day, token.date.year, { announce: false });
    }
    // Otherwise — silently skip the date; the world+variant change is
    // still applied. Parse-time validation can't catch this without an
    // engine-resolved world; the GM gets the rest of the setup and
    // can `!cal set` the date manually if they prefer.
  }

  // Anchors. Store under a dedicated `imported` slot — PR 2 reads from
  // here when wiring engine calls. We persist even when empty so the
  // slot's presence signals "this campaign was token-configured."
  const root = (state as { [key: string]: unknown })[state_name] as Record<
    string,
    unknown
  >;
  root.imported = {
    lunarAnchors: token.lunarAnchors ?? {},
    planarAnchors: token.planarAnchors ?? {},
    appliedAt: Date.now(),
    schemaVersion: token.v,
  };

  const newDateLabel = currentDateLabel();
  return {
    applied: true,
    previousDateLabel,
    newDateLabel,
    dateChanged: previousDateLabel !== newDateLabel,
  };
}

/** `!cal token <paste>` command handler. GM-only. */
export function handleTokenCommand(msg: { who: string; content: string; playerid: string }): void {
  if (typeof playerIsGM === 'function' && !playerIsGM(msg.playerid)) {
    whisper(cleanWho(msg.who), 'Loading a setup token is GM-only.');
    return;
  }

  // The raw token sits after "!cal token " in msg.content. Read it
  // directly rather than going through the args-array path — args is
  // normalized via _normalizePackedWords which is fine for keywords
  // but base64 strings can survive normalization with edge-case mangling.
  const stripped = String(msg.content || '').replace(/^!cal\s+token\b\s*/i, '');
  const parsed = parseToken(stripped);
  if (parsed.ok !== true) {
    whisperUi(
      cleanWho(msg.who),
      _menuBox(
        'Setup token',
        '<div style="opacity:.85;">' + esc(parsed.error) + '</div>',
      ),
    );
    return;
  }

  const result = applyToken(parsed.token);

  // §10.3 confirmations.
  whisperUi(
    cleanWho(msg.who),
    _menuBox(
      'Setup token applied',
      '<div>New configuration loaded. Use <code>!cal</code> to begin.</div>',
    ),
  );
  if (result.dateChanged) {
    whisperUi(
      cleanWho(msg.who),
      _menuBox(
        'Date changed by token',
        '<div>The previous date was <b>' +
          esc(result.previousDateLabel) +
          '</b>. The new date is <b>' +
          esc(result.newDateLabel) +
          '</b>.</div>' +
          '<div style="margin-top:6px;opacity:.78;">' +
          'Use <code>!cal set</code> if you wanted to keep the previous date.' +
          '</div>',
      ),
    );
  }
}

