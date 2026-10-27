import { NextResponse } from "next/server";
import { MarketDataError } from "@/lib/trading/market-data";
import { TradingRuleError } from "@/lib/trading/rules";

// Maps simulator errors to HTTP responses without leaking internals or user data into logs.
export function tradingErrorResponse(error: unknown) {
  if (error instanceof TradingRuleError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof MarketDataError || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))) {
    return NextResponse.json({ error: "Market data is unavailable right now. Check your network, or switch to mock data in Settings.", code: "MARKET_DATA" }, { status: 502 });
  }
  if (error instanceof TypeError) {
    return NextResponse.json({ error: "Could not reach the market data service.", code: "MARKET_DATA" }, { status: 502 });
  }
  return NextResponse.json({ error: "Something went wrong in the simulator.", code: "UNKNOWN" }, { status: 500 });
}
