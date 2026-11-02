import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { rateLimiter } from "hono-rate-limiter";
import dotenv from "dotenv";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import tradeRoutes from "./routes/trade";
import adminRoutes from "./routes/admin";
import { db } from "./db";
import { symbols } from "./schema";
import { connectRedis } from "./redis";
import { registerSseClient, unregisterSseClient } from "./sse";
import { parseOrderbook } from "./matching";

dotenv.config();

export const app = new Hono();

const frontendOrigin =
  process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3000";

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  }),
);

const limiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: "Too many requests from this IP, please try again later.",
  keyGenerator: (c) =>
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For") ||
    "127.0.0.1",
});

app.use("*", limiter);

app.route("/trade", tradeRoutes);
app.route("/auth", authRoutes);
app.route("/user", userRoutes);
app.route("/admin", adminRoutes);

connectRedis().catch((err) => console.error("Redis connection error:", err));

app.get("/ping", (c) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/symbols", async (c) => {
  const allSymbols = await db.select().from(symbols);
  return c.json(allSymbols);
});

/** Server-Sent Events stream for live depth + chart updates. */
app.get("/events", async (c) => {
  const symbol = (c.req.query("symbol") || "TNV").toUpperCase();
  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return streamSSE(c, async (stream) => {
    let closed = false;

    const send = async (event: string, data: unknown) => {
      if (closed) return;
      await stream.writeSSE({
        event,
        data: JSON.stringify(data),
      });
    };

    const close = () => {
      closed = true;
    };

    registerSseClient({ id: clientId, symbol, send, close });

    // Seed current state so UI is immediately consistent
    try {
      const depth = await parseOrderbook(symbol);
      await send("depth", depth);
    } catch (err) {
      console.error("Failed to seed SSE client:", err);
    }

    // Keep-alive pings prevent proxies from closing idle connections
    while (!closed) {
      try {
        await stream.writeSSE({
          event: "ping",
          data: JSON.stringify({ t: Date.now() }),
        });
        await stream.sleep(25_000);
      } catch {
        closed = true;
      }
    }

    unregisterSseClient(clientId);
  });
});

const port = Number(process.env.PORT) || 8080;

serve({
  fetch: app.fetch,
  port,
});

console.log(`TradeX API listening on http://localhost:${port}`);
