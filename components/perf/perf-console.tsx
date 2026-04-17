"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gauge, Play, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, SelectField, Section } from "@/components/ui/field";
import { StatusBadge } from "@/components/jobs/status-badge";
import { useJobLogs } from "@/hooks/useJobLogs";
import type { JobSnapshot, LogEntry } from "@/lib/jobs/types";
import type { ServerConfig } from "@/lib/storage/schemas";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set(["starting", "running", "stopping"]);

interface FormState {
  server: string;
  users: number;
  duration: number;
  concurrency: number;
  timeoutMs: number;
}

const INITIAL: FormState = {
  server: "",
  users: 1000,
  duration: 30,
  concurrency: 100,
  timeoutMs: 5000,
};

interface PerfStats {
  sent?: number;
  accept?: number;
  reject?: number;
  timeout?: number;
  errors?: number;
  rpsRolling?: number;
  elapsedMs?: number;
  durationMs?: number;
  latency?: {
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

function fmtMs(x?: number) {
  if (x === undefined || x === 0) return "—";
  if (x < 10) return `${x.toFixed(1)} ms`;
  return `${Math.round(x)} ms`;
}

export function PerfConsole() {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const live = useJobLogs(jobId);
  const stats = (live.stats ?? {}) as PerfStats;

  useEffect(() => {
    fetch("/api/servers")
      .then((r) => r.json() as Promise<{ servers?: ServerConfig[] }>)
      .then((data) => {
        const arr = data.servers ?? [];
        setServers(arr);
        setForm((prev) => ({ ...prev, server: prev.server || arr[0]?.name || "" }));
      });
  }, []);

  // Re-attach to any running perf-test job on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jobs");
        if (!res.ok) return;
        const data = (await res.json()) as { jobs?: JobSnapshot[] };
        const active = (data.jobs ?? [])
          .filter((j) => j.kind === "perf-test" && ACTIVE_STATUSES.has(j.status))
          .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt))[0];
        if (!cancelled && active) {
          setJobId(active.id);
          const cfg = active.config as Partial<FormState> | undefined;
          if (cfg) setForm((prev) => ({ ...prev, ...cfg }));
        }
      } catch {
        // stay disconnected
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onStart = useCallback(async () => {
    if (!form.server) {
      toast.error("Select a server");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/perf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { job?: JobSnapshot; error?: string; message?: string };
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? "Start failed");
        return;
      }
      if (data.job) {
        setJobId(data.job.id);
        toast.success("Perf test started");
      }
    } catch (err) {
      toast.error(`Network error: ${(err as Error).message}`);
    } finally {
      setStarting(false);
    }
  }, [form]);

  const onStop = useCallback(async () => {
    if (!jobId) return;
    await fetch(`/api/jobs/${jobId}/stop`, { method: "POST" });
    toast.info("Stopping…");
  }, [jobId]);

  const effectiveStatus = jobId ? live.status : ("disconnected" as const);
  const isActive =
    live.status === "running" || live.status === "starting" || live.status === "stopping";

  const progressPct = useMemo(() => {
    if (!stats.durationMs || stats.durationMs === 0) return 0;
    return Math.min(100, ((stats.elapsedMs ?? 0) / stats.durationMs) * 100);
  }, [stats.elapsedMs, stats.durationMs]);

  const recentLogs = useMemo<LogEntry[]>(
    () => live.logs.filter((l) => l.level !== "debug").slice(-30),
    [live.logs],
  );

  return (
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
      {/* Form */}
      <Card className="h-fit">
        <CardHeader className="flex-row items-start justify-between gap-2 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
              <Gauge className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Performance Test</CardTitle>
              <p className="mt-0.5 text-[11px] text-[color:var(--color-muted-foreground)]">
                Sustained load test with CHAP auth
              </p>
            </div>
          </div>
          <StatusBadge status={effectiveStatus} />
        </CardHeader>
        <CardContent className="space-y-4">
          <Section title="Target">
            <SelectField
              id="server"
              label="Server"
              value={form.server}
              options={servers.map((s) => ({
                value: s.name,
                label: `${s.name} · ${s.host}:${s.authPort}`,
              }))}
              onChange={(v) => setForm({ ...form, server: v })}
            />
          </Section>
          <Section title="Load parameters">
            <Field
              id="users"
              label="Users"
              type="number"
              min={1}
              max={100_000}
              value={form.users}
              onChange={(e) => setForm({ ...form, users: Number(e.target.value) || 0 })}
              disabled={isActive}
              hint="Number of synthetic usernames (perfuser-0001 …)"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="duration"
                label="Duration"
                type="number"
                min={1}
                max={3600}
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: Number(e.target.value) || 0 })}
                disabled={isActive}
                suffix="sec"
              />
              <Field
                id="concurrency"
                label="Concurrency"
                type="number"
                min={1}
                max={5000}
                value={form.concurrency}
                onChange={(e) =>
                  setForm({ ...form, concurrency: Number(e.target.value) || 0 })
                }
                disabled={isActive}
                hint="Max in-flight"
              />
            </div>
            <Field
              id="timeoutMs"
              label="Timeout"
              type="number"
              min={100}
              max={60_000}
              value={form.timeoutMs}
              onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) || 0 })}
              disabled={isActive}
              suffix="ms"
            />
          </Section>
          <div className="rounded-md bg-[color:var(--color-muted)]/50 p-2.5 text-[11px] text-[color:var(--color-muted-foreground)]">
            <strong>Auth:</strong> CHAP · Password:{" "}
            <code className="font-mono">perfpass</code> (fixed in v1)
          </div>

          <div className="flex gap-2">
            {!isActive ? (
              <Button onClick={onStart} disabled={starting}>
                <Play className="h-3.5 w-3.5" />
                {starting ? "Starting…" : "Start perf test"}
              </Button>
            ) : (
              <Button variant="destructive" onClick={onStop}>
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            )}
          </div>

          {live.error ? (
            <div className="flex items-start gap-2 rounded-md bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {live.error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Dashboard */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="grid grid-cols-4 gap-3">
          <Kpi
            label="Progress"
            value={`${Math.round((stats.elapsedMs ?? 0) / 1000)} / ${Math.round((stats.durationMs ?? 0) / 1000)} s`}
          />
          <Kpi label="Total sent" value={stats.sent ?? 0} />
          <Kpi label="RPS" value={stats.rpsRolling ?? 0} suffix="/s" />
          <Kpi label="p95 latency" value={fmtMs(stats.latency?.p95)} />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="Accept" value={stats.accept ?? 0} tone="emerald" />
          <Kpi label="Reject" value={stats.reject ?? 0} tone="amber" />
          <Kpi
            label="Timeout"
            value={stats.timeout ?? 0}
            tone={(stats.timeout ?? 0) > 0 ? "red" : undefined}
          />
          <Kpi
            label="Errors"
            value={stats.errors ?? 0}
            tone={(stats.errors ?? 0) > 0 ? "red" : undefined}
          />
        </div>

        {/* Progress bar */}
        <Card className="p-3">
          <div className="mb-1.5 flex justify-between text-[11px] text-[color:var(--color-muted-foreground)]">
            <span>Elapsed</span>
            <span>{progressPct.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--color-muted)]">
            <div
              className="h-full bg-[color:var(--color-primary)] transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {stats.latency && stats.latency.count > 0 ? (
            <div className="mt-3 font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
              min {fmtMs(stats.latency.min)} · p50 {fmtMs(stats.latency.p50)} · p95{" "}
              {fmtMs(stats.latency.p95)} · p99 {fmtMs(stats.latency.p99)} · max{" "}
              {fmtMs(stats.latency.max)} · samples {stats.latency.count}
            </div>
          ) : null}
        </Card>

        {/* Log */}
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="py-3">
            <CardTitle>Live log</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto pt-0">
            <div className="space-y-0.5 font-mono text-[11px]">
              {recentLogs.length === 0 ? (
                <p className="text-[color:var(--color-muted-foreground)]">
                  Waiting to start…
                </p>
              ) : (
                recentLogs.map((log, i) => (
                  <div key={`${log.ts}-${i}`} className="flex gap-2">
                    <span className="text-[color:var(--color-muted-foreground)]">
                      {new Date(log.ts).toLocaleTimeString(undefined, {
                        hour12: false,
                        fractionalSecondDigits: 3,
                      })}
                    </span>
                    <span
                      className={cn(
                        log.level === "error" && "text-red-500",
                        log.level === "warn" && "text-amber-500",
                      )}
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  suffix,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "amber" | "red";
  suffix?: string;
}) {
  return (
    <Card className="p-3">
      <div className="text-[11px] text-[color:var(--color-muted-foreground)]">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "red" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-[10px] font-normal opacity-60">{suffix}</span>
        ) : null}
      </div>
    </Card>
  );
}
