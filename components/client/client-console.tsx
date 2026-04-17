"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/field";
import { StatusBadge } from "@/components/jobs/status-badge";
import type { ClientProfile, ServerConfig } from "@/lib/storage/schemas";
import type { JobSnapshot, JobStatus, LogEntry, PacketLog } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set<JobStatus>(["starting", "running", "stopping"]);

interface TrackedSession {
  jobId: string;
  profile: string;
  status: JobStatus | "disconnected";
}

interface TaggedLog extends LogEntry {
  _profile: string;
  _jobId: string;
}

const ALL_FILTER = "__ALL__";

export function ClientConsole() {
  const [profiles, setProfiles] = useState<ClientProfile[]>([]);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [server, setServer] = useState<string>("");
  const [sessions, setSessions] = useState<TrackedSession[]>([]);
  const [logs, setLogs] = useState<TaggedLog[]>([]);
  const [filter, setFilter] = useState<string>(ALL_FILTER);
  const [starting, setStarting] = useState(false);
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());

  const attachJob = useCallback((job: { id: string; name: string; status: JobStatus; config: unknown }) => {
    const profile = (job.config as { profile?: string })?.profile ?? job.name;
    setSessions((prev) => {
      if (prev.some((s) => s.jobId === job.id)) return prev;
      return [...prev, { jobId: job.id, profile, status: job.status }];
    });

    if (sourcesRef.current.has(job.id)) return;
    const es = new EventSource(`/api/jobs/${job.id}/logs`);
    sourcesRef.current.set(job.id, es);

    es.addEventListener("log", (evt) => {
      const entry = JSON.parse((evt as MessageEvent).data) as LogEntry;
      setLogs((prev) => [...prev, { ...entry, _profile: profile, _jobId: job.id }].slice(-2000));
    });
    es.addEventListener("status", (evt) => {
      const { status } = JSON.parse((evt as MessageEvent).data) as { status: JobStatus };
      setSessions((prev) =>
        prev.map((s) => (s.jobId === job.id ? { ...s, status } : s)),
      );
    });
    es.onerror = () => {
      setSessions((prev) =>
        prev.map((s) => (s.jobId === job.id ? { ...s, status: "disconnected" } : s)),
      );
    };
  }, []);

  // Initial load: profiles, servers, and re-attach to any running client-session jobs
  useEffect(() => {
    Promise.all([
      fetch("/api/profiles").then((r) => r.json() as Promise<{ profiles?: ClientProfile[] }>),
      fetch("/api/servers").then((r) => r.json() as Promise<{ servers?: ServerConfig[] }>),
      fetch("/api/jobs").then((r) => r.json() as Promise<{ jobs?: JobSnapshot[] }>),
    ]).then(([p, s, j]) => {
      const profs = p.profiles ?? [];
      const servs = s.servers ?? [];
      setProfiles(profs);
      setServers(servs);
      setServer((prev) => prev || servs[0]?.name || "");

      const running = (j.jobs ?? [])
        .filter((job) => job.kind === "client-session" && ACTIVE_STATUSES.has(job.status))
        .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt))
        .slice(0, 10);
      for (const job of running) attachJob(job);
    });
    // Cleanup on unmount
    const sources = sourcesRef.current;
    return () => {
      for (const es of sources.values()) es.close();
      sources.clear();
    };
  }, [attachJob]);

  const toggleProfile = (name: string) => {
    setSelectedProfiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const onStart = useCallback(async () => {
    if (selectedProfiles.size === 0) {
      toast.error("Select at least one profile");
      return;
    }
    if (!server) {
      toast.error("Select a server");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/client", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profiles: Array.from(selectedProfiles), server }),
      });
      const data = (await res.json()) as {
        jobs?: JobSnapshot[];
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? "Start failed");
        return;
      }
      for (const job of data.jobs ?? []) attachJob(job);
      toast.success(`Started ${data.jobs?.length ?? 0} session(s)`);
    } catch (err) {
      toast.error(`Network error: ${(err as Error).message}`);
    } finally {
      setStarting(false);
    }
  }, [selectedProfiles, server, attachJob]);

  const onStop = useCallback(async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}/stop`, { method: "POST" });
    toast.info("Stop signal sent");
  }, []);

  const onStopAll = useCallback(async () => {
    const active = sessions.filter((s) => s.status === "running" || s.status === "starting");
    await Promise.allSettled(
      active.map((s) => fetch(`/api/jobs/${s.jobId}/stop`, { method: "POST" })),
    );
    toast.info(`Stopped ${active.length} session(s)`);
  }, [sessions]);

  const onClearLogs = () => setLogs([]);

  const filteredLogs = useMemo(
    () => (filter === ALL_FILTER ? logs : logs.filter((l) => l._profile === filter)),
    [logs, filter],
  );

  // Unique profiles in current sessions (for filter panel), preserve spawn order
  const profileFilters = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of sessions) {
      if (!seen.has(s.profile)) {
        seen.add(s.profile);
        result.push(s.profile);
      }
    }
    return result;
  }, [sessions]);

  const activeCount = sessions.filter((s) => ACTIVE_STATUSES.has(s.status as JobStatus)).length;

  return (
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
      {/* LEFT: Form */}
      <Card className="flex h-full min-h-0 flex-col">
        <CardHeader className="flex-row items-start justify-between gap-2 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Client Emulator</CardTitle>
              <CardDescription>
                One profile = one client. Select multiple to run in parallel.
              </CardDescription>
            </div>
          </div>
          <StatusBadge
            status={activeCount > 0 ? "running" : "disconnected"}
          />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                Profiles
              </label>
              <div className="text-[10px] text-[color:var(--color-muted-foreground)]">
                {selectedProfiles.size}/{profiles.length} selected
              </div>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-1">
              {profiles.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-[color:var(--color-muted-foreground)]">
                  No profiles — create one in the <strong>Profiles</strong> section.
                </div>
              ) : (
                profiles.map((p) => {
                  const checked = selectedProfiles.has(p.name);
                  return (
                    <label
                      key={p.name}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                        checked
                          ? "bg-[color:var(--color-primary)]/10"
                          : "hover:bg-[color:var(--color-muted)]/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProfile(p.name)}
                        className="accent-[color:var(--color-primary)]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs font-medium">{p.name}</div>
                        <div className="truncate text-[10px] text-[color:var(--color-muted-foreground)]">
                          {p.user.username} · NAS {p.nas.ip} · {p.session.durationSeconds}s
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <SelectField
            id="server"
            label="Server"
            value={server}
            options={servers.map((s) => ({
              value: s.name,
              label: `${s.name} · ${s.host}:${s.authPort}`,
            }))}
            onChange={setServer}
          />

          <div className="mt-auto flex gap-2">
            <Button
              onClick={onStart}
              disabled={starting || selectedProfiles.size === 0}
              className="flex-1"
            >
              <Play className="h-3.5 w-3.5" />
              {starting
                ? "Starting…"
                : `Start ${selectedProfiles.size || ""} session${selectedProfiles.size === 1 ? "" : "s"}`}
            </Button>
            {activeCount > 0 ? (
              <Button variant="destructive" onClick={onStopAll} title="Stop all active">
                <Square className="h-3.5 w-3.5" />
                Stop all
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* RIGHT: Log + filter */}
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="flex-row items-center justify-between py-3">
          <div>
            <CardTitle>Session log</CardTitle>
            <CardDescription>
              {filteredLogs.length} lines · {activeCount} active session(s)
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={onClearLogs} disabled={logs.length === 0}>
            Clear
          </Button>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 gap-3 pt-0">
          {/* Log stream */}
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3 font-mono text-[11px]">
            {filteredLogs.length === 0 ? (
              <p className="text-[color:var(--color-muted-foreground)]">
                Select profiles on the left and click Start.
              </p>
            ) : (
              filteredLogs.map((log, i) => {
                const packet = (log.data as { packet?: PacketLog } | undefined)?.packet;
                const isHeader = log.message.startsWith("===");
                return (
                  <div key={`${log.ts}-${i}`} className="py-0.5">
                    <div className="flex gap-2">
                      <span className="shrink-0 text-[color:var(--color-muted-foreground)]">
                        {new Date(log.ts).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                          fractionalSecondDigits: 3,
                        })}
                      </span>
                      <span className="shrink-0 font-semibold text-[color:var(--color-primary)]">
                        [{log._profile}]
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 break-all",
                          log.level === "error" && "text-red-500",
                          log.level === "warn" && "text-amber-500",
                          log.level === "debug" && "text-[color:var(--color-muted-foreground)]",
                          isHeader && "font-semibold text-cyan-600 dark:text-cyan-400",
                        )}
                      >
                        {log.message}
                      </span>
                    </div>
                    {packet && packet.attributes.length > 0 ? (
                      <div className="ml-[13ch] mt-0.5 border-l-2 border-[color:var(--color-border)] pl-3 text-[color:var(--color-muted-foreground)]">
                        {packet.attributes.map(([k, v], j) => (
                          <div key={j}>
                            <span className="text-[color:var(--color-foreground)]/70">{k}</span>
                            : {formatAttr(v)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {/* Filter panel */}
          <div className="w-44 shrink-0">
            <div className="sticky top-0 space-y-1">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
                Filter
              </div>
              <FilterButton
                label="ALL"
                count={sessions.length}
                active={filter === ALL_FILTER}
                onClick={() => setFilter(ALL_FILTER)}
              />
              <div className="mx-2 my-1 border-t border-[color:var(--color-border)]/50" />
              {profileFilters.map((name) => {
                const sess = sessions.find((s) => s.profile === name);
                const isActive = filter === name;
                const isRunning = sess && ACTIVE_STATUSES.has(sess.status as JobStatus);
                return (
                  <FilterButton
                    key={name}
                    label={name}
                    active={isActive}
                    running={isRunning}
                    onClick={() => setFilter(name)}
                    onStop={
                      isRunning && sess
                        ? (e) => {
                            e.stopPropagation();
                            void onStop(sess.jobId);
                          }
                        : undefined
                    }
                  />
                );
              })}
              {profileFilters.length === 0 ? (
                <p className="px-2 py-2 text-[10px] text-[color:var(--color-muted-foreground)]">
                  No active sessions.
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Render a RADIUS attribute value for the log panel. Node `Buffer`s are
 * serialized by JSON.stringify as `{ type: "Buffer", data: number[] }` when
 * they cross the SSE boundary — render those as `0x<hex>` instead of the
 * unreadable JSON shape. Strings/numbers pass through.
 */
function formatAttr(v: unknown): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (
    v &&
    typeof v === "object" &&
    (v as { type?: string }).type === "Buffer" &&
    Array.isArray((v as { data?: unknown }).data)
  ) {
    const bytes = (v as { data: number[] }).data;
    return "0x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function FilterButton({
  label,
  count,
  active,
  running,
  onClick,
  onStop,
}: {
  label: string;
  count?: number;
  active: boolean;
  running?: boolean;
  onClick: () => void;
  onStop?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        active
          ? "bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)]"
          : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]",
      )}
    >
      {running !== undefined ? (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            running ? "bg-emerald-500 animate-pulse" : "bg-zinc-500",
          )}
        />
      ) : null}
      <span className="flex-1 truncate font-mono">{label}</span>
      {count !== undefined ? (
        <span className="text-[10px] opacity-70">{count}</span>
      ) : null}
      {onStop ? (
        <span
          role="button"
          tabIndex={0}
          onClick={onStop}
          className="rounded p-0.5 opacity-0 hover:bg-red-500/20 hover:text-red-500 group-hover:opacity-100"
          title="Stop this session"
        >
          <Square className="h-2.5 w-2.5" />
        </span>
      ) : null}
    </button>
  );
}
