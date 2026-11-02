import { eq, sql, and } from "drizzle-orm";
import { db } from "./db";
import { redisClient } from "./redis";
import { orders as ordersTable, portfolios, transactions, users } from "./schema";
import type { Order } from "./types";
import { recordTradePrice } from "./utils/trade-price";
import { findInsertIndex, matchAgainstBook, type Fill } from "./matching-core";

export function bookKey(symbol: string, side: "bid" | "ask"): string {
  return `${side === "bid" ? "bids" : "asks"}:${symbol.toUpperCase()}`;
}

/** Opposite book a taker order matches against. */
export function matchKey(symbol: string, side: "bid" | "ask"): string {
  return bookKey(symbol, side === "bid" ? "ask" : "bid");
}

export async function getPortfolio(
  userId: number,
  symbol: string,
): Promise<number> {
  const row = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.userId, userId), eq(portfolios.symbol, symbol)));
  return row.length > 0 ? Number(row[0].quantity) : 0;
}

export async function getCash(userId: number): Promise<number> {
  const row = await db.select().from(users).where(eq(users.id, userId));
  return row[0] ? Number(row[0].cash) : 0;
}

export async function updatePortfolio(
  userId: number,
  symbol: string,
  delta: number,
) {
  const row = await db
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.userId, userId), eq(portfolios.symbol, symbol)));

  if (row.length === 0) {
    await db.insert(portfolios).values({
      userId,
      symbol,
      quantity: String(delta),
    });
    return;
  }

  await db
    .update(portfolios)
    .set({
      quantity: sql`${portfolios.quantity} + ${delta}`,
    })
    .where(and(eq(portfolios.userId, userId), eq(portfolios.symbol, symbol)));
}

export async function updateCash(userId: number, delta: number) {
  await db
    .update(users)
    .set({
      cash: sql`${users.cash} + ${delta}`,
    })
    .where(eq(users.id, userId));
}

/**
 * Reserve funds for a resting limit order by deducting from available balances.
 * Bid → lock cash (price * qty). Ask → lock stock.
 */
export async function reserveForOrder(
  userId: number,
  side: "bid" | "ask",
  symbol: string,
  price: number,
  quantity: number,
) {
  if (side === "bid") {
    await updateCash(userId, -(price * quantity));
  } else {
    await updatePortfolio(userId, symbol, -quantity);
  }
}

/** Release reserved funds when a resting order is cancelled. */
export async function releaseReservation(
  userId: number,
  side: "bid" | "ask",
  symbol: string,
  price: number,
  quantity: number,
) {
  if (side === "bid") {
    await updateCash(userId, price * quantity);
  } else {
    await updatePortfolio(userId, symbol, quantity);
  }
}

export async function insertSorted(key: string, order: Order) {
  const orders = (await redisClient.lRange(key, 0, -1)).map(
    (o: string) => JSON.parse(o) as Order,
  );
  const isAsk = key.startsWith("asks");
  const insertIdx = findInsertIndex(orders, order, isAsk);

  if (insertIdx === 0) {
    await redisClient.lPush(key, JSON.stringify(order));
  } else if (insertIdx >= orders.length) {
    await redisClient.rPush(key, JSON.stringify(order));
  } else {
    await redisClient.lInsert(
      key,
      "BEFORE",
      JSON.stringify(orders[insertIdx]),
      JSON.stringify(order),
    );
  }
}

async function rebuildList(key: string, orders: Order[]) {
  if (orders.length === 0) {
    await redisClient.del(key);
    return;
  }
  const multi = redisClient.multi();
  multi.del(key);
  multi.rPush(key, orders.map((o) => JSON.stringify(o)));
  await multi.exec();
}

/**
 * Settle a trade.
 * Maker already reserved (bid locked cash / ask locked stock).
 * Taker has not reserved — deduct from taker now.
 */
async function settleFill(
  symbol: string,
  side: "bid" | "ask",
  takerUserId: number,
  fill: Fill,
) {
  const { makerUserId, price, quantity } = fill;
  const notional = price * quantity;

  if (side === "bid") {
    // Taker is buyer, maker is seller (resting ask — stock already reserved)
    await updateCash(takerUserId, -notional);
    await updatePortfolio(takerUserId, symbol, quantity);
    await updateCash(makerUserId, notional);
    // maker stock already reserved — no further portfolio change for seller

    await db.insert(transactions).values({
      user_id: makerUserId,
      symbol,
      type: "sell",
      quantity: quantity.toString(),
      price: price.toString(),
    });
    await db.insert(transactions).values({
      user_id: takerUserId,
      symbol,
      type: "buy",
      quantity: quantity.toString(),
      price: price.toString(),
    });
  } else {
    // Taker is seller, maker is buyer (resting bid — cash already reserved)
    await updatePortfolio(takerUserId, symbol, -quantity);
    await updateCash(takerUserId, notional);
    await updatePortfolio(makerUserId, symbol, quantity);
    // maker cash already reserved — no further cash change for buyer

    await db.insert(transactions).values({
      user_id: takerUserId,
      symbol,
      type: "sell",
      quantity: quantity.toString(),
      price: price.toString(),
    });
    await db.insert(transactions).values({
      user_id: makerUserId,
      symbol,
      type: "buy",
      quantity: quantity.toString(),
      price: price.toString(),
    });
  }

  await recordTradePrice(symbol, price);

  // Bump maker order filled qty in history
  const [makerOrder] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.orderId, fill.makerOrderId));

  if (makerOrder) {
    const newFilled = Number(makerOrder.filledQuantity) + quantity;
    await db
      .update(ordersTable)
      .set({
        filledQuantity: newFilled,
        status: newFilled >= makerOrder.quantity ? "filled" : "open",
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.orderId, fill.makerOrderId));
  }
}

export async function recordOrder(params: {
  orderId: string;
  userId: number;
  symbol: string;
  side: "bid" | "ask";
  price: number;
  quantity: number;
  filledQuantity: number;
  status: "open" | "filled" | "cancelled" | "partial";
  market: boolean;
}) {
  await db.insert(ordersTable).values({
    orderId: params.orderId,
    userId: params.userId,
    symbol: params.symbol,
    side: params.side,
    price: params.price.toString(),
    quantity: params.quantity,
    filledQuantity: params.filledQuantity,
    status: params.status,
    market: params.market,
  });
}

export async function markOrderStatus(
  orderId: string,
  status: "open" | "filled" | "cancelled" | "partial",
  filledDelta?: number,
) {
  if (filledDelta !== undefined) {
    await db
      .update(ordersTable)
      .set({
        status,
        filledQuantity: sql`${ordersTable.filledQuantity} + ${filledDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.orderId, orderId));
  } else {
    await db
      .update(ordersTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(ordersTable.orderId, orderId));
  }
}

/**
 * Match a taker order against the opposite book.
 * Returns remaining unfilled quantity and fills applied.
 */
export async function fillOrders(
  side: "bid" | "ask",
  symbol: string,
  price: number,
  quantity: number,
  userId: number,
  market: boolean = false,
): Promise<{ remainingQty: number; fills: Fill[] }> {
  const key = matchKey(symbol, side);
  const book = (await redisClient.lRange(key, 0, -1)).map(
    (o: string) => JSON.parse(o) as Order,
  );

  const { remainingQty, remainingBook, fills } = matchAgainstBook(
    side,
    price,
    quantity,
    userId,
    market,
    book,
  );

  for (const fill of fills) {
    await settleFill(symbol, side, userId, fill);
  }

  await rebuildList(key, remainingBook);
  return { remainingQty, fills };
}

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
