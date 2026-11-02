import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { redisClient } from "./redis";
import { matchAgainstBook } from "./matching-core";
import { broadcastDepth, broadcastPrice } from "./sse";
import type { Order } from "./types";

export type OrderInput = { userId: number; symbol: string; side: "bid" | "ask"; price: number; quantity: number; market: boolean; key: string };
const lockSymbol = (client: PoolClient, symbol: string) => client.query("SELECT pg_advisory_xact_lock(731, hashtext($1))", [symbol]);
const dirty = (client: PoolClient, symbol: string) => client.query("INSERT INTO book_sync_pending(symbol) VALUES ($1) ON CONFLICT DO NOTHING", [symbol]);

async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await fn(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function placeOrder(input: OrderInput, scheduleSync = requestSync) {
  const { userId, symbol, side, price, quantity, market, key } = input;
  const fingerprint = JSON.stringify({ symbol, side, price, quantity, market });
  const committedPrices: number[] = [];
  const result = await transaction(async client => {
    // This lock also serializes the same key used for different symbols.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [`order-key:${userId}`, key]);
    const previous = await client.query("SELECT order_id, request_fingerprint FROM orders WHERE user_id=$1 AND idempotency_key=$2", [userId, key]);
    if (previous.rows.length) {
      if (previous.rows[0].request_fingerprint !== fingerprint) return { ok: false, conflict: true, msg: "Idempotency key was already used for a different order." };
      return { ok: true, orderId: previous.rows[0].order_id, msg: "Order already submitted." };
    }
    await lockSymbol(client, symbol);
    const listed = await client.query("SELECT 1 FROM symbols WHERE symbol=$1", [symbol]);
    if (!listed.rowCount) return { ok: false, msg: "Unknown stock symbol." };
    const makers = await client.query("SELECT * FROM orders WHERE symbol=$1 AND side=$2 AND status='open' ORDER BY id", [symbol, side === "bid" ? "ask" : "bid"]);
    const book: Order[] = makers.rows.map(row => ({ orderId: row.order_id, userId: row.user_id, symbol, price: Number(row.price), quantity: row.quantity - row.filled_quantity, timestamp: row.id }));
    const { fills, remainingQty } = matchAgainstBook(side, price, quantity, userId, market, book);
    if (market && remainingQty) return { ok: false, msg: "Not enough liquidity for market order." };
    const userIds = [...new Set([userId, ...fills.map(f => f.makerUserId)])].sort((a,b) => a-b);
    await client.query("SELECT id FROM users WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE", [userIds]);
    const cash = await client.query("SELECT cash FROM users WHERE id=$1", [userId]);
    const holding = await client.query("SELECT COALESCE(SUM(quantity),0) AS quantity FROM portfolios WHERE user_id=$1 AND symbol=$2", [userId, symbol]);
    const cost = market ? fills.reduce((sum, f) => sum + Math.round(f.price * 100) * f.quantity, 0) / 100 : Math.round(price * 100) * quantity / 100;
    if (side === "bid" && Number(cash.rows[0]?.cash ?? 0) < cost) return { ok: false, msg: "Not enough cash." };
    if (side === "ask" && Number(holding.rows[0].quantity) < quantity) return { ok: false, msg: `Not enough ${symbol}.` };
    const cashDelta = (id: number, amount: number) => client.query("UPDATE users SET cash=cash+$1::numeric WHERE id=$2", [String(amount), id]);
    const stockDelta = async (id: number, amount: number) => {
      const updated = await client.query("UPDATE portfolios SET quantity=quantity+$1::numeric WHERE id=(SELECT id FROM portfolios WHERE user_id=$2 AND symbol=$3 ORDER BY id LIMIT 1)", [String(amount), id, symbol]);
      if (!updated.rowCount) await client.query("INSERT INTO portfolios(user_id,symbol,quantity) VALUES($1,$2,$3)", [id, symbol, String(amount)]);
    };
    for (const fill of fills) {
      committedPrices.push(fill.price);
      const notional = Math.round(fill.price * 100) * fill.quantity / 100;
      if (side === "bid") { await cashDelta(userId, -notional); await stockDelta(userId, fill.quantity); await cashDelta(fill.makerUserId, notional); }
      else { await stockDelta(userId, -fill.quantity); await cashDelta(userId, notional); await stockDelta(fill.makerUserId, fill.quantity); }
      await client.query("UPDATE orders SET filled_quantity=filled_quantity+$1, status=CASE WHEN filled_quantity+$1=quantity THEN 'filled' ELSE 'open' END, updated_at=now() WHERE order_id=$2", [fill.quantity, fill.makerOrderId]);
      await client.query("INSERT INTO transactions(user_id,symbol,type,quantity,price) VALUES ($1,$2,$3,$4,$5),($6,$2,$7,$4,$5)", [userId, symbol, side === "bid" ? "buy" : "sell", fill.quantity, String(fill.price), fill.makerUserId, side === "bid" ? "sell" : "buy"]);
      const candle = await client.query("UPDATE candles SET high=GREATEST(high,$2::numeric), low=LEAST(low,$2::numeric), close=$2, volume=volume+$3 WHERE id=(SELECT id FROM candles WHERE symbol=$1 AND timestamp=date_trunc('minute',now()) ORDER BY id LIMIT 1)", [symbol, String(fill.price), fill.quantity]);
      if (!candle.rowCount) await client.query("INSERT INTO candles(symbol,timestamp,open,high,low,close,volume) VALUES ($1,date_trunc('minute',now()),$2,$2,$2,$2,$3)", [symbol, String(fill.price), fill.quantity]);
    }
    if (remainingQty) {
      if (side === "bid") await cashDelta(userId, -(Math.round(price * 100) * remainingQty / 100));
      else await stockDelta(userId, -remainingQty);
    }
    const orderId = randomUUID();
    await client.query("INSERT INTO orders(order_id,user_id,symbol,side,price,quantity,filled_quantity,status,market,idempotency_key,request_fingerprint) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [orderId,userId,symbol,side,String(market ? fills[0]?.price ?? 0 : price),quantity,quantity-remainingQty,remainingQty ? "open" : "filled",market,key,fingerprint]);
    await dirty(client, symbol);
    return { ok: true, orderId, msg: `${quantity - remainingQty} filled. ${remainingQty} placed in orderbook.` };
  });
  if (result.ok) {
    scheduleSync(symbol);
    for (const tradePrice of committedPrices) void broadcastPrice(symbol, Math.floor(Date.now() / 60000) * 60, tradePrice);
  }
  return result;
}

export async function cancelOrder(userId: number, orderId: string, symbol: string, side: string) {
  const result = await transaction(async client => {
    await lockSymbol(client, symbol);
    const found = await client.query("SELECT * FROM orders WHERE order_id=$1 AND user_id=$2 AND symbol=$3 AND side=$4 AND status='open'", [orderId,userId,symbol,side]);
    if (!found.rowCount) return false;
    const order = found.rows[0];
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    const remaining = order.quantity - order.filled_quantity;
    if (side === "bid") await client.query("UPDATE users SET cash=cash+$1::numeric*$2 WHERE id=$3", [order.price,remaining,userId]);
    else await client.query("UPDATE portfolios SET quantity=quantity+$1 WHERE id=(SELECT id FROM portfolios WHERE user_id=$2 AND symbol=$3 ORDER BY id LIMIT 1)", [remaining,userId,symbol]);
    await client.query("UPDATE orders SET status='cancelled',updated_at=now() WHERE id=$1", [order.id]);
    await dirty(client,symbol);
    return true;
  });
  if (result) requestSync(symbol);
  return result;
}

function requestSync(symbol: string) {
  void syncBook(symbol).catch(err => console.error("Book sync failed:", err));
}

// Lock spans the Redis write and marker deletion, preventing an older snapshot overwriting a newer one.
export async function syncBook(symbol: string) {
  await transaction(async client => {
    await lockSymbol(client, symbol);
    const rows = await client.query("SELECT * FROM orders WHERE symbol=$1 AND status='open' ORDER BY id", [symbol]);
    const sides: Record<string, Order[]> = { bid: [], ask: [] };
    for (const row of rows.rows) sides[row.side].push({ orderId: row.order_id, userId: row.user_id, symbol, price: Number(row.price), quantity: row.quantity-row.filled_quantity, timestamp: row.id });
    sides.bid.sort((a,b) => b.price-a.price || a.timestamp-b.timestamp);
    sides.ask.sort((a,b) => a.price-b.price || a.timestamp-b.timestamp);
    const multi = redisClient.multi().del([`bids:${symbol}`, `asks:${symbol}`]);
    if (sides.bid.length) multi.rPush(`bids:${symbol}`, sides.bid.map(o => JSON.stringify(o)));
    if (sides.ask.length) multi.rPush(`asks:${symbol}`, sides.ask.map(o => JSON.stringify(o)));
    await multi.exec();
    await client.query("DELETE FROM book_sync_pending WHERE symbol=$1", [symbol]);
  });
  const [asks, bids] = await Promise.all([redisClient.lRange(`asks:${symbol}`, 0, -1), redisClient.lRange(`bids:${symbol}`, 0, -1)]);
  void broadcastDepth({ symbol, asks: asks.map(x => JSON.parse(x)), bids: bids.map(x => JSON.parse(x)) });
}
export async function syncAllBooks() {
  const rows = await pool.query("SELECT symbol FROM symbols UNION SELECT symbol FROM book_sync_pending ORDER BY symbol");
  for (const row of rows.rows) await syncBook(row.symbol);
}
