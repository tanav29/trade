"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User, SymbolInfo } from "@/types";

const money = (value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Profile() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({ queryKey: ["user_info"], queryFn: () => api<User>("/user"), retry: false });
  const { data: listed } = useQuery({ queryKey: ["symbols"], queryFn: () => api<SymbolInfo[]>("/symbols") });
  const holdings = data?.portfolio.filter(p => Number(p.quantity) > 0) ?? [];
  const symbols = holdings.map(p => p.symbol);
  const { data: prices, isLoading: loadingPrices } = useQuery({
    queryKey: ["portfolio_prices", symbols], enabled: symbols.length > 0,
    queryFn: async () => Object.fromEntries(await Promise.all(symbols.map(async symbol => {
      try {
        const candles = await api<{ close: number }[]>(`/trade/chart?symbol=${encodeURIComponent(symbol)}`);
        return [symbol, candles.at(-1)?.close ?? null];
      } catch { return [symbol, null]; }
    }))),
    refetchInterval: 30000,
  });
  if (isLoading) return <div className="p-8 text-muted-foreground">Loading portfolio?</div>;
  if (isError || !data) return <div className="p-8">Sign in to view your portfolio.</div>;
  const missing = holdings.some(p => prices?.[p.symbol] == null);
  const value = holdings.reduce((sum, p) => sum + p.quantity * (prices?.[p.symbol] ?? 0), 0);
  return <main className="max-w-6xl mx-auto py-6 space-y-8">
    <div className="flex flex-wrap justify-between items-end gap-4"><div><p className="text-muted-foreground text-sm">{data.name}</p><h1 className="text-3xl font-semibold mt-1">Portfolio</h1></div><button onClick={() => refetch()} disabled={isFetching} className="text-sm border rounded px-3 py-2">{isFetching ? "Refreshing?" : "Refresh balances"}</button></div>
    <section className="grid gap-5 sm:grid-cols-3 border-y py-6">
      <div><p className="text-sm text-muted-foreground">Available cash</p><p className="text-2xl font-semibold tabular-nums mt-2">{money(Number(data.cash))}</p></div>
      <div><p className="text-sm text-muted-foreground">Holdings value{missing ? " (partial)" : ""}</p><p className="text-2xl font-semibold tabular-nums mt-2">{loadingPrices ? "?" : money(value)}</p></div>
      <div><p className="text-sm text-muted-foreground">Available account value{missing ? " (partial)" : ""}</p><p className="text-2xl font-semibold tabular-nums mt-2">{loadingPrices ? "?" : money(Number(data.cash) + value)}</p></div>
    </section>
    <section><div className="flex items-baseline justify-between mb-4"><div><h2 className="text-xl font-semibold">Holdings <span className="text-muted-foreground text-sm font-normal">({holdings.length})</span></h2><p className="text-sm text-muted-foreground mt-1">Available shares valued at the last traded price.</p></div><Link href="/trade" className="text-sm text-primary">Trade stocks</Link></div>
      <div className="overflow-x-auto border rounded-lg"><table className="w-full text-sm text-left min-w-[560px]"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-4 font-medium">Stock</th><th className="p-4 font-medium text-right">Available qty.</th><th className="p-4 font-medium text-right">Last price</th><th className="p-4 font-medium text-right">Current value</th></tr></thead><tbody className="divide-y">{holdings.map(p => { const price = prices?.[p.symbol]; return <tr key={p.symbol}><td className="p-4"><div className="font-semibold">{p.symbol}</div><div className="text-xs text-muted-foreground mt-1">{listed?.find(s => s.symbol === p.symbol)?.name}</div></td><td className="p-4 text-right tabular-nums">{p.quantity.toLocaleString()}</td><td className="p-4 text-right tabular-nums">{price == null ? "?" : money(price)}</td><td className="p-4 text-right font-medium tabular-nums">{price == null ? "?" : money(price * p.quantity)}</td></tr>; })}</tbody></table>{!holdings.length && <div className="p-8 text-center text-sm text-muted-foreground">No available shares yet. Visit Trade to place an order.</div>}</div>
      <p className="text-xs text-muted-foreground mt-3">Cash and shares reserved for open orders are excluded. A dash means no trade price is available.</p>
    </section>
  </main>;
}
