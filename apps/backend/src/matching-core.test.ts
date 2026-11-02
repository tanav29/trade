import { describe, expect, test } from "bun:test";
import { findInsertIndex, matchAgainstBook } from "./matching-core";
import type { Order } from "./types";

function order(
  partial: Partial<Order> & Pick<Order, "orderId" | "userId" | "price" | "quantity">,
): Order {
  return {
    symbol: "TNV",
    timestamp: partial.timestamp ?? 1000,
    ...partial,
  };
}

describe("matchAgainstBook", () => {
  test("an unmatched limit order can rest and be filled by a later order", () => {
    const first = matchAgainstBook("bid", 100, 5, 1, false, []);
    expect(first.remainingQty).toBe(5);
    expect(first.fills).toEqual([]);

    const resting = order({ orderId: "bid", userId: 1, price: 100, quantity: first.remainingQty });
    const later = matchAgainstBook("ask", 100, 3, 2, false, [resting]);
    expect(later.fills).toEqual([
      { makerOrderId: "bid", makerUserId: 1, price: 100, quantity: 3 },
    ]);
    expect(later.remainingBook[0].quantity).toBe(2);
  });

  test("bid matches lowest ask first (price-time priority)", () => {
    const book = [
      order({ orderId: "a2", userId: 2, price: 102, quantity: 5, timestamp: 1 }),
      order({ orderId: "a1", userId: 3, price: 100, quantity: 3, timestamp: 2 }),
      order({ orderId: "a3", userId: 4, price: 100, quantity: 2, timestamp: 1 }),
    ];

    const result = matchAgainstBook("bid", 101, 4, 1, false, book);

    expect(result.remainingQty).toBe(0);
    expect(result.fills).toEqual([
      // same price 100: earlier timestamp a3 first, then a1
      { makerOrderId: "a3", makerUserId: 4, price: 100, quantity: 2 },
      { makerOrderId: "a1", makerUserId: 3, price: 100, quantity: 2 },
    ]);
    expect(result.remainingBook).toEqual([
      order({ orderId: "a1", userId: 3, price: 100, quantity: 1, timestamp: 2 }),
      order({ orderId: "a2", userId: 2, price: 102, quantity: 5, timestamp: 1 }),
    ]);
  });

  test("limit bid does not match asks above limit price", () => {
    const book = [
      order({ orderId: "a1", userId: 2, price: 105, quantity: 10 }),
    ];
    const result = matchAgainstBook("bid", 100, 5, 1, false, book);
    expect(result.remainingQty).toBe(5);
    expect(result.fills).toEqual([]);
    expect(result.remainingBook).toHaveLength(1);
  });

  test("market bid crosses any ask", () => {
    const book = [
      order({ orderId: "a1", userId: 2, price: 999, quantity: 2 }),
    ];
    const result = matchAgainstBook("bid", 0, 2, 1, true, book);
    expect(result.remainingQty).toBe(0);
    expect(result.fills).toEqual([
      { makerOrderId: "a1", makerUserId: 2, price: 999, quantity: 2 },
    ]);
    expect(result.remainingBook).toEqual([]);
  });

  test("ask matches highest bid first", () => {
    const book = [
      order({ orderId: "b1", userId: 2, price: 98, quantity: 4 }),
      order({ orderId: "b2", userId: 3, price: 100, quantity: 3 }),
    ];
    const result = matchAgainstBook("ask", 99, 2, 1, false, book);
    expect(result.remainingQty).toBe(0);
    expect(result.fills).toEqual([
      { makerOrderId: "b2", makerUserId: 3, price: 100, quantity: 2 },
    ]);
    expect(result.remainingBook.map((o) => o.orderId)).toEqual(["b2", "b1"]);
    expect(result.remainingBook[0].quantity).toBe(1);
  });

  test("does not self-trade against own orders", () => {
    const book = [
      order({ orderId: "a1", userId: 1, price: 100, quantity: 5 }),
      order({ orderId: "a2", userId: 2, price: 101, quantity: 5 }),
    ];
    const result = matchAgainstBook("bid", 105, 3, 1, false, book);
    expect(result.fills).toEqual([
      { makerOrderId: "a2", makerUserId: 2, price: 101, quantity: 3 },
    ]);
    // own order preserved untouched
    expect(result.remainingBook.find((o) => o.orderId === "a1")?.quantity).toBe(
      5,
    );
  });

  test("partial fill leaves remainder on book", () => {
    const book = [
      order({ orderId: "a1", userId: 2, price: 50, quantity: 10 }),
    ];
    const result = matchAgainstBook("bid", 50, 4, 1, false, book);
    expect(result.remainingQty).toBe(0);
    expect(result.fills[0].quantity).toBe(4);
    expect(result.remainingBook[0].quantity).toBe(6);
  });

  test("insufficient liquidity leaves remainingQty", () => {
    const book = [
      order({ orderId: "a1", userId: 2, price: 10, quantity: 2 }),
    ];
    const result = matchAgainstBook("bid", 10, 5, 1, true, book);
    expect(result.remainingQty).toBe(3);
    expect(result.fills[0].quantity).toBe(2);
    expect(result.remainingBook).toEqual([]);
  });
});

describe("findInsertIndex", () => {
  test("inserts asks ascending by price then time", () => {
    const book = [
      order({ orderId: "a1", userId: 1, price: 100, quantity: 1, timestamp: 1 }),
      order({ orderId: "a2", userId: 1, price: 102, quantity: 1, timestamp: 1 }),
    ];
    const idx = findInsertIndex(
      book,
      order({ orderId: "n", userId: 1, price: 101, quantity: 1, timestamp: 5 }),
      true,
    );
    expect(idx).toBe(1);
  });

  test("inserts bids descending by price", () => {
    const book = [
      order({ orderId: "b1", userId: 1, price: 105, quantity: 1, timestamp: 1 }),
      order({ orderId: "b2", userId: 1, price: 100, quantity: 1, timestamp: 1 }),
    ];
    const idx = findInsertIndex(
      book,
      order({ orderId: "n", userId: 1, price: 103, quantity: 1, timestamp: 5 }),
      false,
    );
    expect(idx).toBe(1);
  });
});
