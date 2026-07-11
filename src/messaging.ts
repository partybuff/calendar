// Messaging utilities: send, whisper, warnGM, etc.
// Separated to avoid circular dependencies between commands, rendering, and weather.
import { script_name } from './constants.js';

export function cleanWho(who){
  return String(who||'').replace(/\s+\(GM\)$/,'').replace(/["\\]/g,'').trim();
}

export function send(opts, html){
  opts = opts || {};
  var to = cleanWho(opts.to);
  var prefix;
  if (opts.broadcast)   prefix = '/direct ';
  else if (opts.gmOnly) prefix = '/w gm ';
  else if (to)          prefix = '/w "' + to + '" ';
  else                  prefix = '/direct ';
  // Public broadcasts (!cal send, calendar-reset announcement) persist in the
  // Roll20 chat log so the campaign retains an in-game timestamp trail.
  // Whispers, GM-only messages, and all sendUi* panels stay non-archived
  // so interactive UI doesn't clutter the log.
  var sendOpts: any = {};
  if (!opts.broadcast || opts.noarchive) sendOpts.noarchive = true;
  sendChat(script_name, prefix + html, null, sendOpts);
}

export function sendToAll(html){ send({ broadcast:true }, html); }
export function sendToGM(html){  send({ gmOnly:true }, html); }
export function whisper(to, html){ send({ to:to }, html); }
export function sendUi(opts, html){
  opts = opts || {};
  opts.noarchive = true;
  send(opts, html);
}
export function sendUiToAll(html){ sendUi({ broadcast:true }, html); }
export function sendUiToGM(html){ sendUi({ gmOnly:true }, html); }
export function whisperUi(to, html){ sendUi({ to:to }, html); }
export function whisperParts(to, parts){
  if (!Array.isArray(parts)) parts = [parts];
  for (var i = 0; i < parts.length; i++){
    if (parts[i]) whisper(to, parts[i]);
  }
}
// Broadcast counterpart to whisperParts — used for year-scale ranges chunked
// into one message per month group so no single sendChat blows past Roll20's
// practical message size limit. Roll20 delivers sequential sendChat calls in
// the order issued, so no explicit sequencing/throttling is needed here.
export function sendToAllParts(parts){
  if (!Array.isArray(parts)) parts = [parts];
  for (var i = 0; i < parts.length; i++){
    if (parts[i]) sendToAll(parts[i]);
  }
}
export function warnGM(msg){ sendChat(script_name, '/w gm ' + msg, null, { noarchive: true }); }
export function warnGMUi(msg){ sendChat(script_name, '/w gm ' + msg, null, { noarchive: true }); }
