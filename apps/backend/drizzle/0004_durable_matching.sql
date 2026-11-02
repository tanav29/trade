ALTER TABLE orders ADD COLUMN idempotency_key varchar(128);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN request_fingerprint text;
--> statement-breakpoint
CREATE UNIQUE INDEX orders_user_idempotency_key ON orders (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
CREATE TABLE book_sync_pending (symbol varchar(10) PRIMARY KEY);
