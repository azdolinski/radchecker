"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FlaskConical, Gauge, Radio, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/jobs/status-badge";
import type { JobKind, JobSnapshot } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

const ICON: Record<JobKind, typeof Radio> = {
  "coa-server": Radio,
  "coa-send": Send,
  "client-session": Users,
  "test-run": FlaskConical,
  "perf-test": Gauge,
};

const LABEL: Record<JobKind, string> = {
  "coa-server": "CoA Server",
  "coa-send": "CoA Send",
  "client-session": "Client Session",
  "test-run": "Test Run",
  "perf-test": "Perf Test",
};

function fmtSince(ts?: number) {
  if (!ts) return "—";
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

export function JobsList() {
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let aborted = false;
    const load = async () => {
      try {
        const res = await fetch("/api/jobs");
        const data = (await res.json()) as { jobs?: JobSnapshot[] };
        if (!aborted) setJobs(data.jobs ?? []);
      } finally {
        if (!aborted) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 2000);
    return () => {
      aborted = true;
      clearInterval(t);
    };
  }, []);

  const onStop = async (id: string) => {
    const res = await fetch(`/api/jobs/${id}/stop`, { method: "POST" });
    if (res.ok) toast.info("Stop signal sent");
  };

  const onRemove = async (id: string) => {
    const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.info("Job removed");
      setJobs((prev) => prev.filter((j) => j.id !== id));
    }
  };

  const openDetail = (id: string) => router.push(`/jobs/${id}`);

  if (loading) {
    return (
      <div className="text-xs text-[color:var(--color-muted-foreground)]">Loading…</div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-card)]/50 p-6 text-center">
        <p className="text-sm">No active jobs</p>
        <p className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
          Start a CoA server, client emulator session, or a YAML test batch to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)]">
      <table className="w-full text-sm">
        <thead className="border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 text-[11px] uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Type</th>
            <th className="px-4 py-2 text-left font-medium">Name</th>
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Since</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const Icon = ICON[j.kind];
            const active =
              j.status === "running" || j.status === "starting" || j.status === "stopping";
            return (
              <tr
                key={j.id}
                onClick={() => openDetail(j.id)}
                className={cn(
                  "cursor-pointer border-b border-[color:var(--color-border)] last:border-b-0",
                  "transition-colors hover:bg-[color:var(--color-muted)]/40",
                )}
              >
                <td className="px-4 py-2">
                  <div className="inline-flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-[color:var(--color-primary)]" />
                    <span className="text-xs">{LABEL[j.kind]}</span>
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{j.name}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={j.status} />
                </td>
                <td className="px-4 py-2 text-xs text-[color:var(--color-muted-foreground)]">
                  {fmtSince(j.startedAt ?? j.createdAt)}
                </td>
                <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openDetail(j.id)}
                      title="Open detail view"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {active ? (
                      <Button size="sm" variant="outline" onClick={() => onStop(j.id)}>
                        Stop
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onRemove(j.id)}
                      title="Remove from list"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
