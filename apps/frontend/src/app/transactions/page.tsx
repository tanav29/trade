import Transactions from "@/components/Transactions";

export default function TransactionsPage() {
  return (
    <div className="max-w-6xl px-2 py-3 sm:px-4 mx-auto">
      <h1 className="text-2xl font-bold mb-4">Transactions</h1>
      <Transactions />
    </div>
  );
}
