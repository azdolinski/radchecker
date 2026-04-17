import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppShell({
  title,
  breadcrumb,
  actions,
  children,
}: {
  title?: string;
  breadcrumb?: string[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[color:var(--color-background)]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-card)] px-6">
          <div className="flex items-center gap-3">
            {breadcrumb && breadcrumb.length > 0 ? (
              <nav className="flex items-center gap-1.5 text-sm text-[color:var(--color-muted-foreground)]">
                {breadcrumb.map((crumb, i) => (
                  <span key={`${crumb}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 ? <span className="text-xs opacity-50">/</span> : null}
                    <span
                      className={
                        i === breadcrumb.length - 1
                          ? "text-[color:var(--color-foreground)] font-medium"
                          : ""
                      }
                    >
                      {crumb}
                    </span>
                  </span>
                ))}
              </nav>
            ) : title ? (
              <h1 className="text-sm font-medium">{title}</h1>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
