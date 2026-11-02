"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickData, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { subscribeMarketStream } from "@/lib/sse";

export default function Chart({ symbol }: { symbol: string }) {
  const container = useRef<HTMLDivElement>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const last = useRef<CandlestickData | null>(null);
  const [livePrice, setLivePrice] = useState<{ symbol: string; value: number } | null>(null);
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["chart", symbol],
    queryFn: () => api<CandlestickData[]>(`/trade/chart?symbol=${encodeURIComponent(symbol)}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      width: container.current.clientWidth, height: 380,
      layout: { background: { color: "#0f172a" }, textColor: "#94a3b8" },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#334155" },
    });
    series.current = chart.addCandlestickSeries({ upColor: "#19a789", downColor: "#df5b61", borderVisible: false, wickUpColor: "#19a789", wickDownColor: "#df5b61" });
    const observer = new ResizeObserver(() => chart.applyOptions({ width: container.current?.clientWidth || 0 }));
    observer.observe(container.current);
    return () => { observer.disconnect(); chart.remove(); series.current = null; last.current = null; };
  }, [symbol]);

  const price = livePrice?.symbol === symbol ? livePrice.value : data?.at(-1)?.close ?? null;

  useEffect(() => {
    if (!data || !series.current) return;
    series.current.setData(data);
    last.current = data.at(-1) ?? null;
    const history = [...data];
    let changed = false;
    // Subscribe after history has loaded. Only individual trade prices arrive on this stream.
    const unsubscribe = subscribeMarketStream(symbol, { onPrice: (payload) => {
      const tick = payload as { time: number; price: number };
      if (!Number.isFinite(tick.time) || !Number.isFinite(tick.price)) return;
      const previous = last.current;
      if (previous && tick.time < Number(previous.time)) return;
      const candle: CandlestickData = previous && tick.time === Number(previous.time)
        ? { ...previous, high: Math.max(previous.high, tick.price), low: Math.min(previous.low, tick.price), close: tick.price }
        : { time: tick.time as UTCTimestamp, open: tick.price, high: tick.price, low: tick.price, close: tick.price };
      series.current?.update(candle);
      last.current = candle;
      if (history.length && history[history.length - 1].time === candle.time) history[history.length - 1] = candle;
      else history.push(candle);
      changed = true;
      setLivePrice({ symbol, value: tick.price });
    }});
    return () => {
      unsubscribe();
      if (changed) queryClient.setQueryData(["chart", symbol], history.slice(-720));
    };
  }, [data, symbol, queryClient]);

  return <section className="rounded-lg border bg-slate-900 text-slate-100 overflow-hidden">
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
      <div><h2 className="text-lg font-semibold">{symbol}</h2><p className="text-xs text-slate-400">1 minute &middot; Trade price</p></div>
      <div className="text-right"><p className="text-xl font-semibold tabular-nums">{price === null ? "\u2014" : `$${price.toFixed(2)}`}</p><p className="text-xs text-slate-400">Last traded price</p></div>
    </div>
    <div className="relative"><div ref={container} className="w-full h-[380px]" />
      {(isPending || isError || (!data?.length && price === null)) && <p className="absolute inset-0 grid place-items-center pointer-events-none text-sm text-slate-400">{isPending ? "Loading chart?" : isError ? "Could not load chart history." : "No trades yet for this stock."}</p>}
    </div>
  </section>;
}
