import { Hono } from "hono";
import { z } from "zod";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { redisClient } from "../redis";
import { candles, symbols, orders as ordersTable } from "../schema";
import auth from "../middleware/jwt";
import { getUserByEmail } from "../helpers";
import {
  bookKey,
  fillOrders,
  getCash,
  getPortfolio,
  insertSorted,
  markOrderStatus,
  matchKey,
  parseOrderbook,
  recordOrder,
  releaseReservation,
  reserveForOrder,
} from "../matching";
import { broadcastDepth } from "../sse";
import type { Order } from "../types";

const router = new Hono();

const makeOrderSchema = z
  .object({
    side: z.enum(["bid", "ask"]),
    symbol: z.string().min(1).max(10).default("TNV"),
    price: z.number().optional(),
    market: z.boolean().default(false),
    quantity: z.number().int().positive(),
  })
  .superRefine((data, ctx) => {
    if (data.market) return;
    if (data.price === undefined || !Number.isFinite(data.price)) {
      ctx.addIssue({
        code: "custom",
        message: "Price is required for limit orders",
        path: ["price"],
      });
      return;
    }
    if (data.price <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Price must be positive",
        path: ["price"],
      });
      return;
    }
    if (Math.round(data.price * 100) !== data.price * 100) {
      ctx.addIssue({
        code: "custom",
        message: "Price must have at most 2 decimal places",
        path: ["price"],
      });
    }
  });

function newOrderId(userId: number) {
  return `${Date.now()}-${userId}-${Math.random().toString(36).slice(2, 11)}`;
}

async function publishOrderbook(symbol: string) {
  try {
    const orderbook = await parseOrderbook(symbol);
    await broadcastDepth(orderbook);
  } catch (err) {
    console.error(`Failed to broadcast orderbook for ${symbol}`, err);
  }
}

/** Walk opposite book to estimate worst-case market buy cost / sell availability. */
async function estimateMarketCost(
  side: "bid" | "ask",
  symbol: string,
  quantity: number,
): Promise<{ ok: boolean; cost?: number; available?: number; msg?: string }> {
  const key = matchKey(symbol, side);
  const opposite = (await redisClient.lRange(key, 0, -1)).map(
    (o: string) => JSON.parse(o) as Order,
  );

  if (opposite.length === 0) {
    return { ok: false, msg: `No liquidity available for market order on ${symbol}.` };
  }

  if (side === "bid") {
    opposite.sort((a, b) =>
      a.price !== b.price ? a.price - b.price : a.timestamp - b.timestamp,
    );
    let need = quantity;
    let cost = 0;
    for (const o of opposite) {
      if (need <= 0) break;
      const take = Math.min(need, o.quantity);
      cost += take * o.price;
      need -= take;
    }
    if (need > 0) {
      return {
        ok: false,
        msg: `Not enough liquidity. Only ${quantity - need} available on ${symbol}.`,
      };
    }
    return { ok: true, cost };
  }

  opposite.sort((a, b) =>
    a.price !== b.price ? b.price - a.price : a.timestamp - b.timestamp,
  );
  const available = opposite.reduce((s, o) => s + o.quantity, 0);
  if (available < quantity) {
    return {
      ok: false,
      msg: `Not enough liquidity. Only ${available} available on ${symbol}.`,
    };
  }
  return { ok: true, available };
}

