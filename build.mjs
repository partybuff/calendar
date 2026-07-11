// Build script: bundles TypeScript source into a single calendar.js
// matching the original IIFE pattern for Roll20 compatibility.

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Self-healing guard: warn (loudly, non-fatal) when the LINKED engine in
// node_modules doesn't satisfy the version this repo pins. Locally the engine
// is often a symlink into the monorepo working tree, which can lag or race the
// published/pinned version — building against the wrong one silently produces
// a misleading calendar.js. CI installs the exact pinned version, so this only
// fires on a stale local checkout, and it tells you exactly how to fix it.
try {
  const require = createRequire(import.meta.url);
  const pin = JSON.parse(readFileSync('./package.json', 'utf8'))
    .dependencies?.['@partybuff/calendar-engine'] ?? '';
  const linked = require('@partybuff/calendar-engine/package.json').version;
  const wantMinor = pin.replace(/^[^0-9]*/, '').split('.').slice(0, 2).join('.');
  const gotMinor = linked.split('.').slice(0, 2).join('.');
  if (wantMinor && gotMinor && wantMinor !== gotMinor) {
    console.warn(
      `\n⚠  ENGINE VERSION DRIFT: this repo pins @partybuff/calendar-engine ${pin} ` +
      `but the linked copy is ${linked}.\n   The build below may not reflect the pinned engine. ` +
      `Resync the engine (in the monorepo: git pull + rebuild the engine dist, or reinstall) ` +
      `before trusting this calendar.js.\n`
    );
  }
} catch { /* engine not resolvable here (e.g. first install) — skip the guard */ }

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'Calendar',
  outfile: 'calendar.js',
  target: 'es2020',
  // Roll20 uses var-style globals.
  // __ROLL20__ is a compile-time constant: only the Roll20 bundle gets it.
  // Code that needs to gate expensive paths in the Roll20 sandbox checks
  // `typeof __ROLL20__ !== 'undefined' && __ROLL20__`.
  define: {
    __ROLL20__: 'true',
  },
  // Keep readable output (Roll20 users may inspect/edit)
  minify: false,
  // Add the header comment
  banner: {
    js: [
      '// Calendar',
      '// By Matthew Cherry (github.com/partybuff/calendar)',
      '// Roll20 API script',
      '// Call `!cal` to start.',
      '//',
      '// ⚠ AUTO-GENERATED — do not edit directly.',
      '// Edit TypeScript source in src/ and run: npm run build',
    ].join('\n'),
  },
});

console.log('Built calendar.js');
