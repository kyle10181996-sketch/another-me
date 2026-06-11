import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppState, LocalSettings, PublicSettings } from "@/lib/types";
import { initialState } from "@/lib/storage";

const dataDirectory = process.env.ANOTHER_ME_DATA_DIR || path.join(process.cwd(), "data");
const statePath = path.join(dataDirectory, "another-me-state.json");
const settingsPath = path.join(dataDirectory, "settings.json");

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

export async function readLocalState(): Promise<AppState> {
  try {
    const raw = await readFile(statePath, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return initialState;
    }

    throw error;
  }
}

export async function writeLocalState(state: AppState): Promise<void> {
  await mkdir(dataDirectory, { recursive: true });
  const tempPath = `${statePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
  await rename(tempPath, statePath);
}

function normalizeSettings(value: unknown): LocalSettings {
  if (!value || typeof value !== "object") {
    return { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
  }

  const settings = value as Partial<LocalSettings>;
  return {
    apiKey: typeof settings.apiKey === "string" && settings.apiKey.trim() ? settings.apiKey.trim() : undefined,
    baseUrl: typeof settings.baseUrl === "string" && settings.baseUrl.trim() ? settings.baseUrl.trim().replace(/\/+$/, "") : "https://api.openai.com/v1",
    model: typeof settings.model === "string" && settings.model.trim() ? settings.model.trim() : "gpt-4.1-mini",
    updatedAt: typeof settings.updatedAt === "string" ? settings.updatedAt : undefined,
  };
}

function maskApiKey(apiKey: string) {
  if (apiKey.length <= 12) return "已保存";
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}

export function toPublicSettings(settings: LocalSettings): PublicSettings {
  return {
    hasApiKey: Boolean(settings.apiKey),
    maskedApiKey: settings.apiKey ? maskApiKey(settings.apiKey) : undefined,
    baseUrl: settings.baseUrl,
    model: settings.model,
    updatedAt: settings.updatedAt,
  };
}

export async function readLocalSettings(): Promise<LocalSettings> {
  try {
    const raw = await readFile(settingsPath, "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" };
    }

    throw error;
  }
}

export async function writeLocalSettings(settings: LocalSettings): Promise<PublicSettings> {
  await mkdir(dataDirectory, { recursive: true });
  const normalized = normalizeSettings({ ...settings, updatedAt: new Date().toISOString() });
  const tempPath = `${settingsPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await rename(tempPath, settingsPath);
  return toPublicSettings(normalized);
}
