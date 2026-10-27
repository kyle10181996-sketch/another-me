import { NextResponse } from "next/server";
import { tradingErrorResponse } from "@/lib/trading/http";
import { lookupQuotes } from "@/lib/trading/service";

export async function GET(request: Request) {
  try {
    const symbols = (new URL(request.url).searchParams.get("symbols") ?? "").split(",").filter(Boolean);
    return NextResponse.json({ quotes: await lookupQuotes(symbols) });
  } catch (error) {
    return tradingErrorResponse(error);
  }
}
