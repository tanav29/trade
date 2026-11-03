import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import Providers from "@/components/provider";
import { Nav } from "@/components/Navbar";
import { cn } from "@/lib/utils";
import NextTopLoader from "nextjs-toploader";

const geist = Geist({
  weight: "variable",
  subsets: ["latin"],
});

export const metadata = {
  title: "TradeX",
  description: "Trading System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={cn(
          "min-h-screen mx-auto bg-background text-foreground",
          geist.className,
        )}
      >
        <a href="#main-content" className="fixed -top-20 left-4 z-[100] rounded bg-slate-100 px-4 py-2 text-slate-950 focus:top-4">Skip to content</a>
        <NextTopLoader showSpinner={false} />
        <Providers>
          <Nav />
          <div id="main-content" tabIndex={-1}>{children}</div>
        </Providers>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
