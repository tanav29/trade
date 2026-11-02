"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SymbolInfo } from "@/types";

export default function AdminPage() {
  const client = useQueryClient();
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [initialShares, setInitialShares] = useState("1000");
  const { data: session, isPending } = useQuery({ queryKey: ["user"], queryFn: () => api<{ user: { isAdmin: boolean } }>("/user/verify"), retry: false });
  const { data: stocks } = useQuery({ queryKey: ["symbols"], queryFn: () => api<SymbolInfo[]>("/symbols") });
  const add = useMutation({ mutationFn: () => api("/admin/symbols", { method: "POST", body: JSON.stringify({ symbol, name, initialShares: Number(initialShares) }) }), onSuccess: () => { setSymbol(""); setName(""); client.invalidateQueries({ queryKey: ["symbols"] }); } });
  function submit(event: FormEvent) { event.preventDefault(); add.mutate(); }
  if (isPending) return <main className="p-8">Loading?</main>;
  if (!session?.user.isAdmin) return <main className="p-8">Admin access required.</main>;
  return <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
    <div><h1 className="text-2xl font-semibold">Stock administration</h1><p className="text-muted-foreground mt-1">Add stocks and allocate their initial shares to your account.</p></div>
    <form onSubmit={submit} className="border rounded-lg p-5 flex flex-wrap gap-4 items-end">
      <label className="grid gap-2 text-sm">Symbol<input required maxLength={10} value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} className="border rounded px-3 py-2 bg-background" placeholder="e.g. ACME" /></label>
      <label className="grid gap-2 text-sm flex-1 min-w-48">Company name<input required maxLength={255} value={name} onChange={e => setName(e.target.value)} className="border rounded px-3 py-2 bg-background" placeholder="e.g. Acme Inc." /></label>
      <label className="grid gap-2 text-sm">Initial shares<input type="number" min="1" max="1000000000" step="1" required value={initialShares} onChange={e => setInitialShares(e.target.value)} className="border rounded px-3 py-2 bg-background w-32" /></label>
      <button disabled={add.isPending} className="bg-primary text-primary-foreground rounded px-4 py-2 disabled:opacity-50">{add.isPending ? "Adding?" : "Add stock"}</button>
      {add.isError && <p role="alert" className="w-full text-sm text-red-600">{add.error.message}</p>}
      {add.isSuccess && <p role="status" className="w-full text-sm text-emerald-600">Stock added.</p>}
    </form>
    <section><h2 className="font-semibold mb-3">Listed stocks</h2><div className="border rounded-lg divide-y">{stocks?.map(stock => <div key={stock.id} className="flex gap-6 px-4 py-3 text-sm"><strong className="w-24">{stock.symbol}</strong><span className="text-muted-foreground">{stock.name}</span></div>)}</div></section>
  </main>;
}
