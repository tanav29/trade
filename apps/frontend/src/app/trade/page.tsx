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

  const selected = symbols.find((s) => s.symbol === symbol);

  return (
    <main className="mx-auto max-w-[1800px] px-3 py-5 sm:px-6 terminal">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-medium text-slate-400">Markets</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Trading desk</h1>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="market-symbol" className="text-xs font-medium text-slate-400">Market</label>
          <select id="market-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} className="min-w-56 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100">
            {symbols.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} &mdash; {s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 px-5 py-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-blue-950 text-sm font-bold text-blue-300">{symbol.slice(0, 2)}</span>
        <div><p className="font-semibold text-slate-100">{symbol}</p><p className="text-xs text-slate-400">{selected?.name}</p></div>
        <span className="ml-auto text-xs font-medium text-slate-400">Equity market</span>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3"><Chart symbol={symbol} /><Depth symbol={symbol} /></div>
        <MakeOrder symbol={symbol} />
      </div>
    </main>
  );
}
