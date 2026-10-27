import { NextResponse } from "next/server";
import { tradingErrorResponse } from "@/lib/trading/http";
import { placeManualOrder } from "@/lib/trading/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { state, result } = await placeManualOrder({ symbol: body.symbol, side: body.side, quantity: body.quantity, journal: body.journal });
    return NextResponse.json({ state, ...result });
  } catch (error) {
    return tradingErrorResponse(error);
  }
}
