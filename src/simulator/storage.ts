// localStorage helpers, parameterized by key so the host controls (or disables)
// persistence. All best-effort: quota/availability errors are swallowed.
//
// The concrete Storage backing these helpers can be swapped at runtime via
// `setActiveStorage` — used to upgrade from the (partitioned) iframe store to
// the shared, unpartitioned store once the Storage Access API grants it. See
// crossSiteSync.ts.

import { isValidScenario, type Scenario, type SavedScenario } from './projection'

let activeStorage: Storage | null =
  typeof localStorage !== 'undefined' ? localStorage : null

/** Swap the Storage these helpers read from / write to (e.g. the shared one). */
export function setActiveStorage(store: Storage) {
  activeStorage = store
}

export function loadScenario(key: string, fallback: Scenario): Scenario {
  try {
    const raw = activeStorage?.getItem(key)
    if (!raw) return fallback
    const s = JSON.parse(raw)
    return isValidScenario(s) ? s : fallback
  } catch {
    return fallback
  }
}

export function saveScenario(key: string, scenario: Scenario) {
  try {
    activeStorage?.setItem(key, JSON.stringify(scenario))
  } catch {
    /* best-effort */
  }
}

export function loadSavedScenarios(key: string): SavedScenario[] {
  try {
    const raw = activeStorage?.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (s): s is SavedScenario =>
        typeof s?.id === 'string' && typeof s?.name === 'string' && isValidScenario(s?.scenario),
    )
  } catch {
    return []
  }
}

export function persistSavedScenarios(key: string, list: SavedScenario[]) {
  try {
    activeStorage?.setItem(key, JSON.stringify(list))
  } catch {
    /* best-effort */
  }
}

/**
 * Union two saved-scenario lists by id, keeping the most recently saved entry
 * on collision. Used to merge the partitioned (local) and shared lists when
 * cross-site sync turns on, so nothing is lost.
 */
export function mergeSavedScenarios(
  a: SavedScenario[],
  b: SavedScenario[],
): SavedScenario[] {
  const byId = new Map<string, SavedScenario>()
  for (const s of [...a, ...b]) {
    const prev = byId.get(s.id)
    if (!prev || s.savedAt > prev.savedAt) byId.set(s.id, s)
  }
  return [...byId.values()].sort((x, y) => x.name.localeCompare(y.name))
}
