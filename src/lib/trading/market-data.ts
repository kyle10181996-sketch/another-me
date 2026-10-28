// Server-side market data. Live data comes from Tencent's public quote endpoints (unofficial, may change or be delayed).
// The mock source generates deterministic fake prices so the simulator can be used offline; it is always labeled "mock".
import { boardOf, limitPrices, roundPrice, shanghaiClock, shanghaiDate } from "@/lib/trading/rules";
import type { Bar, DataSource, Quote } from "@/lib/trading/types";

const TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q=";
const TENCENT_KLINE_URL = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=";

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function num(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTencentTime(value: string) {
  // yyyyMMddHHmmss in Asia/Shanghai
  if (!/^\d{14}$/.test(value)) return { iso: new Date().toISOString(), date: shanghaiDate(new Date()) };
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const iso = new Date(`${date}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+08:00`).toISOString();
  return { iso, date };
}

function parseTencentLine(symbol: string, payload: string): Quote | null {
  const fields = payload.split("~");
  if (fields.length < 49 || !fields[1]) return null;

  const name = fields[1];
  const price = num(fields[3]);
  const prevClose = num(fields[4]);
  const open = num(fields[5]);
  const time = parseTencentTime(fields[30]);
  const isSt = /ST/i.test(name);
  const fallbackLimits = limitPrices(prevClose, boardOf(symbol), isSt);

  return {
    symbol,
    code: fields[2],
    name,
    price: price || prevClose,
    prevClose,
    open,
    high: num(fields[33]),
    low: num(fields[34]),
    bid1: num(fields[9]),
    ask1: num(fields[19]),
    volume: num(fields[6]),
    amount: num(fields[37]) * 10_000,
    limitUp: num(fields[47]) || fallbackLimits.limitUp,
    limitDown: num(fields[48]) || fallbackLimits.limitDown,
    changePct: num(fields[32]),
    quoteTime: time.iso,
    tradeDate: time.date,
    isSt,
    suspended: open === 0 && num(fields[6]) === 0,
    source: "tencent",
  };
}

async function fetchTencentQuotes(symbols: string[]): Promise<Quote[]> {
  const response = await fetch(`${TENCENT_QUOTE_URL}${symbols.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new MarketDataError(`行情服务返回 ${response.status}。`);

  const text = new TextDecoder("gbk").decode(await response.arrayBuffer());
  const quotes: Quote[] = [];

  for (const match of text.matchAll(/v_(\w+)="([^"]*)"/g)) {
    const quote = parseTencentLine(match[1], match[2]);
    if (quote) quotes.push(quote);
  }

  return quotes;
}

async function fetchTencentBars(symbol: string, count: number): Promise<Bar[]> {
  const response = await fetch(`${TENCENT_KLINE_URL}${symbol},day,,,${count},qfq`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new MarketDataError(`K 线服务返回 ${response.status}。`);

  const data = await response.json();
  const node = data?.data?.[symbol];
  const rows: unknown[] = node?.qfqday ?? node?.day ?? [];

  return rows
    .filter((row): row is string[] => Array.isArray(row) && row.length >= 6)
    .map((row) => ({
      date: row[0],
      open: num(row[1]),
      close: num(row[2]),
      high: num(row[3]),
      low: num(row[4]),
      volume: num(row[5]),
    }));
}

// ---------- Mock source ----------

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  return hashString(seed) / 4294967295;
}

function recentWeekdays(count: number, end: Date) {
  const days: string[] = [];
  const cursor = new Date(`${shanghaiDate(end)}T00:00:00Z`);
  while (days.length < count) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

function mockBars(symbol: string, count: number, now: Date): Bar[] {
  const days = recentWeekdays(count, now);
  let close = 5 + seededRandom(`${symbol}:base`) * 95;
  const limit = boardOf(symbol) === "main" ? 0.1 : 0.2;

  return days.map((date) => {
    const drift = (seededRandom(`${symbol}:${date}:d`) - 0.5) * 0.08;
    const prev = close;
    const open = roundPrice(prev * (1 + (seededRandom(`${symbol}:${date}:o`) - 0.5) * 0.02));
    close = roundPrice(Math.min(prev * (1 + limit), Math.max(prev * (1 - limit), prev * (1 + drift))));
    const high = roundPrice(Math.max(open, close) * (1 + seededRandom(`${symbol}:${date}:h`) * 0.02));
    const low = roundPrice(Math.min(open, close) * (1 - seededRandom(`${symbol}:${date}:l`) * 0.02));
    const volume = Math.round(50_000 + seededRandom(`${symbol}:${date}:v`) * 200_000);
    return { date, open, close, high, low, volume };
  });
}

function mockQuote(symbol: string, now: Date): Quote {
  const bars = mockBars(symbol, 2, now);
  const today = bars[1];
  const prevClose = bars[0].close;
  const bucket = Math.floor(shanghaiClock(now).minutes / 5);
  const wiggle = (seededRandom(`${symbol}:${today.date}:${bucket}`) - 0.5) * 0.01;
  const { limitUp, limitDown } = limitPrices(prevClose, boardOf(symbol), false);
  const price = roundPrice(Math.min(limitUp, Math.max(limitDown, today.close * (1 + wiggle))));

  return {
    symbol,
    code: symbol.slice(2),
    name: `模拟 ${symbol.slice(2)}`,
    price,
    prevClose,
    open: today.open,
    high: Math.max(today.high, price),
    low: Math.min(today.low, price),
    bid1: roundPrice(price - 0.01),
    ask1: roundPrice(price + 0.01),
    volume: today.volume,
    amount: today.volume * price * 100,
    limitUp,
    limitDown,
    changePct: Math.round(((price - prevClose) / prevClose) * 10_000) / 100,
    quoteTime: now.toISOString(),
    tradeDate: today.date,
    isSt: false,
    suspended: false,
    source: "mock",
  };
}

// ---------- Public API ----------

export async function getQuotes(symbols: string[], source: DataSource, now = new Date()): Promise<Quote[]> {
  const unique = [...new Set(symbols)].slice(0, 60);
  if (unique.length === 0) return [];
  if (source === "mock") return unique.map((symbol) => mockQuote(symbol, now));
  return fetchTencentQuotes(unique);
}

export async function getQuote(symbol: string, source: DataSource, now = new Date()): Promise<Quote> {
  const [quote] = await getQuotes([symbol], source, now);
  if (!quote) throw new MarketDataError(`找不到 ${symbol} 的行情，请检查股票代码。`);
  return quote;
}

export async function getDailyBars(symbol: string, source: DataSource, count = 120, now = new Date()): Promise<Bar[]> {
  if (source === "mock") return mockBars(symbol, count, now);
  return fetchTencentBars(symbol, count);
}
