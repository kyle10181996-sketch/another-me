import type { Metadata } from "next";
import { TradingApp } from "@/components/trading/TradingApp";

export const metadata: Metadata = {
  title: "A 股模拟交易 · AnotherMe",
  description: "用虚拟资金模拟 A 股交易，记录每一次决策，并把自己的盈利模式蒸馏成规则化策略。",
};

export default function TradingPage() {
  return <TradingApp />;
}
