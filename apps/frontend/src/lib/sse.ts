type DepthHandler = (payload: unknown) => void;
type PriceHandler = (payload: unknown) => void;

type SymbolStream = {
  source: EventSource;
  refCount: number;
  depthHandlers: Set<DepthHandler>;
  priceHandlers: Set<PriceHandler>;
};

const streams = new Map<string, SymbolStream>();

function getBaseUrl() {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;
  return base.replace(/\/$/, "");
}

function ensureStream(symbol: string): SymbolStream | null {
  const existing = streams.get(symbol);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  const base = getBaseUrl();
  if (!base) return null;

  const url = `${base}/events?symbol=${encodeURIComponent(symbol)}`;
  let source: EventSource;
  try {
    source = new EventSource(url, { withCredentials: true });
  } catch {
    return null;
  }

  const stream: SymbolStream = {
    source,
    refCount: 1,
    depthHandlers: new Set(),
    priceHandlers: new Set(),
  };

  source.addEventListener("depth", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data);
      for (const handler of stream.depthHandlers) handler(payload);
    } catch {
      // ignore
    }
  });

  source.addEventListener("price", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data);
      for (const handler of stream.priceHandlers) handler(payload);
    } catch {
      // ignore
    }
  });

  source.onerror = () => {
    // Browser auto-reconnects EventSource; nothing to do here
  };

  streams.set(symbol, stream);
  return stream;
}

export function subscribeMarketStream(
  symbol: string,
  handlers: { onDepth?: DepthHandler; onPrice?: PriceHandler },
) {
  const stream = ensureStream(symbol);
  if (!stream) {
    return () => {};
  }

  if (handlers.onDepth) stream.depthHandlers.add(handlers.onDepth);
  if (handlers.onPrice) stream.priceHandlers.add(handlers.onPrice);

  return () => {
    if (handlers.onDepth) stream.depthHandlers.delete(handlers.onDepth);
    if (handlers.onPrice) stream.priceHandlers.delete(handlers.onPrice);

    stream.refCount = Math.max(0, stream.refCount - 1);
    if (stream.refCount === 0) {
      stream.source.close();
      streams.delete(symbol);
    }
  };
}
