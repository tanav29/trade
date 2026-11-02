// Run against an isolated, pre-funded account and a non-crossing symbol/price.
const base = process.env.LOAD_URL ?? "http://localhost:8080";
const cookie = process.env.LOAD_COOKIE;
const symbol = process.env.LOAD_SYMBOL;
const volume = Number(process.env.LOAD_ORDERS ?? 1000);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 20);
if (!cookie || !symbol || !Number.isInteger(volume) || volume < 1 || !Number.isInteger(concurrency) || concurrency < 1) throw new Error("Set LOAD_COOKIE and LOAD_SYMBOL; volume and concurrency must be positive integers.");
const latencies: number[] = [];
let next = 0, errors = 0;
const start = performance.now();
await Promise.all(Array.from({length: concurrency}, async () => {
  while (true) {
    const i = next++;
    if (i >= volume) return;
    const t = performance.now();
    try {
      const res = await fetch(`${base}/trade/makeorder`, { method: "POST", headers: { "content-type": "application/json", cookie, "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({symbol,side:"bid",price:0.01,quantity:1,market:false}) });
      const body = await res.json() as {ok?: boolean};
      if (!res.ok || !body.ok) errors++;
    } catch { errors++; }
    latencies.push(performance.now()-t);
  }
}));
latencies.sort((a,b) => a-b);
const percentile = (p: number) => latencies[Math.ceil(p*latencies.length)-1].toFixed(2);
console.log(JSON.stringify({volume,concurrency,p50_ms:percentile(.50),p95_ms:percentile(.95),errors,error_rate:errors/volume,elapsed_ms:Math.round(performance.now()-start),runtime:`Bun ${Bun.version}`,platform:`${process.platform} ${process.arch}`},null,2));
