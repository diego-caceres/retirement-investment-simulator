// localStorage helpers, parameterized by key so the host controls (or disables)
// persistence. All best-effort: quota/availability errors are swallowed.

import { isValidScenario, type Scenario, type SavedScenario } from './projection'

export function loadScenario(key: string, fallback: Scenario): Scenario {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const s = JSON.parse(raw)
    return isValidScenario(s) ? s : fallback
  } catch {
    return fallback
  }
}

export function saveScenario(key: string, scenario: Scenario) {
  try {
    localStorage.setItem(key, JSON.stringify(scenario))
  } catch {
    /* best-effort */
  }
}

export function loadSavedScenarios(key: string): SavedScenario[] {
  try {
    const raw = localStorage.getItem(key)
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
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* best-effort */
  }
}