router.post("/makeorder", auth, async (c) => {
  const body = await makeOrderSchema.parseAsync(await c.req.json());
  const { side, symbol, quantity, market } = body;
  const price = market ? 0 : (body.price as number);

  const jwt = c.get("jwt");
  const userData = await getUserByEmail(jwt.email);
  if (!userData) {
    return c.json({ ok: false, msg: "User not found." }, 404);
  }

  const userId = userData.id;
  const sym = symbol.toUpperCase();
  const [listed] = await db.select({ id: symbols.id }).from(symbols).where(eq(symbols.symbol, sym));
  if (!listed) return c.json({ ok: false, msg: "Unknown stock symbol." }, 400);
  const holdingQty = await getPortfolio(userId, sym);
  const cash = await getCash(userId);
  const orderId = newOrderId(userId);

  if (market) {
    const estimate = await estimateMarketCost(side, sym, quantity);
    if (!estimate.ok) {
      return c.json({ ok: false, msg: estimate.msg });
    }
    if (side === "bid") {
      if (cash < (estimate.cost ?? 0)) {
        return c.json({
          ok: false,
          msg: `Not enough cash for market order on ${sym}. Need $${(estimate.cost ?? 0).toFixed(2)}.`,
        });
      }
    } else if (holdingQty < quantity) {
      return c.json({
        ok: false,
        msg: `Not enough ${sym} for market order. You have ${holdingQty}.`,
      });
    }
  } else if (side === "bid") {
    if (cash < price * quantity) {
      return c.json({ ok: false, msg: "Not enough cash." });
    }
  } else if (holdingQty < quantity) {
    return c.json({
      ok: false,
      msg: `Not enough ${sym}. You have ${holdingQty}.`,
    });
  }

  const { remainingQty, fills } = await fillOrders(
    side,
    sym,
    price,
    quantity,
    userId,
    market,
  );
  const filledQty = quantity - remainingQty;

  // Fully filled as taker — no rest, no reservation left
  if (remainingQty === 0) {
    await recordOrder({
      orderId,
      userId,
      symbol: sym,
      side,
      price: market ? (fills[0]?.price ?? 0) : price,
      quantity,
      filledQuantity: filledQty,
      status: "filled",
      market,
    });
    await publishOrderbook(sym);
    return c.json({
      ok: true,
      msg: `All quantity of ${quantity} filled on ${sym}.`,
      orderId,
    });
  }

  // Market orders never rest
  if (market) {
    await recordOrder({
      orderId,
      userId,
      symbol: sym,
      side,
      price: fills[0]?.price ?? 0,
      quantity,
      filledQuantity: filledQty,
      status: filledQty > 0 ? "partial" : "cancelled",
      market: true,
    });
    await publishOrderbook(sym);
    return c.json({
      ok: true,
      msg: `Market order partially filled. ${filledQty} of ${quantity} filled on ${sym}.`,
      orderId,
    });
  }

  // Rest remaining on book — reserve cash/stock for the unfilled qty
  await reserveForOrder(userId, side, sym, price, remainingQty);

  const order: Order = {
    orderId,
    userId,
    symbol: sym,
    price,
    quantity: remainingQty,
    timestamp: Date.now(),
  };
  await insertSorted(bookKey(sym, side), order);

  await recordOrder({
    orderId,
    userId,
    symbol: sym,
    side,
    price,
    quantity,
    filledQuantity: filledQty,
    status: "open",
    market: false,
  });

  await publishOrderbook(sym);
  return c.json({
    ok: true,
    msg: `${filledQty} filled. ${remainingQty} placed in orderbook.`,
    orderId,
  });
});

router.get("/chart", async (c) => {
  const symbol = (c.req.query("symbol") || "TNV").toUpperCase();
  try {
    const rows = await db
      .select()
      .from(candles)
      .where(eq(candles.symbol, symbol))
      .orderBy(desc(candles.timestamp))
      .limit(720);
    return c.json(
      rows.reverse().map((r) => ({
        time: Math.floor(new Date(r.timestamp).getTime() / 1000),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
      })),
    );
  } catch {
    return c.json({ message: "Failed to load chart history." }, 500);
  }
});

router.get("/depth", async (c) => {
  const symbol = (c.req.query("symbol") || "TNV").toUpperCase();
  try {
    const data = await parseOrderbook(symbol);
    return c.json({ ok: true, data });
  } catch {
    return c.json(
      { ok: false, error: "Failed to fetch orderbook from Redis" },
      500,
    );
  }
});

