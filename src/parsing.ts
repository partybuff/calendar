// Section 6: Parsing & Fuzzy Matching
import { script_name } from './constants.js';
import { getCal } from './state.js';
import { todaySerial } from './date-math.js';
import { clamp } from './rendering.js';


/* ============================================================================
 * 6) PARSING & FUZZY MATCHING
 * ==========================================================================*/

export function _asciiFold(s){ var str = String(s || ''); return (typeof str.normalize==='function') ? str.normalize('NFD').replace(/[\u0300-\u036f]/g,'') : str; }
export function _normAlpha(s){ return _asciiFold(String(s||'').toLowerCase()).replace(/[^a-z]/g,''); }

export function monthIndexByName(tok){
  var cal = getCal();
  if (!tok) return -1;
  var s = _normAlpha(tok);
  var best = -1, bestLen = 0;
  for (var i=0;i<cal.months.length;i++){
    var n = _normAlpha(cal.months[i].name);
    if (s === n) return i;
    if (s.length >= 3 && n.indexOf(s) === 0 && s.length > bestLen){ best = i; bestLen = s.length; }
  }
  return best;
}

// Flattened `cal.months` indexes of the real (non-intercalary) months, in
// order. The month list interleaves intercalary festivals, so this is how a
// "real-month ordinal" maps back to a slot.
export function realMonthIndexes(){
  var cal = getCal();
  var out = [];
  for (var i=0;i<cal.months.length;i++){ if (!cal.months[i].isIntercalary){ out.push(i); } }
  return out;
}

// Map a 1-based REAL-month ordinal to its flattened `cal.months` index. A
// numeric month addresses real months ONLY — festivals are reached by name —
// so `!cal set 5 14` means the 5th real month regardless of how many festival
// slots sit before it (in Harptos the festivals shift a raw index; this skips
// them). Clamps to the real-month count. Falls back to a flat clamp only if a
// world somehow has no real months.
export function flatIndexForRealMonth(n){
  var real = realMonthIndexes();
  if (!real.length) return clamp((n|0), 1, getCal().months.length) - 1;
  return real[clamp((n|0), 1, real.length) - 1];
}

