import { NextResponse } from "next/server";
import { packetToMarkdown } from "@/lib/trading/analysis-packet";
import { tradingErrorResponse } from "@/lib/trading/http";
import { getAnalysisPacket } from "@/lib/trading/service";

// GET /api/trading/export?format=md|json — analysis-ready snapshot of the user's simulated trading.
export async function GET(request: Request) {
  try {
    const format = new URL(request.url).searchParams.get("format");
    const packet = await getAnalysisPacket();
    if (format === "json") return NextResponse.json(packet);
    return new NextResponse(packetToMarkdown(packet), {
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return tradingErrorResponse(error);
  }
}
