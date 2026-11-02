"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeMarketStream } from "@/lib/sse";
import type { Orderbook } from "@/types";

/**
 * Subscribe to live depth + chart updates for a symbol via SSE.
 * Multiple components share one EventSource per symbol (ref-counted).
 */
export function useMarketStream(symbol: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!symbol) return;

    return subscribeMarketStream(symbol, {
      onDepth: (payload) => {
        const data = payload as Orderbook;
        if (!data?.asks || !data?.bids) return;
        queryClient.setQueryData(["depth", symbol], {
          symbol: data.symbol || symbol,
          asks: data.asks,
          bids: data.bids,
        });
      },

    });
  }, [queryClient, symbol]);
}
