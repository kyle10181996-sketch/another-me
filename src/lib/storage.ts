import type { AppState } from "@/lib/types";

export const defaultUserId = "local-user";

export const initialState: AppState = {
  dailyLogs: [],
  decisions: [],
  memories: [],
  simulations: [],
};

const storageKey = "another-me-state-v1";

function normalizeState(value: unknown): AppState {
  if (!value || typeof value !== "object") return initialState;

  const state = value as Partial<AppState>;
  return {
    dailyLogs: Array.isArray(state.dailyLogs) ? state.dailyLogs : [],
    decisions: Array.isArray(state.decisions) ? state.decisions : [],
    memories: Array.isArray(state.memories) ? state.memories : [],
    simulations: Array.isArray(state.simulations) ? state.simulations : [],
  };
}

function isEmptyState(state: AppState) {
  return state.dailyLogs.length === 0 && state.decisions.length === 0 && state.memories.length === 0 && state.simulations.length === 0;
}

function loadLegacyBrowserState(): AppState | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadState(): Promise<AppState> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) return initialState;

  const serverState = normalizeState(await response.json());
  const legacyState = loadLegacyBrowserState();

  if (legacyState && isEmptyState(serverState) && !isEmptyState(legacyState)) {
    await saveState(legacyState);
    window.localStorage.removeItem(storageKey);
    return legacyState;
  }

  return serverState;
}

export async function saveState(state: AppState): Promise<void> {
  await fetch("/api/state", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(normalizeState(state)),
  });
}