export var Parse = (function(){
  'use strict';

  var ORD_MAP_TOK = {
    '1':'first','2':'second','3':'third','4':'fourth','5':'fifth','last':'last',
    '1st':'first','2nd':'second','3rd':'third','4th':'fourth','5th':'fifth',
    'first':'first','second':'second','third':'third','fourth':'fourth','fifth':'fifth'
  };
  var UNITS = { first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, seventh:7, eighth:8, ninth:9 };

  function _stripTrailPunct(s){ return String(s||'').trim().toLowerCase().replace(/[.,;:!?]+$/,''); }

  function weekdayIndexByName(tok){
    var cal = getCal();
    if (tok==null) return -1;
    if (!cal || !Array.isArray(cal.weekdays) || !cal.weekdays.length) return -1;
    var raw = String(tok);
    var s = _normAlpha(raw);
    if (/^\d+$/.test(raw)){
      var n = parseInt(raw,10);
      if (n>=0 && n<cal.weekdays.length) return n;
      if (n>=1 && n<=cal.weekdays.length) return n-1;
    }
    for (var i=0;i<cal.weekdays.length;i++){
      var w = _normAlpha(cal.weekdays[i]);
      if (s===w || w.indexOf(s)===0) return i;
    }
    return -1;
  }

  function ordinalDay(tok){
    if (!tok) return null;
    var s = _stripTrailPunct(tok);

    var m = s.match(/^(\d+)(st|nd|rd|th)$/);
    if (m) return parseInt(m[1],10);

    var baseWords = {
      first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, seventh:7, eighth:8, ninth:9,
      tenth:10, eleventh:11, twelfth:12, thirteenth:13, fourteenth:14, fifteenth:15, sixteenth:16,
      seventeenth:17, eighteenth:18, nineteenth:19, twentieth:20, thirtieth:30
    };
    if (baseWords[s] != null) return baseWords[s];

    var m2 = s.replace(/[\u2010-\u2015]/g, '-')
              .match(/^(twenty|thirty)(?:[-\s]?)(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)$/);
    if (m2){
      var tens = (m2[1] === 'twenty') ? 20 : 30;
      return tens + UNITS[m2[2]];
    }
    return null;
  }

  function ordinalWeekdayFromTokens(tokens){
    tokens = (tokens||[]).map(function(t){ return String(t||''); }).filter(Boolean);
    if (!tokens.length) return null;

    var ordKey = ORD_MAP_TOK[String(tokens[0]).toLowerCase()];
    if (!ordKey) return null;

    var wdi = weekdayIndexByName(tokens[1]||'');
    if (wdi < 0) return null;

    var rest = tokens.slice(2);
    if (rest[0] && /^of$/i.test(rest[0])) rest.shift();

    var mi = -1, year = null;
    if (rest.length){
      var maybeMi = monthIndexByName(rest[0]);
      if (maybeMi !== -1){ mi = maybeMi; rest.shift(); }
      else if (/^\d+$/.test(rest[0])){
        var n = parseInt(rest[0],10)|0, lim = getCal().months.length;
        if (n>=1 && n<=lim){ mi = n-1; rest.shift(); }
      }
    }
    if (rest.length && /^\d{1,6}$/.test(rest[0])){ year = parseInt(rest[0],10); }

    return { ord:ordKey, wdi:wdi, mi:mi, year:year };
  }

  function ordinalWeekdayFromSpec(spec){
    if (typeof spec !== 'string') return null;
    var s = _stripTrailPunct(spec);
    var m = s.match(/^(first|second|third|fourth|fifth|last|every|all)\s+([a-z0-9]+)/);
    if (!m) return null;
    var ord = (m[1] === 'all') ? 'every' : m[1];
    var wdi = weekdayIndexByName(m[2]);
    if (wdi < 0) return null;
    return { ord:ord, wdi:wdi };
  }

  function looseMDY(tokens){
    var cal = getCal(), months = cal.months;
    tokens = (tokens||[]).map(function(t){return String(t).trim();}).filter(Boolean);
    if (!tokens.length) return null;

    if (tokens.length === 1){
      if (/^\d+$/.test(tokens[0])) return { kind:'dayOnly', day:(parseInt(tokens[0],10)|0) };
      var od = ordinalDay(tokens[0]);
      if (od != null) return { kind:'dayOnly', day:(od|0) };
      // Bare month/festival name → day 1 of that slot, current year. The
      // only numeral-free way to reach an intercalary: `!cal set Midwinter`,
      // `!cal set Growfest`. (Real months land on their 1st too.)
      var miBare = monthIndexByName(tokens[0]);
      if (miBare !== -1) return { kind:'mdy', mi:miBare, day:1, year:null };
      return null;
    }

    if (/^\d+$/.test(tokens[0])){
      var miNum = flatIndexForRealMonth(parseInt(tokens[0],10));
      var dTok  = tokens[1];
      var dNum  = (/^\d+$/.test(dTok)) ? (parseInt(dTok,10)|0) : ordinalDay(dTok);
      if (dNum == null) return null;
      var yNum  = (tokens[2] && /^\d+$/.test(tokens[2])) ? (parseInt(tokens[2],10)|0) : null;
      return { kind:'mdy', mi:miNum, day:dNum, year:yNum };
    }

    var miByName = monthIndexByName(tokens[0]);
    if (miByName !== -1){
      var dTok2 = tokens[1];
      var dN    = (/^\d+$/.test(dTok2)) ? (parseInt(dTok2,10)|0) : ordinalDay(dTok2);
      if (dN == null) return null;
      var yN    = (tokens[2] && /^\d+$/.test(tokens[2])) ? (parseInt(tokens[2],10)|0) : null;
      return { kind:'mdy', mi:miByName, day:dN, year:yN };
    }

    return null;
  }

  function monthYearLoose(tokens){
    var cal = getCal(), cur = cal.current;
    var mi = -1, day = null, year = null, idx = 0;

    if (idx<tokens.length){
      var maybeMi = monthIndexByName(tokens[idx]);
      if (maybeMi !== -1){ mi = maybeMi; idx++; }
      else if (/^\d+$/.test(tokens[idx])){
        var n = parseInt(tokens[idx],10);
        // Numeric month = real-month ordinal (festivals are name-only),
        // matching looseMDY. The range guard keeps a bare year from being
        // misread as a month.
        var realIdxs = realMonthIndexes();
        if (n>=1 && n<=realIdxs.length){ mi = realIdxs[n-1]; idx++; }
      }
    }

    if (idx<tokens.length){
      if (/^\d+$/.test(tokens[idx])){
        var n2 = parseInt(tokens[idx],10);
        var maxDay = (mi !== -1 && cal.months[mi]) ? (cal.months[mi].days|0) : 0;
        var looksLikeMonthYear = (mi !== -1 && idx === 1 && tokens.length === 2 &&
          (n2 > maxDay || String(tokens[idx]).length >= 3));
        if (looksLikeMonthYear){ year = n2; idx++; }
        else { day = n2; idx++; }
      }
      else {
        var od = ordinalDay(tokens[idx]);
        if (od != null){ day = od|0; idx++; }
      }
    }

    if (idx<tokens.length && /^\d{1,6}$/.test(tokens[idx])){ year = parseInt(tokens[idx],10); idx++; }
    if (mi===-1 && day==null && tokens.length===1 && /^\d{1,6}$/.test(tokens[0])){ year = parseInt(tokens[0],10); }

    return { mi:mi, day:day, year:year };
  }

  return {
    weekdayIndexByName: weekdayIndexByName,
    ordinalDay: ordinalDay,
    ordinalWeekday: {
      fromTokens: ordinalWeekdayFromTokens,
      fromSpec:   ordinalWeekdayFromSpec
    },
    looseMDY: looseMDY,
    monthYearLoose: monthYearLoose
  };
})();

