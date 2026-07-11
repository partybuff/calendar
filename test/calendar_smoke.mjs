import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const calendarPath = path.join(__dirname, '..', 'calendar.js');
const source = fs.readFileSync(calendarPath, 'utf8');

function installRoll20Shim() {
  globalThis.state = {};
  globalThis._roll20Objects = {};
  globalThis._roll20IdCounter = 1;
  globalThis._campaignState = { playerpageid: '', playerspecificpages: {} };
  globalThis._chatLog = [];
  globalThis._eventHandlers = {};
  globalThis._logMessages = [];
  globalThis._gmIds = new Set(['GM']);
  globalThis.__CALENDAR_TEST_MODE__ = true;

  globalThis.sendChat = function(who, msg, _cb, opts) {
    globalThis._chatLog.push({ who, msg, opts: opts || null });
  };

  globalThis.on = function(event, handler) {
    if (!globalThis._eventHandlers[event]) globalThis._eventHandlers[event] = [];
    globalThis._eventHandlers[event].push(handler);
  };

  globalThis.log = function(msg) {
    globalThis._logMessages.push(msg);
  };

  globalThis.playerIsGM = function(playerid) {
    return globalThis._gmIds.has(String(playerid || ''));
  };

  function newRoll20Id() {
    const next = globalThis._roll20IdCounter++;
    return `-MOCK${String(next).padStart(6, '0')}`;
  }

  function normalizeAttrBag(type, attrs) {
    const out = { ...(attrs || {}) };
    out._type = type;
    if (!out._id) out._id = newRoll20Id();
    if (!out.id) out.id = out._id;
    if (out.pageid != null && out._pageid == null) out._pageid = out.pageid;
    if (out._pageid != null && out.pageid == null) out.pageid = out._pageid;
    if (out.characterid != null && out._characterid == null) out._characterid = out.characterid;
    if (out._characterid != null && out.characterid == null) out.characterid = out._characterid;
    return out;
  }

  function makeObj(type, attrs) {
    const bag = normalizeAttrBag(type, attrs);
    const obj = {
      id: bag._id,
      get(prop, cb) {
        const key = String(prop || '');
        const value = key === 'id' ? bag._id : bag[key];
        if (typeof cb === 'function') cb(value);
        return value;
      },
      set(prop, value) {
        if (prop && typeof prop === 'object') {
          Object.keys(prop).forEach((key) => {
            bag[key] = prop[key];
          });
        } else {
          bag[String(prop)] = value;
        }
        if (bag.pageid != null && bag._pageid == null) bag._pageid = bag.pageid;
        if (bag._pageid != null && bag.pageid == null) bag.pageid = bag._pageid;
        if (bag.characterid != null && bag._characterid == null) bag._characterid = bag.characterid;
        if (bag._characterid != null && bag.characterid == null) bag.characterid = bag._characterid;
        return obj;
      },
      remove() {
        delete globalThis._roll20Objects[bag._id];
      }
    };
    globalThis._roll20Objects[bag._id] = { type, bag, obj };
    return obj;
  }

  globalThis.createObj = function(type, attrs) {
    return makeObj(String(type || ''), attrs || {});
  };

  globalThis.getObj = function(type, id) {
    const found = globalThis._roll20Objects[String(id || '')];
    if (!found) return null;
    if (String(found.type) !== String(type || '')) return null;
    return found.obj;
  };

  globalThis.findObjs = function(attrs, options) {
    const want = attrs || {};
    const caseInsensitive = !!(options && options.caseInsensitive);
    return Object.values(globalThis._roll20Objects)
      .filter((entry) => {
        const bag = entry.bag || {};
        return Object.keys(want).every((key) => {
          const actual = bag[key];
          const expected = want[key];
          if (typeof actual === 'string' && typeof expected === 'string' && caseInsensitive) {
            return actual.toLowerCase() === expected.toLowerCase();
          }
          return actual === expected;
        });
      })
      .map((entry) => entry.obj);
  };

  globalThis.Campaign = function() {
    return {
      get(prop) {
        return globalThis._campaignState[String(prop || '')];
      },
      set(prop, value) {
        if (prop && typeof prop === 'object') {
          Object.keys(prop).forEach((key) => {
            globalThis._campaignState[key] = prop[key];
          });
        } else {
          globalThis._campaignState[String(prop || '')] = value;
        }
      }
    };
  };

  globalThis.randomInteger = function(max) {
    return Math.floor(Math.random() * max) + 1;
  };
}

