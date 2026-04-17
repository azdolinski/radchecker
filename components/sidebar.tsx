"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Database,
  FlaskConical,
  Gauge,
  IdCard,
  LayoutDashboard,
  Radio,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
};

const items: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coa", label: "CoA Server", icon: Radio },
  { href: "/client", label: "Client Emulator", icon: Users },
  { href: "/perf", label: "Perf Test", icon: Gauge },
  { href: "/profiles", label: "Profiles", icon: IdCard },
  { href: "/tests", label: "Tests", icon: FlaskConical },
  { href: "/data", label: "Data", icon: Database },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-card)]">
      <div className="flex h-14 items-center gap-2 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]">
          <Activity className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">radchecker</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-[color:var(--color-muted)] text-[color:var(--color-foreground)] font-medium"
                  : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-foreground)]",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {badge ? (
                <span className="rounded-full bg-[color:var(--color-primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-primary)]">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-3 text-[11px] text-[color:var(--color-muted-foreground)]">
        FreeRADIUS tooling · v0.1
      </div>
    </aside>
  );
}
