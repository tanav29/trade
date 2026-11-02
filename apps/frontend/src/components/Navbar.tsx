import Link from "next/link";
import { TrendingUp } from "lucide-react";
import Auth from "./Auth";

export const Nav = () => {
  return (
    <nav className="border-b border-slate-800 bg-slate-950 sticky top-0 z-50 overflow-x-auto">
      <div className="flex min-h-16 items-center justify-between gap-6 px-4 sm:px-6 max-w-[1800px] mx-auto">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">TradeX</span>
          </Link>
        </div>
        <Auth /> 
      </div>
    </nav>
  );
};
