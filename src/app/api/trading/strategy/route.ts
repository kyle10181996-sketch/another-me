import { NextResponse } from "next/server";
import { tradingErrorResponse } from "@/lib/trading/http";
import { distillAndBacktest, runActiveStrategy, setStrategyStatus } from "@/lib/trading/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "distill") {
      const { result, state } = await distillAndBacktest();
      return NextResponse.json({ result, state });
    }

    if ((body.action === "activate" || body.action === "retire") && typeof body.strategyId === "string") {
      const { state } = await setStrategyStatus(body.strategyId, body.action === "activate" ? "active" : "retired");
      return NextResponse.json({ state });
    }

    if (body.action === "run") {
      const { state, result } = await runActiveStrategy();
      return NextResponse.json({ state, ...result });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return tradingErrorResponse(error);
  }
}
