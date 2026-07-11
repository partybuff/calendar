// Section 4: Color Utilities
import { CONTRAST_MIN_HEADER, NAMED_COLORS } from './constants.js';
import { getEventColor } from './events.js';
import { _parseSharpColorToken } from './ui.js';
import { colors as _engineColors } from '@partybuff/calendar-engine/lite';


/* ============================================================================
 * 4) COLOR UTILITIES
 * ==========================================================================*/

export var _contrastCache = Object.create(null);
export var _headerStyleCache = Object.create(null);

export function _cullCacheIfLarge(obj, max?){
  var limit = max || 256;
  if (Object.keys(obj).length > limit){
    for (var k in obj){ if (Object.prototype.hasOwnProperty.call(obj,k)) delete obj[k]; }
  }
}

export function _resetColorCaches(){
  _contrastCache    = Object.create(null);
  _headerStyleCache = Object.create(null);
}

// Hex normalization delegates to engine, then upper-cases to preserve the
// wrapper's historical '#RRGGBB' (uppercase) output.
export function sanitizeHexColor(s){
  var hex = _engineColors.sanitizeHex(s);
  return hex ? hex.toUpperCase() : null;
}

// Resolves hex OR named-color tokens. Engine handles the standard CSS
// color names; the wrapper keeps its NAMED_COLORS table as a fallback for
// any Roll20-specific names the engine doesn't recognize.
export function resolveColor(s){
  if (!s) return null;
  var hex = _engineColors.resolve(s);
  if (hex) return hex.toUpperCase();
  var key = String(s).trim().toLowerCase();
  return NAMED_COLORS[key] || null;
}

export function popColorIfPresent(tokens, allowBareName){
  tokens = (tokens || []).slice();
  if (!tokens.length) return { color:null, tokens:tokens };
  var last = String(tokens[tokens.length-1]||'').trim();

  var col = null;
  if (allowBareName){
    col = resolveColor(last) || _parseSharpColorToken(last);
  } else {
    if (last[0] === '#') col = _parseSharpColorToken(last);
  }

  if (col){
    tokens.pop();
    return { color: col, tokens: tokens };
  }
  return { color: null, tokens: tokens };
}

export function _stableHash(str){
  var h = 5381; str = String(str||'');
  for (var i=0;i<str.length;i++){ h = ((h<<5)+h) + str.charCodeAt(i); h|=0; }
  return Math.abs(h);
}

// Render small colored dots for events on a calendar day.
// In normal mode: first event owns the cell background; events 2-3 as dots.
// In dot-only mode (moon multi-system): all events rendered as dots, no bg fill.
export function _eventDotsHtml(events, dotOnly?){
  if (!events || !events.length) return '';
  var startIdx = dotOnly ? 0 : 1;
  var slice = events.slice(startIdx, startIdx + 3);
  if (!slice.length) return '';
  var dots = slice.map(function(e){
    var col = getEventColor(e);
    return '<span style="color:'+col+';line-height:1;">&#9679;</span>';
  });
  return '<div style="font-size:.45em;line-height:1;text-align:center;">'+dots.join('&thinsp;')+'</div>';
}

export function _relLum(hex){
  hex = (hex||'').toString().replace(/^#/, '');
  if (hex.length===3) hex = hex.replace(/(.)/g,'$1$1');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 0;
  var n = parseInt(hex,16), r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  function lin(c){ c/=255; return c<=0.04045? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}

export function _contrast(bgHex, textHex){ var L1=_relLum(bgHex), L2=_relLum(textHex); var hi=Math.max(L1,L2), lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05); }

export function textColor(bgHex){
  var k = 't:'+bgHex;
  if (_contrastCache[k]) return _contrastCache[k];
  // Engine returns '#000000' / '#ffffff'; wrapper has historically used the
  // 3-char forms in chat HTML, so map them. Both render identically.
  var v = _engineColors.textOn(bgHex) === '#000000' ? '#000' : '#fff';
  _contrastCache[k] = v;
  _cullCacheIfLarge(_contrastCache);
  return v;
}

export function textOutline(tc, bgHex, minTarget){
  var ratio = _contrast(bgHex, tc);
  if (ratio >= (minTarget||CONTRAST_MIN_HEADER)) return '';
  if (tc === '#fff'){
    var off = 1;
    return 'text-shadow:'+(-off)+'px '+(-off)+'px 0 rgba(0,0,0,.95),'+(off)+'px '+(-off)+'px 0 rgba(0,0,0,.95),'+(-off)+'px '+(off)+'px 0 rgba(0,0,0,.95),'+(off)+'px '+(off)+'px 0 rgba(0,0,0,.95);';
  } else {
    var off2 = .5;
    return 'text-shadow:'+(-off2)+'px '+(-off2)+'px 0 rgba(255,255,255,.70),'+(off2)+'px '+(-off2)+'px 0 rgba(255,255,255,.70),'+(-off2)+'px '+(off2)+'px 0 rgba(255,255,255,.70),'+(off2)+'px '+(off2)+'px 0 rgba(255,255,255,.70);';
  }
}

export function applyBg(style, bgHex, minTarget){
  var t = textColor(bgHex);
  style += 'background-color:'+bgHex+';';
  style += 'background-clip:padding-box;';
  style += 'color:'+t+';';
  style += textOutline(t, bgHex, (minTarget||CONTRAST_MIN_HEADER));
  return style;
}

// Convert a hex color to rgba string with the given alpha (0-1).
export function hexToRgba(hex, alpha){
  hex = (hex||'').toString().replace(/^#/, '');
  if (hex.length===3) hex = hex.replace(/(.)/g,'$1$1');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 'rgba(0,0,0,'+alpha+')';
  var n = parseInt(hex,16);
  return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+alpha+')';
}

// Apply a planar cell fill: solid for coterminous, faded with diagonal
// hatching for remote.  For diagonal split (two planes), uses a
// linear-gradient dividing the cell diagonally.
export function applyPlaneFill(style, event, minTarget){
  var e = event as any;
  if (e.splitColor){
    // Diagonal split: two planes sharing the cell
    var c1 = e.isRemote ? hexToRgba(e.color, 0.35) : e.color;
    var c2 = e.splitIsRemote ? hexToRgba(e.splitColor, 0.35) : e.splitColor;
    style += 'background:linear-gradient(135deg, '+c1+' 50%, '+c2+' 50%);';
    style += 'color:#000;';
    style += textOutline('#000', '#888', (minTarget||CONTRAST_MIN_HEADER));
  } else if (e.isRemote){
    // Remote: faded color with subtle diagonal line hatching
    var fade = hexToRgba(e.color, 0.3);
    var line = 'rgba(0,0,0,0.12)';
    style += 'background:repeating-linear-gradient(135deg,'+fade+','+fade+' 3px,'+line+' 3px,'+line+' 5px);';
    style += 'color:#000;';
    style += textOutline('#000', '#ccc', (minTarget||CONTRAST_MIN_HEADER));
  } else {
    // Coterminous: solid fill
    style = applyBg(style, e.color, minTarget);
  }
  return style;
}

export var colorsAPI = {
  textColor: textColor,
  applyBg: applyBg,
  styleMonthHeader: function(monthHex){
    var k = 'hdr:'+monthHex;
    if (_headerStyleCache[k]) return _headerStyleCache[k];
    var t = textColor(monthHex);
    var v = 'background-color:'+monthHex+';color:'+t+';'+textOutline(t, monthHex, CONTRAST_MIN_HEADER);
    _headerStyleCache[k] = v;
    _cullCacheIfLarge(_headerStyleCache);
    return v;
  },
  reset: _resetColorCaches
};


