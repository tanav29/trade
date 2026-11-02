import { Hono } from "hono";
import { count, desc, eq } from "drizzle-orm";
import auth from "../middleware/jwt";
import { db } from "../db";
import { transactions, users, portfolios, symbols } from "../schema";
import { getUserByEmail } from "../helpers";
import { isAdmin } from "../admin";

const router = new Hono();

router.get("/", auth, async (c) => {
  const jwt = c.get("jwt");
  const user = await getUserByEmail(jwt.email);
  if (!user) {
    return c.json({ message: "User not found" }, 404);
  }

  const portfolio = await db
    .select()
    .from(portfolios)
    .where(eq(portfolios.userId, user.id));

  return c.json({
    cash: user.cash,
    portfolio: portfolio.map((p) => ({
      symbol: p.symbol,
      quantity: Number(p.quantity),
    })),
    createdAt: user.createdAt,
    email: user.email,
    name: user.name,
  });
});

router.get("/verify", auth, async (c) => {
  const jwt = c.get("jwt");
  return c.json({ user: { ...jwt, isAdmin: isAdmin(jwt.id) } });
});

router.get("/transactions", auth, async (c) => {
  const jwt = c.get("jwt");
  const user = await getUserByEmail(jwt.email);
  if (!user) {
    return c.json({ message: "User not found" }, 404);
  }

  const page = Math.max(1, Number(c.req.query("page") || 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 20)));
  const offset = (page - 1) * limit;

  const [totalRow] = await db
    .select({ total: count() })
    .from(transactions)
    .where(eq(transactions.user_id, user.id));

  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const data = await db
    .select()
    .from(transactions)
    .where(eq(transactions.user_id, user.id))
    .orderBy(desc(transactions.timestamp), desc(transactions.id))
    .limit(limit)
    .offset(offset);

  return c.json({
    data,
    page,
    limit,
    total,
    totalPages,
  });
});

router.get("/symbols", async (c) => {
  const allSymbols = await db.select().from(symbols);
  return c.json(allSymbols);
});

router.get("/u/:id", async (c) => {
  const id = c.req.param("id");
  const row = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, Number(id)));
  const user = row[0];
  if (!user) {
    return c.json({ message: "User not found" }, 404);
  }
  return c.json(user);
});

export default router;
