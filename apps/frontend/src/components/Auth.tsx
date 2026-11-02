"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/primitives";
import { useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth";

type VerifyResponse = {
  user: {
    id: number | string;
    name: string;
    email: string;
    isAdmin: boolean;
  };
};

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trade", label: "Trade" },
  { href: "/order", label: "Orders" },
  { href: "/transactions", label: "Transactions" },
] as const;

function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex items-center gap-4 whitespace-nowrap text-sm font-medium text-muted-foreground">
      {navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="hover:text-foreground transition-colors"
        >
          {link.label}
        </Link>
      ))}
      {isAdmin && <Link href="/admin" className="hover:text-foreground">Admin</Link>}
    </div>
  );
}

export default function Auth() {
  const router = useRouter();
  const { user, isAuthenticated, setUser, setAuthenticated, clearAuth } =
    useAuthStore();

  const { data, isError, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: async () => api<VerifyResponse>("/user/verify"),
    retry: false,
    staleTime: 60_000,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => await api("/auth/logout"),
  });

  const handleSignOut = useCallback(() => {
    localStorage.removeItem("token");
    clearAuth();
    mutate(undefined, {
      onSettled: () => router.push("/"),
    });
  }, [clearAuth, mutate, router]);

  useEffect(() => {
    if (data?.user) {
      setUser({
        id: String(data.user.id),
        name: data.user.name,
        email: data.user.email,
      });
      setAuthenticated(true);
      return;
    }
    if (isError) {
      setUser(null);
      setAuthenticated(false);
    }
  }, [data, isError, setAuthenticated, setUser]);

  if (isLoading && !isAuthenticated) {
    return (
      <Button variant="ghost" disabled>
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  const signedIn = !!user || (!!data?.user && !isError);

  if (!signedIn) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="ghost" asChild>
          <Link href="/login">Sign In</Link>
        </Button>
        <Button asChild>
          <Link href="/signup">Create Account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-4">
      <NavLinks isAdmin={!!data?.user.isAdmin} />
      <Button variant="outline" onClick={handleSignOut} disabled={isPending}>
        {isPending && <Loader2 className="w-5 h-5 animate-spin" />}
        Sign Out
      </Button>
    </div>
  );
}
