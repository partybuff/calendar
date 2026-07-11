// Section: Cross-script setup token.
//
// Implements the §10 token format from ENGINE_CONTRACT.md. The web app
// (`@partybuff/party-buff`) emits a base64-encoded JSON payload via a
// "Copy configuration token" affordance in its calendar settings; the
// GM pastes it into Roll20 with `!cal token <paste>` to apply the
// same world / date / variant / palette to a running session.
//
// The token carries setup only — never campaign content. Custom
// events, notes, weather, and forecast gating stay on the web. See
// ENGINE_CONTRACT.md §10 for the full wire format and validation
// rules.
//
// Decode + validate + apply to the existing `state.PartyBuffCalendar`
// shape. World, date, variant and palette are applied via the existing
// helpers (`applyCalendarSystem`, `setDate`, `ensureSettings`).
//
// Per PR #198, moons and planes are canon-only — `getMoonOpts()` and
// `getPlanePositions()` always return `{}` — so a token's lunar/krynn/
// planar anchor fields can never affect what players see. Rather than
// validate and persist inert data, this wrapper doesn't parse those
// fields at all: a token carries world/date/variant/palette only. Any
// `lunarAnchors` / `krynnAnchor` / `planarAnchors` on an incoming
// payload are silently ignored (not validated, not stored).

import { CALENDAR_SYSTEMS } from './config.js';
import { cleanWho, whisper, whisperUi } from './messaging.js';
import { applyCalendarSystem, ensureSettings, getCal } from './state.js';
import { _menuBox, currentDateLabel, setDate } from './ui.js';
import { esc } from './rendering.js';
import { resolveWorldKey } from './worlds/index.js';

type CalendarDateMonth = { kind: 'month'; year: number; monthIndex: number; day: number };
type CalendarDateIntercalary = { kind: 'intercalary'; year: number; intercalaryKey: string; day: number };
type CalendarDate = CalendarDateMonth | CalendarDateIntercalary;

interface Token {
  v: 1;
  world: string;
  date: CalendarDate;
  variant?: string;
  palette?: string;
}

export const TOKEN_SCHEMA_VERSION = 1;

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

  // world — accepts either a wrapper registry key ('faerunian') or the
  // underlying engine WorldId ('faerun'); resolved against the OVERLAYS
  // registry (worlds/index.ts::resolveWorldKey) so every registered world
  // (including ones added later, e.g. Barovia) is accepted without a
  // second hardcoded list here.
  if (typeof p.world !== 'string' || !resolveWorldKey(p.world)) {
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

  // `lunarAnchors` / `krynnAnchor` / `planarAnchors` are NOT validated or
  // read here. Per #198, moons and planes are canon-only — the engine
  // opts bags (`getMoonOpts()` / `getPlanePositions()`) always return
  // `{}` — so those fields, even if a producer still sends them, can
  // never affect what players see. A token carries world/date/variant/
  // palette only.

  return { ok: true, token: payload as Token };
}

export type ApplyResult =
  | { applied: true; previousDateLabel: string; newDateLabel: string; dateChanged: boolean }
  | { applied: false; error: string };

/** Apply a parsed token to `state.PartyBuffCalendar`. Snapshots the
 *  previous current-date label first so the §10.3 confirmation can
 *  point the GM at it if they want to set it back.
 *
 *  World resolution failure or an `applyCalendarSystem` rejection both
 *  fail the whole apply with no partial writes — the resolution check
 *  runs before any state read/write, and `applyCalendarSystem`'s result
 *  is checked before settings/date are touched. */
export function applyToken(token: Token): ApplyResult {
  // World. Accepts either the wrapper registry key or the engine WorldId
  // (see worlds/index.ts::resolveWorldKey) — resolve to the wrapper key
  // BEFORE touching state so an unresolvable world (or one that
  // `applyCalendarSystem` itself rejects) never leaves state half-written.
  const sysKey = resolveWorldKey(token.world);
  if (!sysKey) {
    return { applied: false, error: `Unknown world "${token.world}".` };
  }

  const previousDateLabel = currentDateLabel();

  // Variant. The web producer omits `variant` when it matches the world
  // default, so absent = default per §10.3.
  const sys = CALENDAR_SYSTEMS[sysKey] || {};
  const variantKey = String(
    token.variant || sys.defaultVariant || 'standard',
  ).toLowerCase();
  if (!applyCalendarSystem(sysKey, variantKey)) {
    return {
      applied: false,
      error: `Could not apply world "${token.world}" (registry key "${sysKey}").`,
    };
  }

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

  // No anchor persistence. Moons and planes are canon-only (#198) — a
  // token no longer carries lunar/krynn/planar anchors at all, so there
  // is nothing to store. `state.PartyBuffCalendar.imported` is retired;
  // see `_sweepLegacyStateSlots` in state.ts for the cleanup of any
  // already-persisted copies from older campaigns.

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

  if (result.applied !== true) {
    whisperUi(
      cleanWho(msg.who),
      _menuBox(
        'Setup token',
        '<div style="opacity:.85;">' + esc(result.error) + '</div>',
      ),
    );
    return;
  }

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

