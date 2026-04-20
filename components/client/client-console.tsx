"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Pencil, Play, Plus, Square, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/field";
import { LogLine } from "@/components/jobs/log-line";
import { StatusBadge } from "@/components/jobs/status-badge";
import {
  ClientProfileForm,
  makeDefaultClientProfile,
  validateClientProfile,
} from "@/components/profiles/client-profile-form";
import type { ClientProfile, ServerConfig } from "@/lib/storage/schemas";
import type { JobSnapshot, JobStatus, LogEntry } from "@/lib/jobs/types";
import { cn, randomId } from "@/lib/utils";

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

type FormMode = "new" | "edit";
interface FormState {
  mode: FormMode;
  value: ClientProfile;
  errors: Record<string, string>;
  savedName: string | null;
}

const ALL_FILTER = "__ALL__";
const DELETE_CONFIRM_WORD = "DELETE";

function nextCopyName(base: string, taken: Set<string>): string {
  const first = `${base}_copy`;
  if (!taken.has(first)) return first;
  let i = 2;
  while (taken.has(`${base}_copy_${i}`)) i++;
  return `${base}_copy_${i}`;
}

export function ClientConsole() {
  const [profiles, setProfiles] = useState<ClientProfile[]>([]);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [server, setServer] = useState<string>("");
  const [sessions, setSessions] = useState<TrackedSession[]>([]);
  const [logs, setLogs] = useState<TaggedLog[]>([]);
  const [filter, setFilter] = useState<string>(ALL_FILTER);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
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

  const loadProfilesAndServers = useCallback(async () => {
    const [p, s] = await Promise.all([
      fetch("/api/profiles").then((r) => r.json() as Promise<{ profiles?: ClientProfile[] }>),
      fetch("/api/servers").then((r) => r.json() as Promise<{ servers?: ServerConfig[] }>),
    ]);
    setProfiles(p.profiles ?? []);
    setServers(s.servers ?? []);
    const favorite = (s.servers ?? []).find((srv) => srv.isFavorite);
    setServer((prev) => prev || favorite?.name || s.servers?.[0]?.name || "");
  }, []);

  // Initial load + re-attach to any running client-session jobs
  useEffect(() => {
    Promise.all([
      loadProfilesAndServers(),
      fetch("/api/jobs").then((r) => r.json() as Promise<{ jobs?: JobSnapshot[] }>),
    ]).then(([, j]) => {
      const running = (j.jobs ?? [])
        .filter((job) => job.kind === "client-session" && ACTIVE_STATUSES.has(job.status))
        .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt))
        .slice(0, 10);
      for (const job of running) attachJob(job);
    });
    const sources = sourcesRef.current;
    return () => {
      for (const es of sources.values()) es.close();
      sources.clear();
    };
  }, [attachJob, loadProfilesAndServers]);

  const toggleProfile = (name: string) => {
    setSelectedProfiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    // clicking a row cancels an in-flight delete confirmation so the
    // "DELETE" string can't be submitted against a different selection
    setDeleteOpen(false);
    setDeleteInput("");
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
      // starting closes any open form so the log panel takes over the right pane
      setForm(null);
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

  const openNewForm = () => {
    setForm({ mode: "new", value: makeDefaultClientProfile(), errors: {}, savedName: null });
  };

  const openEditForm = useCallback(async (name: string) => {
    try {
      const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { profile?: ClientProfile };
      if (!data.profile) throw new Error("profile missing in response");
      setForm({ mode: "edit", value: data.profile, errors: {}, savedName: name });
    } catch (err) {
      toast.error(`Load failed: ${(err as Error).message}`);
    }
  }, []);

  const onFormChange = (next: ClientProfile) => {
    setForm((prev) => (prev ? { ...prev, value: next } : prev));
  };

  const onFormCancel = () => {
    setForm(null);
  };

  const onFormSubmit = async () => {
    if (!form) return;
    const errors = validateClientProfile(form.value);
    if (Object.keys(errors).length > 0) {
      setForm({ ...form, errors });
      toast.error("Fix highlighted fields and try again");
      return;
    }
    setSaving(true);
    try {
      const isNew = form.mode === "new";
      const url = isNew
        ? "/api/profiles"
        : `/api/profiles/${encodeURIComponent(form.savedName ?? form.value.name)}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form.value),
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
          setForm({ ...form, errors: out });
        }
        toast.error(data.message ?? data.error ?? "Save failed");
        return;
      }
      toast.success(isNew ? "Client profile created" : "Client profile saved");
      setForm(null);
      await loadProfilesAndServers();
    } finally {
      setSaving(false);
    }
  };

  const onDuplicateSelected = () => {
    if (selectedProfiles.size !== 1) return;
    const [name] = Array.from(selectedProfiles);
    const source = profiles.find((p) => p.name === name);
    if (!source) {
      toast.error(`Profile "${name}" not found`);
      return;
    }
    const taken = new Set(profiles.map((p) => p.name));
    const seed: ClientProfile = {
      ...structuredClone(source),
      id: randomId(),
      name: nextCopyName(source.name, taken),
    };
    setForm({ mode: "new", value: seed, errors: {}, savedName: null });
  };

  const onDeleteSelected = async () => {
    if (deleteInput !== DELETE_CONFIRM_WORD) return;
    setDeleting(true);
    try {
      const names = Array.from(selectedProfiles);
      const results = await Promise.allSettled(
        names.map((name) =>
          fetch(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" }).then((r) => {
            if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
            return name;
          }),
        ),
      );
      const failed = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason as Error).message);
      const succeeded = results.filter((r) => r.status === "fulfilled").length;

      if (succeeded > 0) toast.success(`Deleted ${succeeded} client profile(s)`);
      if (failed.length > 0) toast.error(`Failed: ${failed.join(", ")}`);

      setSelectedProfiles(new Set());
      setDeleteOpen(false);
      setDeleteInput("");
      // close the form if it was editing a profile we just nuked
      if (form?.savedName && names.includes(form.savedName)) setForm(null);
      await loadProfilesAndServers();
    } finally {
      setDeleting(false);
    }
  };

  const filteredLogs = useMemo(
    () => (filter === ALL_FILTER ? logs : logs.filter((l) => l._profile === filter)),
    [logs, filter],
  );

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
  const selectionSize = selectedProfiles.size;

  return (
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
      {/* LEFT: profile list + server + actions */}
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
          <StatusBadge status={activeCount > 0 ? "running" : "disconnected"} />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
                Profiles
              </label>
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-[color:var(--color-muted-foreground)]">
                  {selectionSize}/{profiles.length} selected
                </div>
                <Button size="sm" onClick={openNewForm} title="Create new client profile">
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-1">
              {profiles.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-[color:var(--color-muted-foreground)]">
                  No client profiles. Click <strong>New</strong> to create one.
                </div>
              ) : (
                profiles.map((p) => {
                  const checked = selectedProfiles.has(p.name);
                  const editing = form?.mode === "edit" && form.savedName === p.name;
                  return (
                    <div
                      key={p.name}
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                        checked
                          ? "bg-[color:var(--color-primary)]/10"
                          : "hover:bg-[color:var(--color-muted)]/50",
                        editing && "ring-1 ring-[color:var(--color-primary)]/40",
                      )}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
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
                      <button
                        type="button"
                        onClick={() => void openEditForm(p.name)}
                        title="Edit client profile"
                        className="rounded p-1 text-[color:var(--color-muted-foreground)] opacity-0 transition-colors hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-foreground)] group-hover:opacity-100"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
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

          <div className="mt-auto flex flex-col gap-2">
            {selectionSize === 1 && !deleteOpen ? (
              <Button
                variant="outline"
                onClick={onDuplicateSelected}
                className="justify-start"
                title="Create a new client profile pre-filled from the selected one"
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate client
              </Button>
            ) : null}
            {selectionSize > 0 ? (
              <DeleteClientsPanel
                selectionSize={selectionSize}
                open={deleteOpen}
                onOpen={() => {
                  setDeleteOpen(true);
                  setDeleteInput("");
                }}
                onCancel={() => {
                  setDeleteOpen(false);
                  setDeleteInput("");
                }}
                input={deleteInput}
                onInputChange={setDeleteInput}
                onConfirm={() => void onDeleteSelected()}
                busy={deleting}
              />
            ) : null}

            <div className="flex gap-2">
              <Button
                onClick={onStart}
                disabled={starting || selectionSize === 0}
                className="flex-1"
              >
                <Play className="h-3.5 w-3.5" />
                {starting
                  ? "Starting…"
                  : `Start ${selectionSize || ""} session${selectionSize === 1 ? "" : "s"}`}
              </Button>
              {activeCount > 0 ? (
                <Button variant="destructive" onClick={onStopAll} title="Stop all active">
                  <Square className="h-3.5 w-3.5" />
                  Stop all
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* RIGHT: form OR session log */}
      {form ? (
        <Card
          className={cn(
            "flex min-h-0 flex-col",
            form.mode === "new" && "border-emerald-500/40 bg-emerald-500/5",
          )}
        >
          <CardHeader className="flex-row items-center justify-between py-3">
            <div>
              <CardTitle>{form.mode === "new" ? "New client profile" : `Edit: ${form.savedName}`}</CardTitle>
              <CardDescription>
                <code className="font-mono">data/profiles/clients.yaml</code>
                {" · "}
                {form.mode === "new" ? form.value.name || "<name>" : form.savedName}
              </CardDescription>
            </div>
            <Button size="icon" variant="ghost" onClick={onFormCancel} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-0">
            <div className="min-h-0 flex-1 overflow-auto pr-1">
              <ClientProfileForm
                value={form.value}
                onChange={onFormChange}
                errors={form.errors}
                mode={form.mode}
              />
            </div>
            <div className="flex items-center justify-between border-t border-[color:var(--color-border)] pt-3">
              <p className="text-[11px] text-[color:var(--color-muted-foreground)]">
                {Object.keys(form.errors).length > 0
                  ? `${Object.keys(form.errors).length} field(s) need attention`
                  : "Fields validated against schema on save"}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onFormCancel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void onFormSubmit()}
                  disabled={saving}
                  className={cn(
                    form.mode === "new" &&
                      "bg-emerald-600 text-white hover:bg-emerald-600/90",
                  )}
                >
                  {saving ? "Saving…" : form.mode === "new" ? "Create" : "Save changes"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
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
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3 font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <p className="text-[color:var(--color-muted-foreground)]">
                  Select profiles on the left and click Start.
                </p>
              ) : (
                filteredLogs.map((log, i) => (
                  <LogLine key={`${log.ts}-${i}`} log={log} profile={log._profile} />
                ))
              )}
            </div>

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
      )}
    </div>
  );
}

interface DeleteClientsPanelProps {
  selectionSize: number;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  input: string;
  onInputChange: (next: string) => void;
  onConfirm: () => void;
  busy: boolean;
}

function DeleteClientsPanel({
  selectionSize,
  open,
  onOpen,
  onCancel,
  input,
  onInputChange,
  onConfirm,
  busy,
}: DeleteClientsPanelProps) {
  const label = selectionSize === 1 ? "Delete client" : `Delete ${selectionSize} clients`;

  if (!open) {
    return (
      <Button variant="outline" onClick={onOpen} className="justify-start text-red-500">
        <Trash2 className="h-3.5 w-3.5" />
        {label}
      </Button>
    );
  }

  const enabled = input === DELETE_CONFIRM_WORD && !busy;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs">
      <div className="flex items-start gap-2">
        <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
        <div>
          <div className="font-medium text-[color:var(--color-foreground)]">Confirm delete</div>
          <div className="text-[color:var(--color-muted-foreground)]">
            Type <code className="rounded bg-[color:var(--color-muted)] px-1 font-mono">DELETE</code> to
            remove{" "}
            {selectionSize === 1 ? "the selected client profile" : `${selectionSize} client profiles`}.
          </div>
        </div>
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="DELETE"
        autoFocus
        className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-red-500/40"
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy} className="flex-1">
          Cancel
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={onConfirm}
          disabled={!enabled}
          className="flex-1"
        >
          {busy ? "Deleting…" : "Confirm delete"}
        </Button>
      </div>
    </div>
  );
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
