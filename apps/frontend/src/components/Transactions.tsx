"use client";

import { useState } from "react";
import { Transaction, PaginatedResponse } from "../types";
import { Button } from "@/components/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives";
import { ChevronLeft, ChevronRight, Loader2, RefreshCcw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const PAGE_SIZE = 15;

export default function Transactions() {
  const [page, setPage] = useState(1);

  const { data, refetch, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["transactions", page],
    queryFn: async () =>
      await api<PaginatedResponse<Transaction>>(
        `/user/transactions?page=${page}&limit=${PAGE_SIZE}`,
      ),
    refetchOnWindowFocus: true,
    retry: false,
    placeholderData: (prev) => prev,
  });

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const rows = data?.data ?? [];

  return (
    <Card className="shadow-md border-0 w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span>
            Transactions
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
          <div className="text-destructive py-4 text-sm">
            {error instanceof Error
              ? error.message
              : "Failed to load transactions."}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground py-4">
            No transactions found.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {rows.map((tx) => (
                <div
                  key={tx.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    tx.type === "buy"
                      ? "bg-green-50/50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30"
                      : "bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          tx.type === "buy"
                            ? "bg-green-500 text-white"
                            : "bg-red-500 text-white"
                        }`}
                      >
                        {tx.type?.toUpperCase()}
                      </span>
                      {tx.symbol && (
                        <span className="text-xs font-mono font-semibold">
                          {tx.symbol}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(tx.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Qty:{" "}
                        <span className="font-medium">
                          {Number(tx.quantity)}
                        </span>
                      </span>
                      <span className="font-mono">
                        Price:{" "}
                        <span className="font-medium">
                          ${Number(tx.price).toFixed(2)}
                        </span>
                      </span>
                      <span className="font-mono text-muted-foreground">
                        Total: $
                        {(Number(tx.price) * Number(tx.quantity)).toFixed(2)}
                      </span>
                    </div>
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
