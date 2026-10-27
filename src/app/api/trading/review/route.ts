import { NextResponse } from "next/server";
import { tradingErrorResponse } from "@/lib/trading/http";
import { aiReviewTrade } from "@/lib/trading/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.tradeId !== "string") return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
    return NextResponse.json(await aiReviewTrade(body.tradeId));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AI_")) {
      return NextResponse.json({ provider: "local", review: null, error: "AI review failed; the rule-based review is still available." });
    }
    return tradingErrorResponse(error);
  }
}
