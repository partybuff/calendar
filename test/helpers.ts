// Shared test helpers for TypeScript tests.
// Must import roll20-shim first to set up globals.
import './roll20-shim.js';
import { checkInstall, getSetupState } from '../src/state.js';

/** Fresh-initialize state before each test group. */
export function freshInstall() {
  (globalThis as any)._resetShim();
  checkInstall();
}

export function completeSetup() {
  getSetupState().status = 'complete';
}
