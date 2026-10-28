import { NextResponse } from "next/server";
import { tradingErrorResponse } from "@/lib/trading/http";
import { resetAccounts, updateSettings } from "@/lib/trading/service";
import { readTradingState } from "@/lib/trading/store";

export async function GET() {
  return NextResponse.json(await readTradingState());
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { state } = await updateSettings({ watchlist: body.watchlist, settings: body.settings });
    return NextResponse.json(state);
  } catch (error) {
    return tradingErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action !== "reset") return NextResponse.json({ error: "未知操作。" }, { status: 400 });
    const { state } = await resetAccounts(body.initialCash);
    return NextResponse.json(state);
  } catch (error) {
    return tradingErrorResponse(error);
  }
}