function loadBundle() {
  assert(source.length > 1000, 'calendar.js should exist and be non-trivial.');
  vm.runInThisContext(`${source}\n;globalThis.__calendarBundle = Calendar;`, { filename: calendarPath });
  const bundle = globalThis.__calendarBundle;
  assert(bundle, 'Built bundle should expose Calendar.');
  assert.equal(typeof bundle.checkInstall, 'function', 'Calendar.checkInstall should exist.');
  assert.equal(typeof bundle.register, 'function', 'Calendar.register should exist.');
  assert(bundle.render && typeof bundle.render === 'object', 'Calendar.render should expose the render API.');
  assert(bundle._test, 'Built bundle should expose test helpers in smoke mode.');
  return bundle;
}

function handlersFor(event) {
  return globalThis._eventHandlers[event] || [];
}

function trigger(event, ...args) {
  const handlers = handlersFor(event);
  assert(handlers.length > 0, `Expected at least one handler for ${event}.`);
  for (const handler of handlers) handler(...args);
}

function clearChat() {
  globalThis._chatLog = [];
}

function lastChat() {
  return globalThis._chatLog[globalThis._chatLog.length - 1] || null;
}

function chatSlice(startIndex) {
  return globalThis._chatLog.slice(startIndex);
}

function sendApi(content, who = 'GM (GM)', playerid = 'GM') {
  const before = globalThis._chatLog.length;
  trigger('chat:message', { type: 'api', content, who, playerid });
  const entries = chatSlice(before);
  assert(entries.length > 0, `Command ${content} should emit chat output.`);
  return entries;
}

function assertChatIncludes(entries, needle, message) {
  assert(
    entries.some((entry) => String(entry.msg || '').includes(needle)),
    message
  );
}

function completeSetup(bundle) {
  const stateName = bundle._test.state_name;
  const root = globalThis.state[stateName];
  assert(root, 'checkInstall should initialize persistent state.');
  root.setup = root.setup || {};
  root.setup.status = 'complete';

  const settings = bundle._test.ensureSettings();
  settings.moonsEnabled = true;
  settings.planesEnabled = true;
}

installRoll20Shim();
const bundle = loadBundle();

assert(handlersFor('ready').length > 0, 'Bundle should register a ready handler.');
trigger('ready');
assert(handlersFor('chat:message').length > 0, 'Ready handler should register chat command routing.');
assert(
  globalThis._chatLog.some((entry) => /Welcome to Party Buff(&#39;|')s Roll20 Calendar/.test(String(entry.msg || ''))),
  'Fresh installs should prompt the GM to run setup.'
);

completeSetup(bundle);
clearChat();

const rootEntries = sendApi('!cal');
assertChatIncludes(rootEntries, "Today&#39;s Calendar", 'Root command should render the main dashboard after setup.');
// §5.2: legacy "Subsystems" dropdown replaced by Additional + Help buttons.
assertChatIncludes(rootEntries, 'Additional', 'Root command should render the Additional hub button.');
assertChatIncludes(rootEntries, 'Help', 'Root command should render the Help button.');

const moonEntries = sendApi('!cal moon');
assertChatIncludes(moonEntries, 'Moon', 'Moon command should render lunar output.');

const planeEntries = sendApi('!cal planes');
assertChatIncludes(planeEntries, 'Plane', 'Planes command should render planar output.');

const beforeAdvance = bundle._test.todaySerial();
sendApi('!cal advance 1');
assert.equal(bundle._test.todaySerial(), beforeAdvance + 1, 'Advance command should move the current date forward.');

const helpEntries = sendApi('!cal help');
assertChatIncludes(helpEntries, '!cal', 'Help command should render command usage.');

console.log('PASS: calendar smoke checks');
