"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Section } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/jobs/status-badge";
import { PacketCard } from "@/components/coa/packet-card";
import { useJobLogs } from "@/hooks/useJobLogs";
import type { CoAConfig } from "@/lib/storage/schemas";
import type { PacketLog } from "@/lib/radius/coaServer";
import type { JobSnapshot, LogEntry } from "@/lib/jobs/types";
import { cn, randomId } from "@/lib/utils";
import { nextFreeName } from "@/lib/storage/nextFreeName";

const ACTIVE_STATUSES = new Set(["starting", "running", "stopping"]);

function makeBlankConfig(): CoAConfig {
  return {
    id: randomId(),
    name: "",
    bind: "0.0.0.0",
    port: 3799,
    secret: "testing123",
    policy: "always-ack",
  };
}

function isPacketLog(data: unknown): data is PacketLog {
  return Boolean(
    data &&
      typeof data === "object" &&
      "direction" in data &&
      "code" in data &&
      "attributes" in data,
  );
}

export function CoAConsole() {
  const [configs, setConfigs] = useState<CoAConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CoAConfig>(() => makeBlankConfig());
  const [mode, setMode] = useState<"new" | "view" | "edit">("new");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [runningConfigId, setRunningConfigId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const live = useJobLogs(jobId);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/coa-configs");
      if (!res.ok) return;
      const data = (await res.json()) as { configs?: CoAConfig[] };
      setConfigs(data.configs ?? []);
    } catch (err) {
      toast.error(`Load failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-attach to an already-running CoA server job after navigation/refresh.
  const attachRunning = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = (await res.json()) as { jobs?: JobSnapshot[] };
      const active = (data.jobs ?? [])
        .filter((j) => j.kind === "coa-server" && ACTIVE_STATUSES.has(j.status))
        .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt))[0];
      if (active) {
        setJobId(active.id);
        const restored = active.config as CoAConfig | undefined;
        if (restored?.id) setRunningConfigId(restored.id);
      }
    } catch {
      /* network error — stay disconnected */
    }
  }, []);

  useEffect(() => {
    void loadConfigs();
    void attachRunning();
  }, [loadConfigs, attachRunning]);

  // Auto-detach when the attached job finishes.
  useEffect(() => {
    if (jobId && (live.status === "completed" || live.status === "failed")) {
      setJobId(null);
      setRunningConfigId(null);
    }
  }, [jobId, live.status]);

  const selectConfig = (name: string) => {
    const c = configs.find((x) => x.name === name);
    if (!c) return;
    setCurrent({ ...c });
    setMode("view");
    setSavedName(c.name);
    setErrors({});
  };

  const onNew = () => {
    if (jobId) return;
    setCurrent(makeBlankConfig());
    setMode("new");
    setSavedName(null);
    setErrors({});
  };

  const onEnterEdit = () => {
    if (mode === "view") setMode("edit");
  };

  const onCancelEdit = () => {
    if (mode !== "edit" || !savedName) return;
    const source = configs.find((x) => x.name === savedName);
    if (source) setCurrent({ ...source });
    setMode("view");
    setErrors({});
  };

  const onCancelNew = () => {
    if (mode !== "new") return;
    if (configs.length > 0) {
      selectConfig(configs[0].name);
    } else {
      setCurrent(makeBlankConfig());
      setErrors({});
    }
  };

  const onDuplicate = () => {
    if (mode !== "view" || !savedName) return;
    if (jobId) return;
    const source = configs.find((x) => x.name === savedName);
    if (!source) return;
    const taken = new Set(configs.map((x) => x.name));
    setCurrent({
      ...source,
      id: randomId(),
      name: nextFreeName(source.name, taken),
    });
    setMode("new");
    setSavedName(null);
    setErrors({});
  };

  const onDelete = async () => {
    if (mode !== "view" || !savedName) return;
    if (runningConfigId === current.id) {
      toast.error("Stop the server before deleting its profile");
      return;
    }
    if (!confirm(`Delete profile "${savedName}"?`)) return;
    const res = await fetch(`/api/coa-configs/${encodeURIComponent(savedName)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success(`Deleted "${savedName}"`);
    onNew();
    void loadConfigs();
  };

  const onSave = async () => {
    setErrors({});
    setSaving(true);
    try {
      const url =
        mode === "new"
          ? "/api/coa-configs"
          : `/api/coa-configs/${encodeURIComponent(savedName!)}`;
      const res = await fetch(url, {
        method: mode === "new" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(current),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        issues?: Array<{ path: (string | number)[]; message: string }>;
      };
      if (!res.ok) {
        if (data.issues) {
          const out: Record<string, string> = {};
          for (const i of data.issues) {
            const key = i.path.join(".");
            if (!out[key]) out[key] = i.message;
          }
          setErrors(out);
        }
        toast.error(data.message ?? data.error ?? "Save failed");
        return;
      }
      toast.success(mode === "new" ? `Created "${current.name}"` : `Saved "${current.name}"`);
      setMode("view");
      setSavedName(current.name);
      void loadConfigs();
    } finally {
      setSaving(false);
    }
  };

  const onStart = async () => {
    if (mode !== "view" || !savedName) return;
    if (jobId) {
      toast.error("Another server is already running — stop it first");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/coa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(current),
      });
      const body = (await res.json()) as {
        job?: { id: string };
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(body.message ?? body.error ?? "Start failed");
        return;
      }
      if (body.job?.id) {
        setJobId(body.job.id);
        setRunningConfigId(current.id);
        toast.success(`Server "${current.name}" started on :${current.port}`);
      }
    } catch (err) {
      toast.error(`Network error: ${(err as Error).message}`);
    } finally {
      setStarting(false);
    }
  };

  const onStop = async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/stop`, { method: "POST" });
      if (!res.ok) {
        toast.error("Stop failed");
        return;
      }
      toast.info("Stopping server…");
    } catch (err) {
      toast.error(`Network error: ${(err as Error).message}`);
    }
  };

  const packets = useMemo(
    () =>
      live.logs
        .filter((log): log is LogEntry & { data: PacketLog } => isPacketLog(log.data))
        .slice(-200),
    [live.logs],
  );

  const stats = live.stats as {
    received?: number;
    sent?: number;
    errors?: number;
    byCode?: Record<string, number>;
    listeningOn?: string;
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [packets.length]);

  const readOnly = mode === "view";
  const isThisRunning = Boolean(runningConfigId && runningConfigId === current.id);
  const isAnyRunning = jobId !== null;
  const effectiveStatus = isThisRunning ? live.status : ("disconnected" as const);

  const dirty = useMemo(() => {
    if (mode === "view") return false;
    if (mode === "new") return true;
    const saved = configs.find((x) => x.name === savedName);
    if (!saved) return true;
    return JSON.stringify(saved) !== JSON.stringify(current);
  }, [configs, mode, savedName, current]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CoA Server</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            Listen on UDP and auto-ACK/NAK CoA-Request (43) + Disconnect-Request (40).
            Profiles stored in{" "}
            <code className="rounded bg-[color:var(--color-muted)] px-1 py-0.5 font-mono text-[11px]">
              data/profiles/coa_server.yaml
            </code>
            .
          </p>
        </div>
        <Badge tone="primary">{configs.length} profiles</Badge>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left: profiles list */}
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">Server profiles</CardTitle>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => void loadConfigs()} title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {isAnyRunning ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void onStop()}
                  title="Stop the running server"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </Button>
              ) : (
                <Button size="sm" onClick={onNew} title="New profile">
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-1 overflow-auto pt-0">
            {loading ? (
              <div className="p-3 text-center text-xs text-[color:var(--color-muted-foreground)]">
                Loading…
              </div>
            ) : configs.length === 0 ? (
              <div className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-[11px] text-[color:var(--color-muted-foreground)]">
                No profiles yet. Click <span className="font-medium">New</span> to create one.
              </div>
            ) : (
              configs.map((c) => {
                const active = savedName === c.name && mode !== "new";
                const running = runningConfigId === c.id;
                return (
                  <button
                    key={c.name}
                    onClick={() => selectConfig(c.name)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                      active
                        ? "border-[color:var(--color-primary)]/50 bg-[color:var(--color-muted)]"
                        : "border-[color:var(--color-border)] hover:border-[color:var(--color-primary)]/30",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-medium">{c.name}</div>
                      <div className="mt-0.5 text-[10px] text-[color:var(--color-muted-foreground)]">
                        {c.bind}:{c.port} - {c.policy}
                      </div>
                    </div>
                    {running ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        running
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Right: detail + KPIs + live packets */}
        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
          {!isAnyRunning && (
          <Card
            className={cn(
              "transition-colors",
              mode === "new" && "border-emerald-500/40 bg-emerald-500/5",
            )}
          >
            <CardHeader className="flex-row items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="text-sm">
                    {mode === "new"
                      ? "New server profile"
                      : mode === "view"
                        ? savedName
                        : `Edit — ${savedName}`}
                  </CardTitle>
                  <p className="mt-0.5 font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
                    data/profiles/coa_server.yaml · {current.name || "<name>"}
                  </p>
                </div>
                {mode === "view" && isThisRunning ? (
                  <StatusBadge status={effectiveStatus} />
                ) : null}
              </div>
              <div className="flex gap-1">
                {mode === "view" && (
                  <Button size="icon" variant="ghost" onClick={onEnterEdit} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {mode === "view" && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={onDuplicate}
                      title={isAnyRunning ? "Stop the running server first" : "Duplicate"}
                      disabled={isAnyRunning}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void onDelete()}
                      title={isThisRunning ? "Stop the server first" : "Delete"}
                      disabled={isThisRunning}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500/70" />
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <Section title="Identity">
                <Field
                  id="coa-name"
                  label="Profile name"
                  required
                  value={current.name}
                  disabled={mode !== "new"}
                  placeholder="e.g. home-lab"
                  hint={
                    mode !== "new"
                      ? "Name is immutable (delete and create new to rename)."
                      : "Alphanumeric, dot, dash, underscore only"
                  }
                  onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                  error={errors["name"]}
                />
              </Section>

              <Section title="Listener" subtitle="UDP bind + shared secret">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="coa-bind"
                    label="Bind"
                    value={current.bind}
                    disabled={readOnly}
                    onChange={(e) => setCurrent({ ...current, bind: e.target.value })}
                    error={errors["bind"]}
                    hint="0.0.0.0 listens on all interfaces"
                  />
                  <Field
                    id="coa-port"
                    label="Port"
                    type="number"
                    min={1}
                    max={65535}
                    value={current.port}
                    disabled={readOnly}
                    onChange={(e) =>
                      setCurrent({ ...current, port: Number(e.target.value) || 0 })
                    }
                    error={errors["port"]}
                    hint="RFC 5176 default: 3799"
                  />
                </div>
                <Field
                  id="coa-secret"
                  label="Shared secret"
                  required
                  value={current.secret}
                  disabled={readOnly}
                  onChange={(e) => setCurrent({ ...current, secret: e.target.value })}
                  error={errors["secret"]}
                />
              </Section>

              <Section title="Reply policy" subtitle="How the simulator responds">
                <div className="space-y-1.5">
                  <Label htmlFor="coa-policy">Policy</Label>
                  <select
                    id="coa-policy"
                    className="flex h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    value={current.policy}
                    disabled={readOnly}
                    onChange={(e) =>
                      setCurrent({ ...current, policy: e.target.value as CoAConfig["policy"] })
                    }
                  >
                    <option value="always-ack">always-ack</option>
                    <option value="always-nak">always-nak</option>
                    <option value="random">random (70% ACK)</option>
                  </select>
                </div>
              </Section>

              <div className="flex items-center justify-between border-t border-[color:var(--color-border)] pt-4">
                <p className="text-[11px] text-[color:var(--color-muted-foreground)]">
                  {mode === "view"
                    ? isThisRunning
                      ? "Running"
                      : "Saved"
                    : mode === "new"
                      ? "New profile — unsaved"
                      : dirty
                        ? "Unsaved changes"
                        : "Saved"}
                </p>
                <div className="flex gap-2">
                  {mode === "edit" && (
                    <Button variant="outline" onClick={onCancelEdit}>
                      Cancel
                    </Button>
                  )}
                  {mode === "new" && (
                    <Button variant="outline" onClick={onCancelNew}>
                      Cancel
                    </Button>
                  )}
                  {mode !== "view" && (
                    <Button
                      onClick={() => void onSave()}
                      disabled={saving || !current.name}
                      className={cn(
                        mode === "new" && "bg-emerald-600 text-white hover:bg-emerald-600/90",
                      )}
                    >
                      {saving ? "Saving…" : mode === "new" ? "Create profile" : "Save changes"}
                    </Button>
                  )}
                  {mode === "view" && !isThisRunning && (
                    <Button
                      onClick={() => void onStart()}
                      disabled={starting || isAnyRunning}
                      title={isAnyRunning ? "Another server is running" : "Start server"}
                    >
                      <Play className="h-3.5 w-3.5" />
                      {starting ? "Starting…" : "Start server"}
                    </Button>
                  )}
                  {mode === "view" && isThisRunning && (
                    <Button variant="destructive" onClick={() => void onStop()}>
                      <Square className="h-3.5 w-3.5" />
                      Stop
                    </Button>
                  )}
                </div>
              </div>

              {mode === "edit" && isThisRunning && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Profile is currently running. Stop + restart the server to apply changes.
                </div>
              )}
              {live.error ? (
                <div className="flex items-start gap-2 rounded-md bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {live.error}
                </div>
              ) : null}
            </CardContent>
          </Card>
          )}

          {jobId && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <Kpi label="Received" value={stats.received ?? 0} />
                <Kpi label="Sent" value={stats.sent ?? 0} />
                <Kpi label="Errors" value={stats.errors ?? 0} />
                <Kpi label="Listening" value={stats.listeningOn ?? "—"} />
              </div>
              <Card className="flex min-h-0 flex-col">
                <CardHeader className="py-3">
                  <CardTitle>Live packets</CardTitle>
                  <CardDescription>
                    {packets.length === 0
                      ? "Waiting for packets — send a CoA-Request to start seeing traffic here."
                      : `Last ${packets.length} packets`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto pt-0">
                  <div className="space-y-2">
                    {packets.map((p, i) => (
                      <PacketCard key={`${p.ts}-${i}`} packet={p.data} />
                    ))}
                    <div ref={endRef} />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] text-[color:var(--color-muted-foreground)]">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </Card>
  );
}
