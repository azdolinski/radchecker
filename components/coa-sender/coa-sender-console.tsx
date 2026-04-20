"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Section } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/jobs/status-badge";
import { AttributesEditor } from "@/components/coa-sender/attributes-editor";
import { cn, randomId } from "@/lib/utils";
import type {
  CoAPacketProfile,
  CoAPacketType,
  ServerConfig,
} from "@/lib/storage/schemas";
import type { JobSnapshot } from "@/lib/jobs/types";
import { nextFreeName } from "@/lib/storage/nextFreeName";

type TargetMode = "ref" | "inline";

function makeBlankProfile(): CoAPacketProfile {
  return {
    id: randomId(),
    name: "",
    type: "Disconnect-Request",
    target: {
      server: { host: "127.0.0.1", port: 3799, secret: "testing123", timeoutMs: 5000, retries: 1 },
    },
    attributes: [],
  };
}

function getTargetMode(p: CoAPacketProfile): TargetMode {
  return "profile" in p.target.server ? "ref" : "inline";
}

export function CoASenderConsole() {
  const [packets, setPackets] = useState<CoAPacketProfile[]>([]);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CoAPacketProfile>(() => makeBlankProfile());
  const [mode, setMode] = useState<"new" | "view" | "edit">("new");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<JobSnapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        fetch("/api/coa-packets").then((r) => r.json() as Promise<{ packets?: CoAPacketProfile[] }>),
        fetch("/api/servers").then((r) => r.json() as Promise<{ servers?: ServerConfig[] }>),
      ]);
      setPackets(p.packets ?? []);
      setServers(s.servers ?? []);
    } catch (err) {
      toast.error(`Load failed: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectPacket = (name: string) => {
    const p = packets.find((x) => x.name === name);
    if (!p) return;
    setCurrent(structuredClone(p));
    setMode("view");
    setSavedName(p.name);
    setErrors({});
    setLastResult(null);
  };

  const onEnterEdit = () => {
    if (mode === "view") setMode("edit");
  };

  const onCancelEdit = () => {
    if (mode !== "edit" || !savedName) return;
    const source = packets.find((x) => x.name === savedName);
    if (source) setCurrent(structuredClone(source));
    setMode("view");
    setErrors({});
  };

  const onCancelNew = () => {
    if (mode !== "new") return;
    if (packets.length > 0) {
      selectPacket(packets[0].name);
    } else {
      setCurrent(makeBlankProfile());
      setErrors({});
      setLastResult(null);
    }
  };

  const onNew = () => {
    setCurrent(makeBlankProfile());
    setMode("new");
    setSavedName(null);
    setErrors({});
    setLastResult(null);
  };

  const onDuplicate = () => {
    if (mode !== "edit" || !savedName) return;
    const source = packets.find((x) => x.name === savedName);
    if (!source) return;
    const taken = new Set(packets.map((x) => x.name));
    setCurrent({
      ...structuredClone(source),
      id: randomId(),
      name: nextFreeName(source.name, taken),
    });
    setMode("new");
    setSavedName(null);
    setErrors({});
  };

  const onDelete = async () => {
    if (mode !== "edit" || !savedName) return;
    if (!confirm(`Delete packet profile "${savedName}"?`)) return;
    const res = await fetch(`/api/coa-packets/${encodeURIComponent(savedName)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success(`Deleted "${savedName}"`);
    onNew();
    void load();
  };

  const onSave = async () => {
    setErrors({});
    setSaving(true);
    try {
      const url =
        mode === "new"
          ? "/api/coa-packets"
          : `/api/coa-packets/${encodeURIComponent(savedName!)}`;
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
      void load();
    } finally {
      setSaving(false);
    }
  };

  const onSend = async () => {
    setSending(true);
    setLastResult(null);
    try {
      const body =
        mode === "edit" && savedName
          ? { packetId: current.id }
          : { inline: current };
      const res = await fetch("/api/coa-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        job?: JobSnapshot;
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
        toast.error(data.message ?? data.error ?? "Send failed");
        return;
      }
      if (data.job) {
        setLastResult(data.job);
        toast.success(`Sent — job ${data.job.id.slice(0, 8)}…`);
        // poll once after timeout to get final status (job runs async)
        const poll = async () => {
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 500));
            const r = await fetch(`/api/jobs/${data.job!.id}`);
            if (!r.ok) continue;
            const { job } = (await r.json()) as { job?: JobSnapshot };
            if (!job) continue;
            setLastResult(job);
            if (job.status === "completed" || job.status === "failed") break;
          }
        };
        void poll();
      }
    } finally {
      setSending(false);
    }
  };

  const targetMode = useMemo(() => getTargetMode(current), [current]);
  const readOnly = mode === "view";
  const dirty = useMemo(() => {
    if (mode === "view") return false;
    if (mode === "new") return true;
    const saved = packets.find((x) => x.name === savedName);
    if (!saved) return true;
    return JSON.stringify(saved) !== JSON.stringify(current);
  }, [current, packets, mode, savedName]);

  const setTargetMode = (next: TargetMode) => {
    if (next === "ref") {
      const firstRef = servers[0]?.id ?? "";
      setCurrent({ ...current, target: { server: { profile: firstRef } } });
    } else {
      setCurrent({
        ...current,
        target: {
          server: {
            host: "127.0.0.1",
            port: 3799,
            secret: "testing123",
            timeoutMs: 5000,
            retries: 1,
          },
        },
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CoA Sender</h1>
          <p className="mt-1 text-sm text-[color:var(--color-muted-foreground)]">
            Craft and send CoA-Request / Disconnect-Request packets as a RADIUS client.
            Profiles stored in{" "}
            <code className="rounded bg-[color:var(--color-muted)] px-1 py-0.5 font-mono text-[11px]">
              data/profiles/coa_sender.yaml
            </code>
            .
          </p>
        </div>
        <Badge tone="primary">{packets.length} profiles</Badge>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Left: packet list */}
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">Packet profiles</CardTitle>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => void load()} title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={onNew}>
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-1 overflow-auto pt-0">
            {loading ? (
              <div className="p-3 text-center text-xs text-[color:var(--color-muted-foreground)]">
                Loading…
              </div>
            ) : packets.length === 0 ? (
              <div className="rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-[11px] text-[color:var(--color-muted-foreground)]">
                No packet profiles yet. Click <span className="font-medium">New</span> to
                create one.
              </div>
            ) : (
              packets.map((p) => {
                const active = savedName === p.name && mode !== "new";
                return (
                  <button
                    key={p.name}
                    onClick={() => selectPacket(p.name)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                      active
                        ? "border-[color:var(--color-primary)]/50 bg-[color:var(--color-muted)]"
                        : "border-[color:var(--color-border)] hover:border-[color:var(--color-primary)]/30",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-medium">{p.name}</div>
                      <div className="mt-0.5 text-[10px] text-[color:var(--color-muted-foreground)]">
                        {p.attributes.length} attr · target{" "}
                        {"profile" in p.target.server ? "→ server profile" : "inline"}
                      </div>
                    </div>
                    <Badge tone={p.type === "Disconnect-Request" ? "failed" : "running"}>
                      {p.type === "Disconnect-Request" ? "Disc" : "CoA"}
                    </Badge>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Right: editor + send */}
        <div className="flex min-h-0 flex-col gap-4 overflow-auto">
          <Card
            className={cn(
              "transition-colors",
              mode === "new" && "border-emerald-500/40 bg-emerald-500/5",
            )}
          >
            <CardHeader className="flex-row items-center justify-between py-4">
              <div>
                <CardTitle className="text-sm">
                  {mode === "new"
                    ? "New packet profile"
                    : mode === "view"
                      ? savedName
                      : `Edit — ${savedName}`}
                </CardTitle>
                <p className="mt-0.5 font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
                  data/profiles/coa_sender.yaml · {current.name || "<name>"}
                </p>
              </div>
              <div className="flex gap-1">
                {mode === "view" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onEnterEdit}
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {(mode === "view" || mode === "edit") && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={onDuplicate}
                      title="Duplicate"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void onDelete()}
                      title="Delete"
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
                  id="packet-name"
                  label="Profile name"
                  required
                  value={current.name}
                  disabled={mode !== "new"}
                  placeholder="e.g. kick-azdolinski"
                  hint={
                    mode !== "new"
                      ? "Name is immutable (delete and create new to rename)."
                      : "Alphanumeric, dot, dash, underscore only"
                  }
                  onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                  error={errors["name"]}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="packet-type">Packet type</Label>
                  <select
                    id="packet-type"
                    className="flex h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    value={current.type}
                    disabled={readOnly}
                    onChange={(e) =>
                      setCurrent({ ...current, type: e.target.value as CoAPacketType })
                    }
                  >
                    <option value="Disconnect-Request">Disconnect-Request (code 40)</option>
                    <option value="CoA-Request">CoA-Request (code 43)</option>
                  </select>
                </div>
              </Section>

              <Section title="Target" subtitle="Where to send the packet">
                <div className="flex gap-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 p-1">
                  {(["ref", "inline"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTargetMode(m)}
                      disabled={readOnly}
                      className={cn(
                        "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        targetMode === m
                          ? "bg-[color:var(--color-background)] shadow-sm"
                          : "text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]",
                      )}
                    >
                      {m === "ref" ? "Server profile" : "Inline"}
                    </button>
                  ))}
                </div>

                {targetMode === "ref" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="server-ref">Server profile</Label>
                    <select
                      id="server-ref"
                      className="flex h-9 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      value={
                        "profile" in current.target.server ? current.target.server.profile : ""
                      }
                      disabled={readOnly}
                      onChange={(e) =>
                        setCurrent({
                          ...current,
                          target: { server: { profile: e.target.value } },
                        })
                      }
                    >
                      <option value="">— select server —</option>
                      {servers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.host}:{s.coaPort})
                        </option>
                      ))}
                    </select>
                    {errors["target.server.profile"] && (
                      <p className="text-[11px] text-red-500">
                        {errors["target.server.profile"]}
                      </p>
                    )}
                    <p className="text-[10px] text-[color:var(--color-muted-foreground)]">
                      Uses <code className="font-mono">coaPort</code> from the server
                      profile. Rename-safe (reference is by UUID).
                    </p>
                  </div>
                ) : "host" in current.target.server ? (
                  <div className="space-y-3">
                    <Field
                      id="target-host"
                      label="Host"
                      required
                      value={current.target.server.host}
                      disabled={readOnly}
                      onChange={(e) =>
                        setCurrent({
                          ...current,
                          target: {
                            server: { ...current.target.server, host: e.target.value },
                          } as typeof current.target,
                        })
                      }
                      error={errors["target.server.host"]}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        id="target-port"
                        label="Port"
                        type="number"
                        min={1}
                        max={65535}
                        value={current.target.server.port}
                        disabled={readOnly}
                        onChange={(e) =>
                          setCurrent({
                            ...current,
                            target: {
                              server: {
                                ...current.target.server,
                                port: Number(e.target.value) || 0,
                              },
                            } as typeof current.target,
                          })
                        }
                        error={errors["target.server.port"]}
                      />
                      <Field
                        id="target-secret"
                        label="Shared secret"
                        required
                        value={current.target.server.secret}
                        disabled={readOnly}
                        onChange={(e) =>
                          setCurrent({
                            ...current,
                            target: {
                              server: { ...current.target.server, secret: e.target.value },
                            } as typeof current.target,
                          })
                        }
                        error={errors["target.server.secret"]}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        id="target-timeout"
                        label="Timeout"
                        type="number"
                        min={100}
                        max={60000}
                        suffix="ms"
                        value={current.target.server.timeoutMs}
                        disabled={readOnly}
                        onChange={(e) =>
                          setCurrent({
                            ...current,
                            target: {
                              server: {
                                ...current.target.server,
                                timeoutMs: Number(e.target.value) || 0,
                              },
                            } as typeof current.target,
                          })
                        }
                        error={errors["target.server.timeoutMs"]}
                      />
                      <Field
                        id="target-retries"
                        label="Retries"
                        type="number"
                        min={0}
                        max={10}
                        value={current.target.server.retries}
                        disabled={readOnly}
                        onChange={(e) =>
                          setCurrent({
                            ...current,
                            target: {
                              server: {
                                ...current.target.server,
                                retries: Number(e.target.value) || 0,
                              },
                            } as typeof current.target,
                          })
                        }
                        error={errors["target.server.retries"]}
                      />
                    </div>
                  </div>
                ) : null}
              </Section>

              <Section title="Attributes" subtitle="Sent in the request">
                <AttributesEditor
                  value={current.attributes}
                  onChange={(next) => setCurrent({ ...current, attributes: next })}
                  readOnly={readOnly}
                />
              </Section>

              <div className="flex items-center justify-between border-t border-[color:var(--color-border)] pt-4">
                <p className="text-[11px] text-[color:var(--color-muted-foreground)]">
                  {mode === "view"
                    ? "Saved"
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
                  {mode === "view" && (
                    <Button onClick={() => void onSend()} disabled={sending}>
                      <Send className="h-3.5 w-3.5" />
                      {sending ? "Sending…" : "Send"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {lastResult && <SendResultCard job={lastResult} />}
        </div>
      </div>
    </div>
  );
}

function SendResultCard({ job }: { job: JobSnapshot }) {
  const stats = job.stats as {
    replyCode?: string;
    latencyMs?: number;
    attempts?: number;
    target?: string;
  };
  const failed = job.status === "failed";

  return (
    <Card className={cn(failed && "border-red-500/40 bg-red-500/5")}>
      <CardHeader className="flex-row items-center justify-between py-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">Last send</CardTitle>
          <StatusBadge status={job.status} />
        </div>
        <Link
          href={`/jobs/${job.id}`}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 text-xs font-medium text-[color:var(--color-foreground)] hover:bg-[color:var(--color-muted)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View in job log
        </Link>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {failed && job.error ? (
          <div className="flex items-start gap-2 rounded-md bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {job.error}
          </div>
        ) : null}
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          <Stat label="Reply" value={stats.replyCode ?? "—"} />
          <Stat label="Latency" value={stats.latencyMs != null ? `${stats.latencyMs}ms` : "—"} />
          <Stat label="Attempts" value={stats.attempts ?? "—"} />
          <Stat label="Target" value={stats.target ?? "—"} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[color:var(--color-border)] p-2">
      <div className="text-[10px] text-[color:var(--color-muted-foreground)]">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-medium">{value}</div>
    </div>
  );
}
