// Section 5: Date / Serial Math
//
// The wrapper persists dates as `(year, mi, day)` where `mi` is a structural
// index into `cal.months` — that array interleaves engine intercalaries
// (Shieldmeet, Greengrass, etc.) into the canonical month list so the Roll20
// grid can be rendered as a single flat sequence. Serial math walks that
// flat structure directly; the heavy lifting still happens locally but the
// shape of `cal.months` is now produced by composing engine canon data with
// Roll20 overlays in `src/worlds/`.
//
// Where the engine and the wrapper agree exactly on a calculation (the
// Gregorian leap-year rule, for instance) the wrapper delegates so we have
// a single source of truth.
import { date as engineDate } from '@partybuff/calendar-engine';
import { ensureSettings, getCal, weekLength } from './state.js';
import { clamp } from './rendering.js';
import { weekdayProgressionFor, intercalaryRenderFor } from './worlds/index.js';


/* ============================================================================
 * 5) DATE / SERIAL MATH  (with caching)
 * ==========================================================================*/

// ---------------------------------------------------------------------------
// Serial math — leap-aware
//
// A "serial" is a globally unique integer day count used for all date
// arithmetic. With leap months (e.g. Shieldmeet), year length varies, so we
// cannot use y × daysPerYear() as the year-base. Instead:
//
//   toSerial(y,mi,d) = _daysBeforeYear(y) + _daysBeforeMonthInYear(y,mi) + (d-1)
//
// For calendars with no leap months, _daysBeforeYear reduces to y × baseDpy,
// producing identical results to the old code.
// ---------------------------------------------------------------------------

// Returns true if month object m is a leap-only month active in year y.
export function _isLeapMonth(m, y){
  if (_isGregorianLeapSlotMonthObj(m)) return _isGregorianLeapYear(y);
  return !!(m.leapEvery && (y % m.leapEvery === 0));
}

/** Gregorian leap-year rule. Delegates to the engine so the wrapper and the
 *  Party Buff web app share a single implementation of the 4/100/400 rule. */
export function _isGregorianLeapYear(y){
  var n = parseInt(y, 10) || 0;
  return engineDate.isLeapYear('gregorian', n);
}

export function _isGregorianLeapSlotMonthObj(m){
  return !!(intercalaryRenderFor(ensureSettings().calendarSystem) === 'banner_day' && m && m.isIntercalary && String(m.name||'') === 'Leap Day');
}

export function _isGregorianLeapSlotIndex(mi){
  var months = getCal().months;
  return _isGregorianLeapSlotMonthObj(months[mi]);
}

// Base days per year: sum of all non-leap month days.
// Cached — recompute if months array changes (via _invalidateSerialCache).
export var _serialCache = { baseDpy: null, hasLeap: null, avgDpy: null };

export function _invalidateSerialCache(){
  _serialCache.baseDpy = null;
  _serialCache.hasLeap = null;
  _serialCache.avgDpy  = null;
}

export function _buildSerialCache(){
  var months = getCal().months;
  var base = 0, leapFrac = 0, hasLeap = false;
  for (var i=0; i<months.length; i++){
    var m = months[i];
    if (m.leapEvery){
      hasLeap = true;
      if (_isGregorianLeapSlotMonthObj(m)) leapFrac += (m.days|0) * (97 / 400);
      else leapFrac += (m.days|0) / m.leapEvery;
    } else {
      base += (m.days|0);
    }
  }
  _serialCache.baseDpy = base;
  _serialCache.hasLeap = hasLeap;
  _serialCache.avgDpy  = base + leapFrac; // average including leap contribution
}


// Count of years in [0, y-1] divisible by `every` (includes year 0).
export function _leapsBefore(y, every){
  if (y <= 0 || !every) return 0;
  return Math.floor((y - 1) / every) + 1;
}

function _gregorianLeapsBefore(y){
  if (y <= 0) return 0;
  return _leapsBefore(y, 4) - _leapsBefore(y, 100) + _leapsBefore(y, 400);
}