export function isTodayVisibleInRange(startSerial, endSerial){
  var t = todaySerial();
  return t >= startSerial && t <= endSerial;
}

// ------------------------------ DaySpec -------------------------------------
export var DaySpec = (function(){
  'use strict';

  function first(spec){
    if (typeof spec === 'number') return spec|0;
    var s = String(spec||'').trim();
    var m = s.match(/^\s*(\d+)/);
    return m ? Math.max(1, parseInt(m[1],10)) : 1;
  }

  function normalize(spec, maxDays){
    var s = String(spec||'').trim().toLowerCase();
    if (/^\d+$/.test(s)){ return String(clamp(s, 1, maxDays)); }
    var m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m){
      var a = clamp(m[1], 1, maxDays), b = clamp(m[2], 1, maxDays);
      if (a > b){ var t=a; a=b; b=t; }
      return (a <= b) ? (a+'-'+b) : null;
    }
    return null;
  }

  function expand(spec, maxDays){
    var s = String(spec||'').trim().toLowerCase();
    var m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m){
      var a = clamp(m[1],1,maxDays), b = clamp(m[2],1,maxDays);
      if (a>b){ var t=a;a=b;b=t; }
      var out=[]; for (var d=a; d<=b; d++) out.push(d);
      return out;
    }
    var n = parseInt(s,10);
    if (isFinite(n)) return [clamp(n,1,maxDays)];

    if (typeof sendChat === 'function'){
      sendChat(script_name, '/w gm Ignored malformed day spec: <code>'+String(spec).replace(/[<>&"]/g, function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c];})+'</code>', null, { noarchive: true });
    }
    return [];
  }

  function matches(spec){
    if (typeof spec === 'number') {
      var n = spec|0; return function(d){ return d === n; };
    }
    var s = String(spec||'').trim().toLowerCase();
    if (s.indexOf('-') !== -1){
      var parts = s.split('-').map(function(x){ return parseInt(String(x).trim(),10); });
      var a = parts[0], b = parts[1];
      if (isFinite(a) && isFinite(b)){
        if (a > b){ var t=a; a=b; b=t; }
        return function(d){ return d >= a && d <= b; };
      }
    }
    var n2 = parseInt(s,10);
    if (isFinite(n2)) return function(d){ return d === n2; };
    return function(){ return false; };
  }

  function canonicalForKey(spec, maxDays){
    var ow = Parse.ordinalWeekday.fromSpec(spec);
    if (ow) return String(spec).toLowerCase().trim();
    return normalize(spec, maxDays) || String(first(spec));
  }

  return { first:first, normalize:normalize, expand:expand, matches:matches, canonicalForKey:canonicalForKey };
})();


