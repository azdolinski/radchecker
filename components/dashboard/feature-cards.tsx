"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical, Gauge, Radio, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { JobKind, JobSnapshot } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

type FeatureCard = {
  href: string;
  kind: JobKind;
  icon: typeof Radio;
  title: string;
  blurb: string;
};

const FEATURES: FeatureCard[] = [
  {
    href: "/coa",
    kind: "coa-server",
    icon: Radio,
    title: "CoA Server",
    blurb:
      "Run a CoA simulator (UDP 3799) and inspect incoming RADIUS packets in real time.",
  },
  {
    href: "/client",
    kind: "client-session",
    icon: Users,
    title: "Client Emulator",
    blurb:
      "Emulate individual RADIUS clients with the full Auth → Accounting-Start → Interim → Stop lifecycle.",
  },
  {
    href: "/perf",
    kind: "perf-test",
    icon: Gauge,
    title: "Performance Test",
    blurb:
      "Sustained load test against a target server with configurable users, concurrency, and duration.",
  },
  {
    href: "/tests",
    kind: "test-run",
    icon: FlaskConical,
    title: "YAML Tests",
    blurb:
      "Editor and runner for YAML test fixtures compatible with FreeRADIUS (Access / Accounting / CoA).",
  },
];

function isActive(status: JobSnapshot["status"]) {
  return status === "running" || status === "starting" || status === "stopping";
}

export function DashboardFeatureCards() {
  const [counts, setCounts] = useState<Record<JobKind, number>>({
    "coa-server": 0,
    "coa-send": 0,
    "client-session": 0,
    "test-run": 0,
    "perf-test": 0,
  });

  useEffect(() => {
    let aborted = false;
    const load = async () => {
      try {
        const res = await fetch("/api/jobs");
        const data = (await res.json()) as { jobs?: JobSnapshot[] };
        if (aborted) return;
        const next: Record<JobKind, number> = {
          "coa-server": 0,
          "coa-send": 0,
          "client-session": 0,
          "test-run": 0,
          "perf-test": 0,
        };
        for (const j of data.jobs ?? []) {
          if (isActive(j.status)) next[j.kind] = (next[j.kind] ?? 0) + 1;
        }
        setCounts(next);
      } catch {
        // silent — cards stay in last-known state
      }
    };
    load();
    const t = setInterval(load, 2000);
    return () => {
      aborted = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map(({ href, kind, icon: Icon, title, blurb }) => {
        const count = counts[kind] ?? 0;
        const active = count > 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group rounded-lg border p-5 transition-colors",
              active
                ? "border-emerald-500/40 bg-emerald-500/10 hover:border-[color:var(--color-primary)]/60"
                : "border-[color:var(--color-border)] bg-[color:var(--color-card)] hover:border-[color:var(--color-primary)]/60",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
                <Icon className="h-4 w-4" />
              </div>
              {active ? (
                <Badge tone="running">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-80"
                    aria-hidden
                  />
                  {count > 1 ? `Running ${count}` : "Running"}
                </Badge>
              ) : null}
            </div>
            <h2 className="mt-4 text-base font-medium">{title}</h2>
            <p className="mt-1.5 text-sm text-[color:var(--color-muted-foreground)]">{blurb}</p>
          </Link>
        );
      })}
    </div>
  );
}
