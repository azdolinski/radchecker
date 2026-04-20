"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, Gauge, Radio, Send, Square, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogLine } from "@/components/jobs/log-line";
import { StatusBadge } from "@/components/jobs/status-badge";
import { useJobLogs } from "@/hooks/useJobLogs";
import type { JobKind, JobSnapshot } from "@/lib/jobs/types";

const KIND_ICON: Record<JobKind, typeof Radio> = {
  "coa-server": Radio,
  "coa-send": Send,
  "client-session": Users,
  "test-run": FlaskConical,
  "perf-test": Gauge,
};

const KIND_LABEL: Record<JobKind, string> = {
  "coa-server": "CoA Server",
  "coa-send": "CoA Send",
  "client-session": "Client Session",
  "test-run": "Test Run",
  "perf-test": "Performance Test",
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function JobDetail({ snapshot }: { snapshot: JobSnapshot }) {
  const live = useJobLogs(snapshot.id);
  const Icon = KIND_ICON[snapshot.kind];

  const effectiveStatus = live.status !== "disconnected" ? live.status : snapshot.status;
  const error = live.error ?? snapshot.error;

  const uptime = useMemo(() => {
    const start = snapshot.startedAt ?? snapshot.createdAt;
    const end = snapshot.endedAt ?? Date.now();
    return end - start;
  }, [snapshot]);

  const onStop = useCallback(async () => {
    const res = await fetch(`/api/jobs/${snapshot.id}/stop`, { method: "POST" });
    if (res.ok) toast.info("Stop signal sent");
    else toast.error("Stop failed");
  }, [snapshot.id]);

  const onDelete = useCallback(async () => {
    if (!confirm(`Delete job ${snapshot.name}?`)) return;
    const res = await fetch(`/api/jobs/${snapshot.id}`, { method: "DELETE" });
    if (res.ok) toast.info("Job removed");
  }, [snapshot.id, snapshot.name]);

  const canStop =
    effectiveStatus === "running" ||
    effectiveStatus === "starting" ||
    effectiveStatus === "stopping";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[color:var(--color-border)] text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {snapshot.name}
              <StatusBadge status={effectiveStatus} />
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
              {KIND_LABEL[snapshot.kind]} · {snapshot.id}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canStop ? (
            <Button variant="destructive" size="sm" onClick={onStop}>
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </div>

      {/* Metadata + stats */}
      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Uptime" value={fmtDuration(uptime)} />
        <Kpi
          label="Started"
          value={snapshot.startedAt ? fmtDateTime(snapshot.startedAt) : "—"}
        />
        <Kpi
          label="Ended"
          value={
            snapshot.endedAt
              ? fmtDateTime(snapshot.endedAt)
              : effectiveStatus === "running"
                ? "in progress"
                : "—"
          }
        />
        <Kpi label="Logs" value={live.logs.length} />
      </div>

      {/* Error banner */}
      {error ? (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-4 text-xs text-red-600 dark:text-red-400">
            <div className="mb-1 font-semibold">Error</div>
            <div className="font-mono">{error}</div>
          </CardContent>
        </Card>
      ) : null}

      {/* Config + stats grid */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="py-3">
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <JsonView value={snapshot.config} />
          </CardContent>
        </Card>
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="py-3">
            <CardTitle>Live stats</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <JsonView value={filterInternalKeys(live.stats)} />
          </CardContent>
        </Card>
      </div>

      {/* Log stream */}
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex-row items-center justify-between py-3">
          <CardTitle>Log stream</CardTitle>
          <div className="text-[11px] text-[color:var(--color-muted-foreground)]">
            {live.logs.length} lines · SSE {live.status === "disconnected" ? "disconnected" : "live"}
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto pt-0">
          <div className="space-y-0.5 font-mono text-[11px]">
            {live.logs.length === 0 ? (
              <p className="text-[color:var(--color-muted-foreground)]">
                No log entries yet.
              </p>
            ) : (
              live.logs.map((log, i) => <LogLine key={`${log.ts}-${i}`} log={log} />)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] text-[color:var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 font-mono text-base font-semibold">{value}</div>
    </Card>
  );
}

function filterInternalKeys(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith("_")) continue;
    out[k] = v;
  }
  return out;
}

function JsonView({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <div className="text-xs text-[color:var(--color-muted-foreground)]">—</div>;
  }
  return (
    <pre className="max-h-72 overflow-auto rounded-md bg-[color:var(--color-background)] p-3 font-mono text-[11px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
