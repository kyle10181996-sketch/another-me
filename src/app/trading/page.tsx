import type { Metadata } from "next";
import { TradingApp } from "@/components/trading/TradingApp";

export const metadata: Metadata = {
  title: "A-Share Simulator · AnotherMe",
  description: "Paper-trade A-shares, journal every decision, and distill your own profitable patterns into a rule-based strategy.",
};

export default function TradingPage() {
  return <TradingApp />;
}
