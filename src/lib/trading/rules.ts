// A-share market rules used by the simulator. Kept in one place so they are easy to audit and update.
import type { Board, Side, TradeFees } from "@/lib/trading/types";

export const FEE_RULES = {
  commissionRate: 0.00025, // 0.025%, typical retail broker rate
  minCommission: 5, // CNY per order
  stampDutyRate: 0.0005, // 0.05%, sell side only (since 2023-08-28)
  transferFeeRate: 0.00001, // 0.001%, both sides
};

export const DEFAULT_INITIAL_CASH = 1_000_000;

export class TradingRuleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const symbolPattern = /^(sh|sz|bj)\d{6}$/;

// Accepts "600519", "sh600519", "SH600519", "600519.SH" and returns "sh600519".
export function normalizeSymbol(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (symbolPattern.test(raw)) return raw;

  const suffix = raw.match(/^(\d{6})\.(sh|sz|bj)$/);
  if (suffix) return `${suffix[2]}${suffix[1]}`;

  if (!/^\d{6}$/.test(raw)) return null;
  if (/^(60|68|90)/.test(raw)) return `sh${raw}`;
  if (/^(00|30|20)/.test(raw)) return `sz${raw}`;
  if (/^(4|8|92)/.test(raw)) return `bj${raw}`;
  return null;
}

export function boardOf(symbol: string): Board {
  const code = symbol.slice(2);
  if (symbol.startsWith("bj")) return "bse";
  if (code.startsWith("688") || code.startsWith("689")) return "star";
  if (code.startsWith("300") || code.startsWith("301")) return "chinext";
  return "main";
}

export function boardLabel(board: Board) {
  return { main: "Main Board", chinext: "ChiNext", star: "STAR Market", bse: "Beijing SE" }[board];
}

// Daily price limit as a fraction. Live quotes provide exact limit prices; this table is used for mock data and backtests.
export function priceLimitPct(board: Board, isSt: boolean) {
  if (board === "chinext" || board === "star") return 0.2;
  if (board === "bse") return 0.3;
  return isSt ? 0.05 : 0.1;
}

export function roundPrice(value: number) {
  return Math.round(value * 100) / 100;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function limitPrices(prevClose: number, board: Board, isSt: boolean) {
  const pct = priceLimitPct(board, isSt);
  return {
    limitUp: roundPrice(prevClose * (1 + pct)),
    limitDown: roundPrice(prevClose * (1 - pct)),
  };
}

export function calculateFees(side: Side, amount: number): TradeFees {
  const commission = roundMoney(Math.max(amount * FEE_RULES.commissionRate, FEE_RULES.minCommission));
  const stampDuty = side === "sell" ? roundMoney(amount * FEE_RULES.stampDutyRate) : 0;
  const transferFee = roundMoney(amount * FEE_RULES.transferFeeRate);
  return {
    commission,
    stampDuty,
    transferFee,
    total: roundMoney(commission + stampDuty + transferFee),
  };
}

// Lot-size rules. Returns an error message, or null when the quantity is valid.
export function validateQuantity(symbol: string, side: Side, quantity: number, sellableQuantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return "Quantity must be a positive whole number of shares.";

  const board = boardOf(symbol);

  if (side === "buy") {
    if (board === "star") return quantity >= 200 ? null : "STAR Market buys need at least 200 shares.";
    if (board === "bse") return quantity >= 100 ? null : "Beijing SE buys need at least 100 shares.";
    return quantity % 100 === 0 ? null : "Buys must be in lots of 100 shares.";
  }

  if (quantity > sellableQuantity) {
    return `Only ${sellableQuantity} shares are sellable today (T+1: shares bought today can be sold from the next trading day).`;
  }
  if (quantity === sellableQuantity) return null; // odd lots must be sold all at once, which this is
  if (board === "star") return quantity >= 200 ? null : "STAR Market sells need at least 200 shares unless you sell the whole position.";
  if (board === "bse") return quantity >= 100 ? null : "Beijing SE sells need at least 100 shares unless you sell the whole position.";
  return quantity % 100 === 0 ? null : "Sells must be in lots of 100 shares unless you sell the whole position.";
}

export function minBuyLot(symbol: string) {
  return boardOf(symbol) === "star" ? 200 : 100;
}

// Round a desired share count down to a valid buy size.
export function roundDownToLot(symbol: string, shares: number) {
  const board = boardOf(symbol);
  if (board === "star" || board === "bse") {
    const whole = Math.floor(shares);
    return whole >= minBuyLot(symbol) ? whole : 0;
  }
  return Math.floor(shares / 100) * 100;
}

const shanghaiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hour12: false,
});

export function shanghaiClock(date: Date) {
  const parts = Object.fromEntries(shanghaiFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour) % 24;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
    weekday: parts.weekday,
  };
}

export function shanghaiDate(date: Date) {
  return shanghaiClock(date).date;
}

// Continuous auction sessions: 09:30-11:30 and 13:00-15:00, Monday to Friday (Asia/Shanghai).
// Exchange holidays are detected separately by checking that the live quote belongs to today.
export function isWithinTradingSession(date: Date) {
  const clock = shanghaiClock(date);
  if (clock.weekday === "Sat" || clock.weekday === "Sun") return false;
  const m = clock.minutes;
  return (m >= 9 * 60 + 30 && m <= 11 * 60 + 30) || (m >= 13 * 60 && m <= 15 * 60);
}

export function daysBetween(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.max(0, Math.round((to - from) / 86_400_000));
}
