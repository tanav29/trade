CREATE TABLE "candles" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"timestamp" timestamp NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"side" varchar(4) NOT NULL,
	"price" numeric DEFAULT '0' NOT NULL,
	"quantity" integer NOT NULL,
	"filled_quantity" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"market" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"quantity" numeric DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(10) NOT NULL,
	"name" varchar(255),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "symbols_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "symbol" varchar(10) DEFAULT 'TNV';