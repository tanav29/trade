import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { pool } from "./db";
import { connectRedis, redisClient } from "./redis";
import { placeOrder, syncBook } from "./durable-matching";

// Run only against a disposable database; these tests create and delete their own fixtures.
const enabled = process.env.RUN_INTEGRATION === "1";
describe.skipIf(!enabled)("durable matching integration", () => {
  const symbol = `T${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
  const ids: number[] = [];
  const noSync = () => {}; // models a worker stopping immediately after commit
  beforeAll(async () => {
    await connectRedis();
    await pool.query("INSERT INTO symbols(symbol,name) VALUES($1,'integration')", [symbol]);
    for (let i = 0; i < 3; i++) {
      const result = await pool.query("INSERT INTO users(name,email,cash) VALUES('test',$1,1000) RETURNING id", [`${randomUUID()}@example.test`]);
      ids.push(result.rows[0].id);
    }
    await pool.query("INSERT INTO portfolios(user_id,symbol,quantity) VALUES($1,$2,10)", [ids[0],symbol]);
  });
  afterAll(async () => {
    if (ids.length) {
      await pool.query("DELETE FROM transactions WHERE user_id=ANY($1::int[])", [ids]);
      await pool.query("DELETE FROM orders WHERE user_id=ANY($1::int[])", [ids]);
      await pool.query("DELETE FROM portfolios WHERE user_id=ANY($1::int[])", [ids]);
      await pool.query("DELETE FROM users WHERE id=ANY($1::int[])", [ids]);
    }
    await pool.query("DELETE FROM candles WHERE symbol=$1", [symbol]);
    await pool.query("DELETE FROM book_sync_pending WHERE symbol=$1", [symbol]);
    await pool.query("DELETE FROM symbols WHERE symbol=$1", [symbol]);
    if (redisClient.isOpen) { await redisClient.del([`bids:${symbol}`,`asks:${symbol}`]); await redisClient.quit(); }
    await pool.end();
  });
  test("overlapping fills, retry, and recovery after a missed cache write", async () => {
    const ask = { userId: ids[0], symbol, side: "ask" as const, price: 10, quantity: 10, market: false, key: randomUUID() };
    expect((await placeOrder(ask, noSync)).ok).toBe(true);
    await syncBook(symbol);
    const bid = { userId: ids[1], symbol, side: "bid" as const, price: 10, quantity: 7, market: false, key: randomUUID() };
    const other = { ...bid, userId: ids[2], key: randomUUID() };
    const [one, retry, two] = await Promise.all([placeOrder(bid,noSync), placeOrder(bid,noSync), placeOrder(other,noSync)]);
    expect(one.orderId).toBe(retry.orderId);
    expect(two.ok).toBe(true);
    const orderRows = await pool.query("SELECT side,quantity,filled_quantity FROM orders WHERE symbol=$1", [symbol]);
    expect(orderRows.rowCount).toBe(3);
    expect(orderRows.rows.filter(r => r.side === "bid").reduce((n,r) => n+r.filled_quantity,0)).toBe(10);
    const cash = await pool.query("SELECT sum(cash)::numeric AS total FROM users WHERE id=ANY($1::int[])", [ids]);
    // Four unfilled bid shares reserve 40 cash.
    expect(Number(cash.rows[0].total)).toBe(2960);
    const holdings = await pool.query("SELECT sum(quantity)::numeric AS total FROM portfolios WHERE symbol=$1", [symbol]);
    expect(Number(holdings.rows[0].total)).toBe(10);
    expect(JSON.parse((await redisClient.lRange(`asks:${symbol}`,0,-1))[0]).quantity).toBe(10);
    expect((await pool.query("SELECT 1 FROM book_sync_pending WHERE symbol=$1",[symbol])).rowCount).toBe(1);
    await syncBook(symbol);
    expect(await redisClient.lRange(`asks:${symbol}`,0,-1)).toEqual([]);
    const bids = (await redisClient.lRange(`bids:${symbol}`,0,-1)).map(x => JSON.parse(x));
    expect(bids.reduce((sum, o) => sum+o.quantity,0)).toBe(4);
    expect((await pool.query("SELECT 1 FROM book_sync_pending WHERE symbol=$1",[symbol])).rowCount).toBe(0);
  });
});