router.get("/myorders", auth, async (c) => {
  const jwt = c.get("jwt");
  const symbol = (c.req.query("symbol") || "TNV").toUpperCase();
  const user = await getUserByEmail(jwt.email);
  const userId = user?.id;
  if (!userId) {
    return c.json({ ok: false, error: "User not found" }, 404);
  }

  try {
    const asks = (await redisClient.lRange(`asks:${symbol}`, 0, -1))
      .map((a) => JSON.parse(a) as Order)
      .filter((a) => a.userId === userId);
    const bids = (await redisClient.lRange(`bids:${symbol}`, 0, -1))
      .map((b) => JSON.parse(b) as Order)
      .filter((b) => b.userId === userId);

    return c.json({
      ok: true,
      data: {
        asks: asks.map((a) => ({
          orderId: a.orderId,
          price: a.price,
          quantity: a.quantity,
          symbol: a.symbol,
        })),
        bids: bids.map((b) => ({
          orderId: b.orderId,
          price: b.price,
          quantity: b.quantity,
          symbol: b.symbol,
        })),
      },
    });
  } catch {
    return c.json({ ok: false, error: "Failed to fetch orders" }, 500);
  }
});

/** Closed / terminal order history (filled, cancelled, partial). */
router.get("/order-history", auth, async (c) => {
  const jwt = c.get("jwt");
  const user = await getUserByEmail(jwt.email);
  const userId = user?.id;
  if (!userId) {
    return c.json({ ok: false, error: "User not found" }, 404);
  }

  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  const offset = (page - 1) * limit;
  const symbol = c.req.query("symbol")?.toUpperCase();

  const conditions = [
    eq(ordersTable.userId, userId),
    ne(ordersTable.status, "open"),
  ];
  if (symbol) {
    conditions.push(eq(ordersTable.symbol, symbol));
  }
  const where = and(...conditions);

  const [totalRow] = await db
    .select({ total: count() })
    .from(ordersTable)
    .where(where);

  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const rows = await db
    .select()
    .from(ordersTable)
    .where(where)
    .orderBy(desc(ordersTable.updatedAt), desc(ordersTable.id))
    .limit(limit)
    .offset(offset);

  return c.json({
    ok: true,
    data: rows.map((r) => ({
      orderId: r.orderId,
      symbol: r.symbol,
      side: r.side,
      price: Number(r.price),
      quantity: r.quantity,
      filledQuantity: r.filledQuantity,
      status: r.status,
      market: r.market,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    page,
    limit,
    total,
    totalPages,
  });
});

router.post("/cancelorder", auth, async (c) => {
  const { orderId, side, symbol } = await c.req.json();
  const jwt = c.get("jwt");
  const user = await getUserByEmail(jwt.email);
  const userId = user?.id;
  if (!userId) {
    return c.json({ ok: false, msg: "User not found." }, 404);
  }

  if (side !== "bid" && side !== "ask") {
    return c.json({ ok: false, msg: "Invalid side." }, 400);
  }

  const sym = (symbol || "TNV").toUpperCase();

  try {
    const key = bookKey(sym, side);
    const bookOrders = await redisClient.lRange(key, 0, -1);

    for (const raw of bookOrders) {
      const parsed = JSON.parse(raw) as Order;
      if (parsed.orderId === orderId && parsed.userId === userId) {
        await redisClient.lRem(key, 1, raw);
        // Return reserved cash/stock for remaining qty
        await releaseReservation(
          userId,
          side,
          sym,
          parsed.price,
          parsed.quantity,
        );
        await markOrderStatus(
          orderId,
          parsed.quantity > 0 ? "cancelled" : "filled",
        );
        // If partially filled before cancel, status cancelled still correct
        await publishOrderbook(sym);
        return c.json({
          ok: true,
          msg: "Order cancelled successfully.",
        });
      }
    }

    return c.json({
      ok: false,
      msg: "Order not found or you don't have permission.",
    });
  } catch {
    return c.json({ ok: false, error: "Failed to cancel order" }, 500);
  }
});

export default router;
