"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Gauge,
  IdCard,
  LayoutDashboard,
  Radio,
  Send,
  Server,
  Settings,
  User,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

type LeafItem = {
  kind: "leaf";
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
};

type GroupItem = {
  kind: "group";
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Submenu shown when the group is expanded; auto-expands on these paths. */
  children: LeafItem[];
};

type NavItem = LeafItem | GroupItem;

const mainItems: NavItem[] = [
  { kind: "leaf", href: "/", label: "Dashboard", icon: LayoutDashboard },
  { kind: "leaf", href: "/coa", label: "CoA Server", icon: Radio },
  { kind: "leaf", href: "/coa-sender", label: "CoA Sender", icon: Send },
  { kind: "leaf", href: "/client", label: "Radius Client", icon: Users },
  { kind: "leaf", href: "/perf", label: "Perf Test", icon: Gauge },
  { kind: "leaf", href: "/tests", label: "Tests", icon: FlaskConical },
  {
    kind: "group",
    label: "Profiles",
    icon: IdCard,
    children: [
      { kind: "leaf", href: "/profiles/servers", label: "Radius server", icon: Server },
      { kind: "leaf", href: "/profiles/clients", label: "Radius client", icon: User },
    ],
  },
];

const bottomItems: LeafItem[] = [
  { kind: "leaf", href: "/settings", label: "Settings", icon: Settings },
];

function isLeafActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function renderLeaf(item: LeafItem, pathname: string, nested: boolean) {
  const { href, label, icon: Icon, badge } = item;
  const isActive = isLeafActive(href, pathname);
  return (
    <Link
      key={href}
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        nested && "ml-5",
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
}

function NavGroup({ item, pathname }: { item: GroupItem; pathname: string }) {
  const hasActiveChild = item.children.some((c) => isLeafActive(c.href, pathname));
  const [open, setOpen] = useState(hasActiveChild);
  const expanded = open || hasActiveChild;

  const Icon = item.icon;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          hasActiveChild
            ? "text-[color:var(--color-foreground)] font-medium"
            : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-foreground)]",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{item.label}</span>
        <Chevron className="h-3.5 w-3.5 opacity-70" />
      </button>
      {expanded ? (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => renderLeaf(child, pathname, true))}
        </div>
      ) : null}
    </div>
  );
}

function renderItem(item: NavItem, pathname: string) {
  if (item.kind === "leaf") return renderLeaf(item, pathname, false);
  return <NavGroup key={item.label} item={item} pathname={pathname} />;
}

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
        {mainItems.map((item) => renderItem(item, pathname))}
      </nav>

      <nav className="space-y-0.5 px-3 py-2">
        {bottomItems.map((item) => renderLeaf(item, pathname, false))}
      </nav>

      <div className="px-5 py-3 text-[11px] text-[color:var(--color-muted-foreground)]">
        RadChecker · v0.1
      </div>
    </aside>
  );
}
