import { redisClient } from "./redis";
import type { Order } from "./types";

export async function parseOrderbook(symbol: string) {
  const sym = symbol.toUpperCase();
  const asks = await redisClient.lRange(`asks:${sym}`, 0, -1);
  const bids = await redisClient.lRange(`bids:${sym}`, 0, -1);
  return {
    symbol: sym,
    asks: asks.map((a: string) => {
      const parsed = JSON.parse(a) as Order;
      return { price: parsed.price, quantity: parsed.quantity };
    }),
    bids: bids.map((b: string) => {
      const parsed = JSON.parse(b) as Order;
      return { price: parsed.price, quantity: parsed.quantity };
    }),
  };
}
