"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives";
import { ChevronLeft, ChevronRight, Loader2, RefreshCcw } from "lucide-react";
import type { OrderHistoryEntry, PaginatedResponse } from "@/types";

type HistoryResponse = PaginatedResponse<OrderHistoryEntry> & {
  ok: boolean;
};

const PAGE_SIZE = 10;

const statusStyles: Record<string, string> = {
  filled: "bg-green-500/15 text-green-600 dark:text-green-400",
  cancelled: "bg-muted text-muted-foreground",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  open: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

interface Props {
  symbol?: string;
}

export default function OrderHistory({ symbol }: Props) {
  const [page, setPage] = useState(1);

  const query = symbol
    ? `/trade/order-history?page=${page}&limit=${PAGE_SIZE}&symbol=${symbol}`
    : `/trade/order-history?page=${page}&limit=${PAGE_SIZE}`;

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["order-history", page, symbol ?? "all"],
    queryFn: async () => await api<HistoryResponse>(query),
    placeholderData: (prev) => prev,
    retry: false,
  });

  const rows = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <Card className="shadow-md border-0 w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span>
            Order History
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({total})
              </span>
            )}
          </span>
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
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading...
          </div>
        ) : isError ? (
          <div className="text-destructive text-sm py-4">
            {error instanceof Error
              ? error.message
              : "Failed to load order history."}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground text-sm py-2">
            No closed orders yet.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {rows.map((order) => (
                <div
                  key={order.orderId}
                  className="rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          order.side === "bid"
                            ? "bg-green-500 text-white"
                            : "bg-red-500 text-white"
                        }`}
                      >
                        {order.side === "bid" ? "BUY" : "SELL"}
                      </span>
                      <span className="font-mono font-semibold">
                        {order.symbol}
                      </span>
                      {order.market && (
                        <span className="text-xs text-muted-foreground">
                          MARKET
                        </span>
                      )}
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${
                          statusStyles[order.status] ?? statusStyles.cancelled
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {order.updatedAt
                        ? new Date(order.updatedAt).toLocaleString()
                        : ""}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>
                      Qty:{" "}
                      <span className="font-medium text-foreground">
                        {order.filledQuantity}/{order.quantity}
                      </span>
                    </span>
                    <span className="font-mono">
                      Price:{" "}
                      <span className="font-medium text-foreground">
                        ${Number(order.price).toFixed(2)}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
