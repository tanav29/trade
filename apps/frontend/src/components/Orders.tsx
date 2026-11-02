"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives";
import { Button } from "@/components/primitives";
import { Loader2, RefreshCcw, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import type { UserOrder } from "@/types";

type OrdersResponse = {
  ok: boolean;
  data?: {
    asks: UserOrder[];
    bids: UserOrder[];
  };
};

type CancelOrderResponse = {
  ok: boolean;
  msg?: string;
  error?: string;
};

interface Props {
  symbol: string;
}

export default function Orders({ symbol }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery<OrdersResponse>({
    queryKey: ["myorders", symbol],
    queryFn: async () =>
      await api<OrdersResponse>(`/trade/myorders?symbol=${symbol}`),
    refetchOnWindowFocus: true,
    retry: false,
  });

  const cancelOrder = useMutation({
    mutationFn: async ({
      orderId,
      side,
      symbol: sym,
    }: {
      orderId: string;
      side: string;
      symbol: string;
    }) =>
      await api<CancelOrderResponse>("/trade/cancelorder", {
        method: "POST",
        body: JSON.stringify({ orderId, side, symbol: sym }),
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Order cancelled successfully!");
        void queryClient.invalidateQueries({ queryKey: ["myorders"] });
        void queryClient.invalidateQueries({ queryKey: ["depth"] });
        void queryClient.invalidateQueries({ queryKey: ["order-history"] });
        void queryClient.invalidateQueries({ queryKey: ["user_info"] });
      } else {
        toast.info(res.msg);
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to cancel order.",
      );
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">My Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  const orders = data?.data;
  const hasOrders =
    orders && (orders.asks.length > 0 || orders.bids.length > 0);

  return (
    <Card className="shadow-md border-0 w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          Active Orders — {symbol}
          <Button
            onClick={() => refetch()}
            variant="ghost"
            size="icon"
            disabled={isFetching}
          >
            <RefreshCcw className={isFetching ? "animate-spin" : ""} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasOrders ? (
          <div className="text-muted-foreground text-sm">No active orders.</div>
        ) : (
          <div className="space-y-3">
            {orders?.bids.map((order) => (
              <div
                key={order.orderId}
                className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded">
                    BUY
                  </span>
                  <Button
                    onClick={() =>
                      cancelOrder.mutate({
                        orderId: order.orderId,
                        side: "bid",
                        symbol,
                      })
                    }
                    variant="outline"
                    size="sm"
                    disabled={cancelOrder.isPending}
                  >
                    <X className="w-4 h-4" /> Close Order
                  </Button>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Qty: {order.quantity}
                  </span>
                  <span className="font-mono font-medium">
                    ${order.price.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
            {orders?.asks.map((order) => (
              <div
                key={order.orderId}
                className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900 px-2 py-0.5 rounded">
                    SELL
                  </span>
                  <Button
                    onClick={() =>
                      cancelOrder.mutate({
                        orderId: order.orderId,
                        side: "ask",
                        symbol,
                      })
                    }
                    variant="outline"
                    size="sm"
                    disabled={cancelOrder.isPending}
                  >
                    <X className="w-4 h-4" /> Close Order
                  </Button>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Qty: {order.quantity}
                  </span>
                  <span className="font-mono font-medium">
                    ${order.price.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
