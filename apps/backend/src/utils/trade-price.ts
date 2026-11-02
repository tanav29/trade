import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { candles } from "../schema";
import { broadcastPrice } from "../sse";

// Serialize candle writes in this process so fills in the same minute do not overwrite one another.
let pending = Promise.resolve();
export function recordTradePrice(symbol: string, price: number): Promise<void> {
  const timestamp = new Date(Math.floor(Date.now() / 60000) * 60000);
  const task = pending.then(async () => {
    const [row] = await db.select().from(candles).where(and(eq(candles.symbol, symbol), eq(candles.timestamp, timestamp))).limit(1);
    if (row) {
      await db.update(candles).set({ high: String(Math.max(Number(row.high), price)), low: String(Math.min(Number(row.low), price)), close: String(price) }).where(eq(candles.id, row.id));
    } else {
      await db.insert(candles).values({ symbol, timestamp, open: String(price), high: String(price), low: String(price), close: String(price) });
    }
    void broadcastPrice(symbol, timestamp.getTime() / 1000, price);
  });
  pending = task.catch((err) => console.error("Failed to update trade chart:", err));
  return pending;
}
