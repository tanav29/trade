
export type DepthPayload = {
  symbol: string;
  asks: { price: number; quantity: number }[];
  bids: { price: number; quantity: number }[];
};

type SseClient = {
  id: string;
  symbol: string;
  send: (event: string, data: unknown) => Promise<void>;
  close: () => void;
};

const clients = new Map<string, SseClient>();

export function registerSseClient(client: SseClient) {
  clients.set(client.id, client);
}

export function unregisterSseClient(id: string) {
  clients.delete(id);
}

export function getSseClientCount(symbol?: string) {
  if (!symbol) return clients.size;
  let count = 0;
  for (const client of clients.values()) {
    if (client.symbol === symbol) count += 1;
  }
  return count;
}

async function emitToSymbol(symbol: string, event: string, data: unknown) {
  const tasks: Promise<void>[] = [];

  for (const client of clients.values()) {
    if (client.symbol !== symbol) continue;
    tasks.push(sendWithTimeout(client, event, data));
  }

  await Promise.all(tasks);
}

async function sendWithTimeout(client: SseClient, event: string, data: unknown) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.send(event, data),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("SSE client timed out")), 5000);
      }),
    ]);
  } catch {
    client.close();
    if (clients.get(client.id) === client) clients.delete(client.id);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function broadcastDepth(payload: DepthPayload) {
  return emitToSymbol(payload.symbol, "depth", payload);
}

export function broadcastPrice(symbol: string, time: number, price: number) {
  return emitToSymbol(symbol, "price", { time, price });
}
