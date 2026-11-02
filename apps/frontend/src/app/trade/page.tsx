"use client";

import Chart from "@/components/Chart";
import MakeOrder from "@/components/MakeOrder";
import Depth from "@/components/Depth";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SymbolInfo } from "@/types";

export default function TradePage() {
  const [selectedSymbol, setSymbol] = useState("");

  const { data: symbols, isLoading, isError } = useQuery({
    queryKey: ["symbols"],
    queryFn: async () => await api<SymbolInfo[]>("/symbols"),
  });

  if (isLoading) return <div className="px-4 py-6">Loading stocks...</div>;
  if (isError) return <div className="px-4 py-6">Could not load stocks. Please try again.</div>;
  if (!symbols?.length) return <div className="px-4 py-6">No stocks are listed yet. An administrator can add one from the admin page.</div>;

  const symbol = symbols.some((s) => s.symbol === selectedSymbol)
    ? selectedSymbol
    : symbols[0]!.symbol;

  return (
    <div className="px-2 py-6">
      <div className="mb-4">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-card border border-border rounded-lg px-4 py-2 text-lg font-bold font-mono"
        >
          {symbols.map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.symbol} — {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 flex-col lg:flex-row">
        <div className="flex-1 min-w-0">
          <Chart symbol={symbol} />
        </div>
        <div className="w-full lg:w-96 flex flex-col gap-2 h-full">
          <MakeOrder symbol={symbol} />
          <Depth symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
