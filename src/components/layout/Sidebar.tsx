"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  CreditCard,
  Users,
  Settings,
  Zap,
  Menu,
  X,
} from "lucide-react";

const navItems = [
  { label: "Ads Command", href: "/ads-command", icon: Zap },
  { label: "P&L Dashboard", href: "/pnl", icon: TrendingUp },
  { label: "Accounts Payable", href: "/payables", icon: CreditCard },
  { label: "Clients", href: "/clients", icon: Users },
];

function NavLinks({ pathname, onNav }: { pathname: string; onNav?: () => void }) {
  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNav}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-4">
        <Link
          href="/settings"
          onClick={onNav}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
      </div>
    </>
  );
}

function Logo() {
  return (
    <div className="flex h-16 items-center gap-2 border-b border-border px-5">
      <LayoutDashboard className="h-5 w-5 text-primary" />
      <span className="text-sm font-semibold tracking-tight">Ads Intelligence</span>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex h-screen w-60 flex-col border-r border-border bg-card">
        <Logo />
        <NavLinks pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center border-b border-border bg-card px-4">
        <button
          aria-label="Open menu"
          className="mr-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <LayoutDashboard className="h-4 w-4 text-primary mr-2" />
        <span className="text-sm font-semibold">Ads Intelligence</span>
      </div>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "md:hidden fixed top-0 left-0 bottom-0 z-50 flex w-64 flex-col bg-card border-r border-border transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Ads Intelligence</span>
          </div>
          <button
            aria-label="Close menu"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            onClick={() => setMobileOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <NavLinks pathname={pathname} onNav={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