// Total elapsed days from the epoch to the start of year y.
export function _daysBeforeYear(y){
  if (_serialCache.baseDpy === null) _buildSerialCache();
  var months = getCal().months;
  var total = y * _serialCache.baseDpy;
  if (_serialCache.hasLeap){
    for (var i=0; i<months.length; i++){
      var m = months[i];
      if (m.leapEvery){
        if (_isGregorianLeapSlotMonthObj(m)) total += _gregorianLeapsBefore(y) * (m.days|0);
        else total += _leapsBefore(y, m.leapEvery) * (m.days|0);
      }
    }
  }
  return total;
}

// Total elapsed days from start of year y to start of month mi within that year.
// Leap months that are inactive this year contribute 0 days.
export function _daysBeforeMonthInYear(y, mi){
  var months = getCal().months;
  var total = 0;
  for (var i=0; i<mi; i++){
    var m = months[i];
    if (m.leapEvery){
      if (_isLeapMonth(m, y)) total += (m.days|0);
    } else {
      total += (m.days|0);
    }
  }
  return total;
}

// daysPerYear kept for any call sites that only need a representative count.
// Returns days in the CURRENT year using today's year from state.
export function daysPerYear(){
  if (_serialCache.baseDpy === null) _buildSerialCache();
  if (!_serialCache.hasLeap) return _serialCache.baseDpy;
  var cal = getCal();
  var y = cal && cal.current ? cal.current.year : 0;
  var months = cal.months;
  var total = _serialCache.baseDpy;
  for (var i=0; i<months.length; i++){
    if (months[i].leapEvery && _isLeapMonth(months[i], y)) total += (months[i].days|0);
  }
  return total;
}

export function toSerial(y, mi, d){
  return _daysBeforeYear(y) + _daysBeforeMonthInYear(y, mi) + ((parseInt(d,10)||1) - 1);
}

export function weekdayIndex(y, mi, d){
  var cal=getCal(), cur=cal.current, wdlen=cal.weekdays.length;
  var st = ensureSettings();
  var mobj = cal.months[mi] || {};
  var progression = weekdayProgressionFor(st.calendarSystem);
  if (progression === 'month_reset' && !mobj.isIntercalary){
    return (((parseInt(d, 10) || 1) - 1) % wdlen + wdlen) % wdlen;
  }
  if ((progression === 'month_reset' || progression === 'festival_fixed') && mobj.isIntercalary){
    return 0;
  }
  var delta = toSerial(y, mi, d) - toSerial(cur.year, cur.month, cur.day_of_the_month);
  return (cur.day_of_the_week + ((delta % wdlen) + wdlen)) % wdlen;
}

export function weekStartSerial(y, mi, d){
  var st = ensureSettings();
  var cal = getCal();
  var mobj = (cal.months || [])[mi] || {};
  // Weekless calendars (Barovia) have no weekday alignment: each month opens at
  // day 1 in the top-left and fills fixed 7-cell rows. weekdayIndex is undefined
  // here (no weekdays), so derive the row start straight from the day-of-month.
  if (cal.weekdays.length === 0){
    var wl0 = weekLength();
    var off0 = ((((parseInt(d, 10) || 1) - 1) % wl0) + wl0) % wl0;
    return toSerial(y, mi, d) - off0;
  }
  var progression = weekdayProgressionFor(st.calendarSystem);
  if (progression === 'month_reset' && !mobj.isIntercalary){
    return toSerial(y, mi, d) - ((((parseInt(d, 10) || 1) - 1) % weekLength()) + weekLength()) % weekLength();
  }
  if ((progression === 'month_reset' || progression === 'festival_fixed') && mobj.isIntercalary){
    return toSerial(y, mi, 1);
  }
  var wd = weekdayIndex(y, mi, d);
  return toSerial(y, mi, d) - wd;
}

