import { NextResponse } from "next/server";
import { MarketDataError } from "@/lib/trading/market-data";
import { TradingRuleError } from "@/lib/trading/rules";

// Maps simulator errors to HTTP responses without leaking internals or user data into logs.
export function tradingErrorResponse(error: unknown) {
  if (error instanceof TradingRuleError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof MarketDataError || (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))) {
    return NextResponse.json({ error: "暂时获取不到行情。请检查网络，或在「设置」里切换到模拟行情。", code: "MARKET_DATA" }, { status: 502 });
  }
  if (error instanceof TypeError) {
    return NextResponse.json({ error: "无法连接行情服务。", code: "MARKET_DATA" }, { status: 502 });
  }
  return NextResponse.json({ error: "模拟器出错了。", code: "UNKNOWN" }, { status: 500 });
}
