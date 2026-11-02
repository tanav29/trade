"use client";

import { Button } from "@/components/primitives";
import { Input } from "@/components/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/primitives";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Label } from "@/components/primitives";
import type { User, UserOrder } from "@/types";

type FormData = {
  side: "bid" | "ask";
  price: string;
  quantity: string;
  market: boolean;
};

type MakeOrderResponse = {
  ok: boolean;
  msg: string;
};

interface Props {
  symbol: string;
}

const MakeOrder = ({ symbol }: Props) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<FormData>({
    side: "bid",
    price: "",
    quantity: "",
    market: false,
  });

  const selling = formData.side === "ask";
  const holdings = useQuery({
    queryKey: ["user_info"],
    queryFn: () => api<User>("/user"),
    retry: false,
    refetchInterval: 15000,
  });
  const openOrders = useQuery({
    queryKey: ["myorders", symbol],
    queryFn: () => api<{ ok: boolean; data: { asks: UserOrder[]; bids: UserOrder[] } }>(`/trade/myorders?symbol=${encodeURIComponent(symbol)}`),
    retry: false,
    refetchInterval: 15000,
  });
  const available = holdings.data?.portfolio.find((entry) => entry.symbol === symbol)?.quantity ?? 0;
  const sideOrders = (selling ? openOrders.data?.data.asks : openOrders.data?.data.bids) ?? [];
  const cash = Number(holdings.data?.cash ?? 0);
  const limitPrice = Number(formData.price);
  const affordable = !formData.market && limitPrice > 0 ? Math.floor(cash / limitPrice) : 0;
  const cancel = useMutation({
    mutationFn: (order: { orderId: string; side: "bid" | "ask"; symbol: string }) => api<{ ok: boolean; msg?: string }>("/trade/cancelorder", {
      method: "POST", body: JSON.stringify(order),
    }),
    onSuccess: (result) => {
      if (!result.ok) { toast.error(result.msg || "Could not cancel order."); return; }
      toast.success("Order cancelled.");
      void queryClient.invalidateQueries({ queryKey: ["myorders"] });
      void queryClient.invalidateQueries({ queryKey: ["user_info"] });
      void queryClient.invalidateQueries({ queryKey: ["depth"] });
      void queryClient.invalidateQueries({ queryKey: ["order-history"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Could not cancel order."),
  });

  const { isPending, mutate } = useMutation({
    mutationFn: async (data: FormData & { sym: string }) => {
      const body: Record<string, unknown> = {
        side: data.side,
        symbol: data.sym,
        quantity: Number(data.quantity),
        market: data.market,
      };
      if (!data.market) {
        body.price = Number(data.price);
      }
      return await api<MakeOrderResponse>("/trade/makeorder", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(data.msg || "Order submitted successfully!");
        setFormData((prev) => ({ ...prev, price: "", quantity: "" }));
      } else {
        toast.info(data.msg);
      }
      void queryClient.invalidateQueries({ queryKey: ["depth", symbol] });
      void queryClient.invalidateQueries({ queryKey: ["myorders"] });
      void queryClient.invalidateQueries({ queryKey: ["order-history"] });
      void queryClient.invalidateQueries({ queryKey: ["user_info"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message);
        return;
      }
      toast.warning("Network busy.");
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formData.market && !formData.quantity) {
      toast.error("Quantity is required for market orders.");
      return;
    }
    if (!formData.market && (!formData.price || !formData.quantity)) {
      toast.error("Price and quantity are required for limit orders.");
      return;
    }
    mutate({ ...formData, sym: symbol });
  };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Place Order — {symbol}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Order side">
          <button type="button" aria-pressed={!selling} onClick={() => setFormData(prev => ({ ...prev, side: "bid" }))} className={`rounded-md py-2 text-sm font-semibold ${!selling ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}>Buy</button>
          <button type="button" aria-pressed={selling} onClick={() => setFormData(prev => ({ ...prev, side: "ask" }))} className={`rounded-md py-2 text-sm font-semibold ${selling ? "bg-red-600 text-white" : "bg-slate-800 text-slate-300"}`}>Sell</button>
        </div>

        <section className="rounded-lg border bg-muted/30 p-3" aria-label={`${symbol} ${selling ? "sell" : "buy"} account summary`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{selling ? "Available to sell" : "Available cash"}</p>
              {holdings.isLoading ? <p className="mt-1 text-sm">Loading balance?</p> : holdings.isError ? <p className="mt-1 text-sm text-destructive">Could not load balance. Sign in and try again.</p> : selling ? <p className="mt-1 text-lg font-semibold tabular-nums">{Number(available).toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{symbol} shares</span></p> : <p className="mt-1 text-lg font-semibold tabular-nums">${cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
            </div>
            <button type="button" disabled={!holdings.data || (selling ? available < 1 : affordable < 1)} onClick={() => setFormData((prev) => ({ ...prev, quantity: String(selling ? Math.floor(available) : affordable) }))} className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-background disabled:opacity-40">Use all</button>
          </div>
          {!selling && <p className="mt-2 text-xs text-muted-foreground">{formData.market ? "Enter a quantity for a market buy." : "Enter a limit price to calculate how many shares your cash can buy."}</p>}
          <div className="mt-3 border-t pt-3">
            <div className="flex justify-between text-xs text-muted-foreground"><span>Open {selling ? "sell" : "buy"} orders</span><span>{openOrders.isLoading ? "Loading?" : openOrders.isError ? "Unavailable" : sideOrders.length}</span></div>
            {!openOrders.isLoading && !openOrders.isError && sideOrders.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No open {selling ? "sell" : "buy"} orders for {symbol}.</p>}
            {sideOrders.map((order) => <div key={order.orderId} className="mt-2 flex items-center justify-between gap-3 text-sm">
              <div><span className="font-medium tabular-nums">{order.quantity.toLocaleString()} shares</span><span className="text-muted-foreground"> at ${order.price.toFixed(2)}</span></div>
              <button type="button" onClick={() => cancel.mutate({ orderId: order.orderId, side: formData.side, symbol })} disabled={cancel.isPending} className="text-xs text-destructive hover:underline disabled:opacity-50">Cancel</button>
            </div>)}
            {sideOrders.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{selling ? "Shares" : "Cash"} in open {selling ? "sell" : "buy"} orders {selling ? "are" : "is"} reserved and excluded from the available balance.</p>}
          </div>
        </section>

        <div className="flex items-center space-x-2">
          <input type="checkbox" id="market-mode" checked={formData.market} onChange={(e) => setFormData(prev => ({ ...prev, market: e.target.checked, price: "" }))} className="h-4 w-4 accent-blue-500" />
          <Label htmlFor="market-mode" className="text-sm font-medium">
            Market order
          </Label>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!formData.market && (
            <div className="space-y-1">
              <Label htmlFor="price" className="text-sm">
                Price
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.price}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, price: e.target.value }))
                }
                placeholder="0.00"
                required={!formData.market}
                className="font-mono"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="quantity" className="text-sm">
              Quantity
            </Label>
            <Input
              id="quantity"
              type="number"
              step="1"
              min="1"
              value={formData.quantity}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, quantity: e.target.value }))
              }
              placeholder="0"
              required
              className="font-mono"
            />
          </div>

          {!formData.market && Number(formData.price) > 0 && Number(formData.quantity) > 0 && <div className="flex justify-between border-t pt-3 text-sm"><span className="text-muted-foreground">Estimated total</span><span className="font-semibold tabular-nums">${(Number(formData.price) * Number(formData.quantity)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
          <Button
            type="submit"
            className={`w-full font-medium ${
              formData.side === "bid"
                ? "bg-green-500 hover:bg-green-600 text-white"
                : "bg-red-500 hover:bg-red-600 text-white"
            }`}
            variant={formData.side === "bid" ? "default" : "destructive"}
            disabled={
              isPending ||
              (!formData.market && !formData.price) ||
              !formData.quantity
            }
          >
            {isPending
              ? "Processing..."
              : formData.market
                ? formData.side === "bid"
                  ? "Market Buy"
                  : "Market Sell"
                : formData.side === "bid"
                  ? "Limit Buy"
                  : "Limit Sell"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default MakeOrder;
