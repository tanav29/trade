import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { symbols, portfolios } from "../schema";
import auth from "../middleware/jwt";
import { isAdmin } from "../admin";

const router = new Hono();
router.use("*", auth);
router.post("/symbols", async (c) => {
  if (!isAdmin(c.get("jwt").id)) return c.json({ msg: "Admin access required." }, 403);
  const input = z.object({
    symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,10}$/),
    name: z.string().trim().min(1).max(255),
    initialShares: z.number().int().positive().max(1000000000),
  }).safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ msg: "Enter a name and a symbol of 1?10 letters or numbers." }, 400);
  const { symbol, name, initialShares } = input.data;
  const created = await db.transaction(async (tx) => {
    const [stock] = await tx.insert(symbols).values({ symbol, name }).onConflictDoNothing().returning();
    if (stock) await tx.insert(portfolios).values({ userId: c.get("jwt").id, symbol, quantity: String(initialShares) });
    return stock;
  });
  if (!created) return c.json({ msg: "This symbol already exists." }, 409);
  return c.json(created, 201);
});
export default router;
