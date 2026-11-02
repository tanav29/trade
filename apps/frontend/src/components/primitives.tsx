import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "default", size = "default", asChild, children, ...props }: React.ComponentProps<"button"> & { variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"; size?: "default" | "sm" | "lg" | "icon"; asChild?: boolean }) {
  const styles = cn("inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed", size === "lg" ? "h-11 px-6" : size === "sm" ? "h-8 px-3 text-xs" : size === "icon" ? "h-9 w-9" : "h-9 px-4 text-sm", variant === "outline" ? "border border-slate-600 hover:bg-slate-800" : variant === "ghost" ? "hover:bg-slate-800" : variant === "destructive" ? "bg-red-600 text-white hover:bg-red-700" : variant === "secondary" ? "bg-slate-700 text-white" : variant === "link" ? "underline" : "bg-blue-600 text-white hover:bg-blue-500", className);
  if (asChild && React.isValidElement<{ className?: string }>(children)) return React.cloneElement(children, { className: cn(styles, children.props.className) });
  return <button className={styles} {...props}>{children}</button>;
}
export function Card({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="card" className={cn("flex flex-col gap-6 rounded-lg border border-slate-700 bg-slate-900 py-6 text-slate-100", className)} {...props} />; }
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("grid gap-1.5 px-6", className)} {...props} />; }
export function CardTitle({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("font-semibold leading-none", className)} {...props} />; }
export function CardDescription({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("text-sm text-slate-400", className)} {...props} />; }
export function CardContent({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("px-6", className)} {...props} />; }
export function CardFooter({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("flex items-center px-6", className)} {...props} />; }
export function Input({ className, ...props }: React.ComponentProps<"input">) { return <input className={cn("h-10 w-full rounded-md border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500", className)} {...props} />; }
export function Label({ className, ...props }: React.ComponentProps<"label">) { return <label className={cn("text-sm font-medium", className)} {...props} />; }
