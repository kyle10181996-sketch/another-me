import { NextResponse } from "next/server";
import { tradingErrorResponse } from "@/lib/trading/http";
import { analyzePortfolio } from "@/lib/trading/service";

// POST /api/trading/analyze { question? } — whole-portfolio coaching analysis (AI when configured, rule-based otherwise).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ analysis: await analyzePortfolio(body.question) });
  } catch (error) {
    return tradingErrorResponse(error);
  }
}
