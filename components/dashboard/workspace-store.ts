import type { SavedWorkflow } from "./types";

/**
 * Small subscription stores for the two pieces of workspace state that live in
 * localStorage. They are read through `useSyncExternalStore`, which keeps the
 * server render and the first client render identical and then re-renders with
 * the stored values after hydration.
 */

/* ---------------- workflow library ---------------- */

const WORKFLOW_KEY = "netmoni-workflows-v1";
const EMPTY_WORKFLOWS: SavedWorkflow[] = [];

let workflowSnapshot: SavedWorkflow[] | null = null;
const workflowListeners = new Set<() => void>();

function readWorkflows(): SavedWorkflow[] {
  try {
    const raw = window.localStorage.getItem(WORKFLOW_KEY);
    if (!raw) return EMPTY_WORKFLOWS;
    const parsed = JSON.parse(raw) as SavedWorkflow[];
    return Array.isArray(parsed) ? parsed : EMPTY_WORKFLOWS;
  } catch {
    return EMPTY_WORKFLOWS;
  }
}

function emitWorkflows() {
  workflowListeners.forEach((listener) => listener());
}

export function subscribeWorkflows(_listener: () => void) {
  return () => undefined;
}

export function getWorkflowsSnapshot(): SavedWorkflow[] {
  return EMPTY_WORKFLOWS;
}

export function getWorkflowsServerSnapshot(): SavedWorkflow[] {
  return EMPTY_WORKFLOWS;
}

/** Workflow persistence now lives in the NetMoni database through server routes. */
export function saveWorkflows(_next: SavedWorkflow[]) {
  return undefined;
}

/* ---------------- editor theme ---------------- */

type Theme = "dark" | "light";

const THEME_KEY = "network-automation-theme";
const THEME_EVENT = "netmoni-theme-change";

let themeSnapshot: Theme | null = null;
const themeListeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  } catch {
    return "dark";
  }
}

function emitTheme() {
  themeListeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  const onChange = () => {
    themeSnapshot = null;
    emitTheme();
  };
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

export function getThemeSnapshot(): Theme {
  if (themeSnapshot === null) themeSnapshot = readTheme();
  return themeSnapshot;
}

export function getThemeServerSnapshot(): Theme {
  return "dark";
}

/** Writes the theme preference and notifies subscribers. */
export function setThemePreference(theme: Theme) {
  themeSnapshot = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage may be unavailable; the in-memory snapshot still works */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}