export function fromSerial(s){
  if (_serialCache.baseDpy === null) _buildSerialCache();
  var months = getCal().months;

  if (!_serialCache.hasLeap){
    // Fast path: no leap months — simple linear division.
    var dpy = _serialCache.baseDpy;
    var y = Math.floor(s / dpy);
    var rem = s - y * dpy;
    var mi = 0;
    while (mi < months.length - 1 && rem >= (months[mi].days|0)){ rem -= (months[mi].days|0); mi++; }
    rem = Math.min(rem, (months[mi].days|0) - 1);
    return { year:y, mi:mi, day:(rem|0)+1 };
  }

  // Leap-aware path: estimate year from average dpy, then adjust ±2.
  var yEst = Math.max(0, Math.floor(s / _serialCache.avgDpy) - 1);
  while (_daysBeforeYear(yEst + 1) <= s) yEst++;
  var y = yEst;
  var rem = s - _daysBeforeYear(y);

  // Walk months of year y, skipping inactive leap months.
  var mi = 0;
  while (mi < months.length){
    var m = months[mi];
    if (m.leapEvery && !_isLeapMonth(m, y)){ mi++; continue; } // inactive leap slot
    var mdays = m.days|0;
    if (rem < mdays) break;
    rem -= mdays;
    mi++;
  }
  // Safety clamp
  if (mi >= months.length) mi = months.length - 1;
  // Skip any trailing inactive leap month we may have landed on
  while (mi < months.length && months[mi].leapEvery && !_isLeapMonth(months[mi], y)) mi++;
  if (mi >= months.length) mi = months.length - 1;
  var maxDay = months[mi].days|0;
  rem = Math.min(rem, maxDay - 1);
  return { year:y, mi:mi, day:(rem|0)+1 };
}

export function todaySerial(){ var c = getCal().current; return toSerial(c.year, c.month, c.day_of_the_month); }

// Maps a raw calendar slot index to a 0-based regular-month index.
// Intercalary slots inherit the nearest preceding regular month.
export function regularMonthIndex(mi){
  var months = getCal().months;
  var count = 0;
  for (var i = 0; i < months.length && i <= mi; i++){
    if (!months[i].isIntercalary){
      if (i === mi) return count;
      count++;
    }
  }
  for (var j = mi - 1; j >= 0; j--){
    if (!months[j].isIntercalary) return count - 1;
  }
  return 0;
}

// Returns the next month index (and year) after mi that is active in that year,
// skipping inactive leap-only slots. Wraps year boundary correctly.
export function _nextActiveMi(mi, y){
  var months = getCal().months;
  var len = months.length;
  var nmi = (mi + 1) % len;
  var ny  = y + (nmi === 0 ? 1 : 0);
  var safety = 0;
  while (safety++ < len){
    if (_isGregorianLeapSlotIndex(nmi)){
      nmi = (nmi + 1) % len;
      if (nmi === 0) ny++;
      continue;
    }
    if (!months[nmi].leapEvery || _isLeapMonth(months[nmi], ny)) return { mi: nmi, y: ny };
    nmi = (nmi + 1) % len;
    if (nmi === 0) ny++;
  }
  return { mi: (mi + 1) % len, y: ny }; // fallback
}

// Returns the previous month index (and year) before mi that is active in that year.
export function _prevActiveMi(mi, y){
  var months = getCal().months;
  var len = months.length;
  var pmi = (mi + len - 1) % len;
  var py  = y - (mi === 0 ? 1 : 0);
  var safety = 0;
  while (safety++ < len){
    if (_isGregorianLeapSlotIndex(pmi)){
      pmi = (pmi - 1 + len) % len;
      if (pmi === len - 1) py--;
      continue;
    }
    if (!months[pmi].leapEvery || _isLeapMonth(months[pmi], py)) return { mi: pmi, y: py };
    pmi = (pmi + len - 1) % len;
    if (pmi === len - 1) py--;
  }
  return { mi: (mi + len - 1) % len, y: py }; // fallback
}


