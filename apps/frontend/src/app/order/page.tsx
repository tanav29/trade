"use client";

import Orders from "@/components/Orders";
import OrderHistory from "@/components/OrderHistory";
import Depth from "@/components/Depth";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SymbolInfo } from "@/types";

export default function OrderPage() {
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
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Orders</h1>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm font-mono"
        >
          {symbols.map((s) => (
            <option key={s.symbol} value={s.symbol}>
              {s.symbol}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-4 flex-col lg:flex-row">
        <div className="flex-1 space-y-4">
          <Orders symbol={symbol} />
          <OrderHistory symbol={symbol} />
        </div>
        <div className="w-full lg:w-96">
          <Depth symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
