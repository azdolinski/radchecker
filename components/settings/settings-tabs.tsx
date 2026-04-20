"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Database } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

type TabDef = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const tabs: TabDef[] = [
  { href: "/settings/data", label: "Data", icon: Database },
  { href: "/settings/backup", label: "Backup", icon: Archive },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 p-1">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-[color:var(--color-background)] text-[color:var(--color-foreground)] shadow-sm"
                : "text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
