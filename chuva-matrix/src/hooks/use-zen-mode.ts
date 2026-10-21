/**
 * Global "zen mode": everything that is not the rain goes away.
 *
 * When on, the rain screen hides its HUD and its control panel, and the tab layout
 * hides the native tab bar — leaving only the rain. The user gets back with the small
 * floating button the screen renders while zen mode is on.
 *
 * This lives in a tiny module-level store rather than React context because two
 * unrelated parts of the tree need it: the screen (which owns the button) and the tab
 * layout (which owns the native tab bar). Documented in BUILD_LOG.md §11.
 */
import { useSyncExternalStore } from 'react';

let zen = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return zen;
}

/** Turns zen mode on/off. Safe to call from anywhere (event handlers, not render). */
export function setZenMode(next: boolean) {
  if (zen === next) return;
  zen = next;
  for (const listener of listeners) listener();
}

export function useZenMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
