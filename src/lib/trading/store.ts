// Server-side persistence for the trading simulator: one JSON file in the app's local data directory.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory } from "@/lib/local-file-store";
import { defaultUserId } from "@/lib/storage";
import { createInitialTradingState } from "@/lib/trading/engine";
import type { TradingState } from "@/lib/trading/types";

const tradingStatePath = path.join(dataDirectory, "trading-state.json");

function normalize(value: unknown): TradingState {
  const fallback = createInitialTradingState(defaultUserId);
  if (!value || typeof value !== "object") return fallback;
  const state = value as Partial<TradingState>;
  const accounts = Array.isArray(state.accounts) ? state.accounts : [];

  return {
    userId: typeof state.userId === "string" ? state.userId : fallback.userId,
    accounts: fallback.accounts.map((account) => accounts.find((item) => item.id === account.id) ?? account),
    trades: Array.isArray(state.trades) ? state.trades : [],
    reviews: Array.isArray(state.reviews) ? state.reviews : [],
    strategies: Array.isArray(state.strategies) ? state.strategies : [],
    strategyLog: Array.isArray(state.strategyLog) ? state.strategyLog : [],
    analyses: Array.isArray(state.analyses) ? state.analyses : [],
    watchlist: Array.isArray(state.watchlist) ? state.watchlist : fallback.watchlist,
    settings: { ...fallback.settings, ...(state.settings ?? {}) },
  };
}

export async function readTradingState(): Promise<TradingState> {
  try {
    return normalize(JSON.parse(await readFile(tradingStatePath, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return normalize(null);
    throw error;
  }
}

async function writeTradingState(state: TradingState) {
  await mkdir(dataDirectory, { recursive: true });
  const tempPath = `${tradingStatePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, tradingStatePath);
}

let queue: Promise<unknown> = Promise.resolve();

// Serializes read-modify-write cycles so a manual order and a strategy run cannot overwrite each other.
export function updateTradingState<T>(mutate: (state: TradingState) => Promise<{ state: TradingState; result: T }>): Promise<{ state: TradingState; result: T }> {
  const run = queue.then(async () => {
    const current = await readTradingState();
    const { state, result } = await mutate(current);
    if (state !== current) await writeTradingState(state);
    return { state, result };
  });
  queue = run.catch(() => undefined);
  return run;
}
