import Link from "next/link";
import { FlaskConical, Gauge, Radio, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { JobsList } from "@/components/jobs/jobs-list";

const features = [
  {
    href: "/coa",
    icon: Radio,
    title: "CoA Server",
    blurb:
      "Run a CoA simulator (UDP 3799) and inspect incoming RADIUS packets in real time.",
  },
  {
    href: "/client",
    icon: Users,
    title: "Client Emulator",
    blurb:
      "Emulate individual RADIUS clients with the full Auth → Accounting-Start → Interim → Stop lifecycle.",
  },
  {
    href: "/perf",
    icon: Gauge,
    title: "Performance Test",
    blurb:
      "Sustained load test against a target server with configurable users, concurrency, and duration.",
  },
  {
    href: "/tests",
    icon: FlaskConical,
    title: "YAML Tests",
    blurb:
      "Editor and runner for YAML test fixtures compatible with FreeRADIUS (Access / Accounting / CoA).",
  },
];

export default function DashboardPage() {
  return (
    <AppShell breadcrumb={["Dashboard"]}>
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">radchecker</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            Lightweight FreeRADIUS testing toolkit — no database, no auth, everything local.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {features.map(({ href, icon: Icon, title, blurb }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5 transition-colors hover:border-[color:var(--color-primary)]/60"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="mt-4 text-base font-medium">{title}</h2>
              <p className="mt-1.5 text-sm text-[color:var(--color-muted-foreground)]">{blurb}</p>
            </Link>
          ))}
        </div>

        <div className="mt-10 space-y-3">
          <h3 className="text-sm font-medium">Jobs</h3>
          <JobsList />
        </div>
      </div>
    </AppShell>
  );
}
