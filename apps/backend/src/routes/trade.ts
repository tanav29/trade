import { Hono } from "hono";
import { z } from "zod";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { redisClient } from "../redis";
import { candles, symbols, orders as ordersTable } from "../schema";
import auth from "../middleware/jwt";
import { getUserByEmail } from "../helpers";
import { parseOrderbook } from "../matching";
import { placeOrder, cancelOrder } from "../durable-matching";
import type { Order } from "../types";

const router = new Hono();

const makeOrderSchema = z
  .object({
    side: z.enum(["bid", "ask"]),
    symbol: z.string().min(1).max(10).default("TNV"),
    price: z.number().max(1000000).optional(),
    market: z.boolean().default(false),
    quantity: z.number().int().positive().max(1000000),
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
    if (Math.abs(Math.round(data.price * 100) - data.price * 100) > 1e-7) {
      ctx.addIssue({
        code: "custom",
        message: "Price must have at most 2 decimal places",
        path: ["price"],
      });
    }
  });

router.post("/makeorder", auth, async (c) => {
  const parsed = makeOrderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, msg: "Invalid order." }, 400);
  const key = c.req.header("Idempotency-Key")?.trim();
  if (!key || key.length > 128) return c.json({ ok: false, msg: "Idempotency-Key header is required (1-128 characters)." }, 400);
  const user = await getUserByEmail(c.get("jwt").email);
  if (!user) return c.json({ ok: false, msg: "User not found." }, 404);
  const body = parsed.data;
  const result = await placeOrder({ userId: user.id, symbol: body.symbol.toUpperCase(), side: body.side, quantity: body.quantity, market: body.market, price: body.market ? 0 : body.price!, key });
  if (result.conflict) return c.json(result, 409);
  return c.json(result);
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
  const parsed = z.object({ orderId: z.string(), side: z.enum(["bid", "ask"]), symbol: z.string().min(1).max(10) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, msg: "Invalid cancellation." }, 400);
  const user = await getUserByEmail(c.get("jwt").email);
  if (!user) return c.json({ ok: false, msg: "User not found." }, 404);
  const { orderId, side, symbol } = parsed.data;
  const cancelled = await cancelOrder(user.id, orderId, symbol.toUpperCase(), side);
  return c.json({ ok: cancelled, msg: cancelled ? "Order cancelled successfully." : "Order not found or you don't have permission." });
});

export default router;
