import {
  pgTable,
  serial,
  varchar,
  numeric,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  password: varchar("password", { length: 255 }),
  cash: numeric("cash"),
  stock: numeric("stock"),
  createdAt: timestamp().defaultNow(),
});

export const symbols = pgTable("symbols", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 10 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  quantity: numeric("quantity").notNull().default("0"),
});

export const candles = pgTable("candles", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  timestamp: timestamp("timestamp").notNull(),
  open: numeric("open").notNull(),
  high: numeric("high").notNull(),
  low: numeric("low").notNull(),
  close: numeric("close").notNull(),
  volume: numeric("volume").notNull().default("0"),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  symbol: varchar("symbol", { length: 10 }).default("TNV"),
  type: varchar("type", { length: 10 }),
  quantity: numeric("quantity"),
  price: numeric("price"),
  timestamp: timestamp().defaultNow(),
});

/** Persistent order lifecycle (open / filled / cancelled / partial). */
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderId: varchar("order_id", { length: 64 }).notNull().unique(),
  userId: integer("user_id").notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  side: varchar("side", { length: 4 }).notNull(), // bid | ask
  price: numeric("price").notNull().default("0"),
  quantity: integer("quantity").notNull(),
  filledQuantity: integer("filled_quantity").notNull().default(0),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  market: boolean("market").notNull().default(false),
  idempotencyKey: varchar("idempotency_key", { length: 128 }),
  requestFingerprint: varchar("request_fingerprint"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

