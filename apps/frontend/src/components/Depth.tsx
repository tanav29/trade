"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/primitives";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Orderbook } from "@/types";
import { useMarketStream } from "@/hooks/useMarketStream";

type DepthResponse = {
  ok: boolean;
  data?: Orderbook;
  error?: string;
};

interface Props {
  symbol: string;
}

const Depth = ({ symbol }: Props) => {
  useMarketStream(symbol);

  const { data: orderBook } = useQuery({
    queryKey: ["depth", symbol],
    queryFn: async () => {
      const res = await api<DepthResponse>(`/trade/depth?symbol=${symbol}`);
      return (
        res.data ?? {
          asks: [],
          bids: [],
          symbol,
        }
      );
    },
    // SSE keeps this fresh; long interval is a safety net only
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const topBids = useMemo(
    () => orderBook?.bids?.slice(0, 6) || [],
    [orderBook],
  );
  const topAsks = useMemo(
    () => orderBook?.asks?.slice(0, 6) || [],
    [orderBook],
  );

  const bidTotal = useMemo(
    () => topBids.reduce((acc, o) => acc + o.quantity, 0),
    [topBids],
  );
  const askTotal = useMemo(
    () => topAsks.reduce((acc, o) => acc + o.quantity, 0),
    [topAsks],
  );
  const combinedTotal = bidTotal + askTotal || 1;
  const buyPct = (bidTotal / combinedTotal) * 100;
  const sellPct = (askTotal / combinedTotal) * 100;

  const maxBidQty = useMemo(
    () => (topBids.length ? Math.max(...topBids.map((o) => o.quantity)) : 1),
    [topBids],
  );
  const maxAskQty = useMemo(
    () => (topAsks.length ? Math.max(...topAsks.map((o) => o.quantity)) : 1),
    [topAsks],
  );

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between text-xs">
          <div className="flex flex-col">
            <span className="text-xl leading-none font-bold text-green-600 dark:text-green-500">
              {buyPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-xl leading-none font-bold text-red-600 dark:text-red-500">
              {sellPct.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="mt-2 h-2 w-full rounded-full overflow-hidden flex shadow-inner">
          <div
            className="bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
            style={{ width: `${buyPct}%` }}
          />
          <div
            className="bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500"
            style={{ width: `${sellPct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="text-xs leading-tight">
          <table className="w-full border-separate">
            <thead>
              <tr className="text-xs font-medium">
                <th className="px-2 text-left text-muted-foreground w-[120px]">
                  Bid price
                </th>
                <th className="px-2 text-left text-muted-foreground w-[90px]">
                  Qty
                </th>
                <th className="px-2" />
                <th className="px-2 text-left text-muted-foreground w-[120px]">
                  Ask price
                </th>
                <th className="px-2 text-left text-muted-foreground w-[90px]">
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => {
                const bid = topBids[i];
                const ask = topAsks[i];
                const bidWidth = bid ? (bid.quantity / maxBidQty) * 100 : 0;
                const askWidth = ask ? (ask.quantity / maxAskQty) * 100 : 0;
                return (
                  <tr
                    key={i}
                    className="align-middle group hover:bg-muted/30 transition-colors h-6"
                  >
                    <td className="px-2 py-1.5 font-medium">
                      {bid ? `$${bid.price}` : ""}
                    </td>
                    <td className="px-2 py-1.5 relative text-green-600 dark:text-green-400 font-semibold">
                      {bid && (
                        <>
                          <div
                            className="absolute inset-y-0 left-0 rounded bg-green-500/10 group-hover:bg-green-500/20 transition-colors"
                            style={{ width: `${bidWidth}%` }}
                          />
                          <span className="relative z-10">{bid.quantity}</span>
                        </>
                      )}
                    </td>
                    <td className="w-px">
                      <div className="h-full w-px bg-border mx-auto" />
                    </td>
                    <td className="px-2 py-1.5 font-medium">
                      {ask ? `$${ask.price}` : ""}
                    </td>
                    <td className="px-2 py-1.5 relative text-red-600 dark:text-red-400 font-semibold">
                      {ask && (
                        <>
                          <div
                            className="absolute inset-y-0 right-0 rounded bg-red-500/10 group-hover:bg-red-500/20 transition-colors"
                            style={{ width: `${askWidth}%` }}
                          />
                          <span className="relative z-10">{ask.quantity}</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-xs font-medium">
                <td className="px-2 pt-2 text-muted-foreground">Bid total</td>
                <td className="px-2 pt-2 text-green-600 dark:text-green-500 font-bold">
                  {bidTotal}
                </td>
                <td />
                <td className="px-2 pt-2 text-muted-foreground">Ask total</td>
                <td className="px-2 pt-2 text-red-600 dark:text-red-500 font-bold">
                  {askTotal}
                </td>
              </tr>
            </tfoot>
          </table>
          {orderBook && bidTotal === 0 && askTotal === 0 && <p className="mt-4 text-center text-xs text-muted-foreground">No open orders for {symbol}.</p>}
          {!orderBook && (
            <div className="text-center text-xs text-muted-foreground mt-4">
              Loading depth…
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default Depth;
