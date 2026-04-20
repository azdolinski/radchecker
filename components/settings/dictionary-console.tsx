"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Info, Pencil, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DictionaryReport {
  id: string;
  source: "rfc" | "vendor" | "user";
  isLocal: boolean;
  enabled: boolean;
  attributeCount: number;
  valueCount: number;
  vendors: string[];
  sizeBytes?: number;
  error?: { line?: number; message: string };
}

interface DictionaryFilePayload {
  id: string;
  source: "rfc" | "vendor" | "user";
  isLocal?: boolean;
  path: string;
  content: string;
  parsed?: {
    attributes: Array<{ name: string; code: number; type: string; vendor?: string; vendorId?: number }>;
    vendors: Array<{ name: string; id: number }>;
    valueCount: number;
  };
  error?: { line?: number; message: string };
}

interface ActivationPayload {
  builtin: DictionaryReport[];
  user: DictionaryReport[];
  enabled: string[];
  warnings: string[];
  revision: number;
}

export function DictionaryConsole() {
  const [data, setData] = useState<ActivationPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingLocal, setEditingLocal] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/dictionary");
    if (!res.ok) {
      toast.error(`Failed to load (${res.status})`);
      return;
    }
    setData((await res.json()) as ActivationPayload);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (id: string, on: boolean) => {
      if (!data) return;
      const next = on
        ? [...new Set([...data.enabled, id])]
        : data.enabled.filter((x) => x !== id);
      setBusy(true);
      try {
        const res = await fetch("/api/dictionary/enabled", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData((await res.json()) as ActivationPayload);
        toast.success(on ? `Enabled ${id}` : `Disabled ${id}`);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [data],
  );

  const rescan = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/dictionary/rescan", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ActivationPayload);
      toast.success("Rescanned data/dictionary/");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!data) {
    return <div className="text-xs text-[color:var(--color-muted-foreground)]">Loading…</div>;
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Disabling a built-in dictionary drops it from the picker, but the RADIUS encoder
          keeps all bundled dictionaries loaded until the next app restart.
        </span>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                User-supplied (auto-loaded from <code>data/dictionary/</code>)
              </CardTitle>
              <CardDescription>
                Everything under <code>data/dictionary/</code> is loaded on startup.
                Edit <code>dictionary.local</code> inline. Drop other{" "}
                <code>dictionary.*</code> files there via shell — they appear here after a
                rescan.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={rescan} disabled={busy}>
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
              Rescan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DictionaryTable
            rows={data.user}
            kind="user"
            busy={busy}
            onEditLocal={() => setEditingLocal(true)}
            onView={setViewingId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Built-in dictionaries
          </CardTitle>
          <CardDescription>
            Shipped with the app (RFC + common vendor VSAs). Tick one to contribute its
            attributes to the CoA Sender picker. FreeRADIUS format under <code>node_modules/radius/dictionaries/</code>{" "}
            and <code>lib/radius/vendor-dictionaries/</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DictionaryTable
            rows={data.builtin}
            kind="builtin"
            busy={busy}
            onToggle={toggle}
            onView={setViewingId}
          />
        </CardContent>
      </Card>

      {data.warnings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-xs font-mono">
              {data.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {editingLocal ? (
        <LocalDictEditor
          onClose={() => setEditingLocal(false)}
          onSaved={(next) => {
            setData(next);
            setEditingLocal(false);
          }}
        />
      ) : null}

      {viewingId ? (
        <DictionaryViewer id={viewingId} onClose={() => setViewingId(null)} />
      ) : null}
    </div>
  );
}

interface DictionaryViewerProps {
  id: string;
  onClose: () => void;
}

function DictionaryViewer({ id, onClose }: DictionaryViewerProps) {
  const [payload, setPayload] = useState<DictionaryFilePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setPayload(null);
    setErr(null);
    void (async () => {
      try {
        const res = await fetch(`/api/dictionary/file/${encodeURIComponent(id)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErr(body.error ?? `HTTP ${res.status}`);
          return;
        }
        setPayload((await res.json()) as DictionaryFilePayload);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[min(90vh,820px)] w-[min(900px,95vw)] flex-col rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] px-5 py-3">
          <div className="min-w-0 space-y-1">
            <h2 className="font-mono text-sm font-semibold">dictionary.{id}</h2>
            <p className="truncate font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
              {payload ? payload.path : "loading…"}
            </p>
            {payload?.parsed ? (
              <p className="text-[11px] text-[color:var(--color-muted-foreground)]">
                <b>{payload.parsed.attributes.length}</b> ATTRIBUTE ·{" "}
                <b>{payload.parsed.valueCount}</b> VALUE ·{" "}
                <b>{payload.parsed.vendors.length}</b> VENDOR
                {payload.parsed.vendors.length > 0 ? (
                  <>
                    {" ("}
                    {payload.parsed.vendors.map((v) => `${v.name}=${v.id}`).join(", ")}
                    {")"}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} title="Close (Esc)">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {err ? (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{err}</span>
            </div>
          ) : payload ? (
            <pre className="overflow-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/20 p-3 font-mono text-[11px] leading-5">
              {payload.content}
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[color:var(--color-muted-foreground)]">
              Loading…
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[color:var(--color-border)] px-5 py-3">
          <p className="text-[11px] text-[color:var(--color-muted-foreground)]">
            Read-only. Edit on disk and click Rescan to reload.
          </p>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DictionaryTableProps {
  rows: DictionaryReport[];
  kind: "builtin" | "user";
  busy: boolean;
  onToggle?: (id: string, on: boolean) => void | Promise<void>;
  onEditLocal?: () => void;
  onView?: (id: string) => void;
}

function DictionaryTable({ rows, kind, busy, onToggle, onEditLocal, onView }: DictionaryTableProps) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-[color:var(--color-muted-foreground)]">
        {kind === "user" ? "No user dictionaries on disk." : "No dictionaries available."}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase tracking-wide text-[color:var(--color-muted-foreground)]">
            <th className="px-4 py-2 text-left">
              {kind === "builtin" ? "Enabled" : "Source"}
            </th>
            <th className="px-4 py-2 text-left">ID</th>
            <th className="px-4 py-2 text-right">Attributes</th>
            <th className="px-4 py-2 text-right">Values</th>
            <th className="px-4 py-2 text-left">Vendors</th>
            <th className="px-4 py-2 text-right">Size</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-[color:var(--color-border)]/50 last:border-b-0 hover:bg-[color:var(--color-muted)]/20"
            >
              <td className="px-4 py-2">
                {kind === "builtin" ? (
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    disabled={busy}
                    onChange={(e) => onToggle?.(r.id, e.target.checked)}
                    className="h-4 w-4 cursor-pointer"
                  />
                ) : (
                  <Badge tone={r.isLocal ? "primary" : "neutral"}>
                    {r.isLocal ? "local" : "shell"}
                  </Badge>
                )}
              </td>
              <td className="px-4 py-2 font-mono">
                <button
                  type="button"
                  onClick={() => onView?.(r.id)}
                  className="text-left underline-offset-2 hover:text-[color:var(--color-primary)] hover:underline"
                >
                  dictionary.{r.id}
                </button>
                {r.error ? (
                  <span className="ml-2 text-amber-600 dark:text-amber-400" title={r.error.message}>
                    ⚠
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-2 text-right font-mono">{r.attributeCount}</td>
              <td className="px-4 py-2 text-right font-mono text-[color:var(--color-muted-foreground)]">
                {r.valueCount}
              </td>
              <td className="px-4 py-2 text-[color:var(--color-muted-foreground)]">
                {r.vendors.length === 0 ? "—" : r.vendors.join(", ")}
              </td>
              <td className="px-4 py-2 text-right text-[color:var(--color-muted-foreground)]">
                {r.sizeBytes !== undefined ? `${Math.ceil(r.sizeBytes / 1024)} KB` : "—"}
              </td>
              <td className="px-4 py-2 text-right">
                {kind === "user" && r.isLocal ? (
                  <Button size="sm" variant="ghost" onClick={onEditLocal}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                ) : kind === "user" ? (
                  <span className="text-[10px] text-[color:var(--color-muted-foreground)]">
                    read-only (edit on disk)
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LocalDictEditorProps {
  onClose: () => void;
  onSaved: (next: ActivationPayload) => void;
}

function LocalDictEditor({ onClose, onSaved }: LocalDictEditorProps) {
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ line?: number; message: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/dictionary/local");
      if (!res.ok) {
        toast.error(`Failed to load dictionary.local (${res.status})`);
        return;
      }
      const body = (await res.json()) as { content: string };
      setContent(body.content);
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const save = useCallback(async () => {
    if (content === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dictionary/local", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError({ line: body.line, message: body.message ?? body.error });
        toast.error(body.message ?? body.error ?? "Save failed");
        return;
      }
      const next = await fetch("/api/dictionary").then((r) => r.json());
      onSaved(next as ActivationPayload);
      toast.success("Saved dictionary.local");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [content, onSaved]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="flex h-[min(90vh,820px)] w-[min(900px,95vw)] flex-col rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border)] px-5 py-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Edit dictionary.local</h2>
            <p className="font-mono text-[11px] text-[color:var(--color-muted-foreground)]">
              data/dictionary/dictionary.local · FreeRADIUS syntax, parsed on save
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} disabled={saving} title="Close (Esc)">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <textarea
            value={content ?? ""}
            onChange={(e) => setContent(e.target.value)}
            placeholder={content === null ? "Loading…" : ""}
            disabled={content === null || saving}
            className="h-full min-h-[20rem] w-full resize-none rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[color:var(--color-ring)]"
          />
          {error ? (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {error.line !== undefined ? (
                  <>
                    <b>Line {error.line}:</b>{" "}
                  </>
                ) : null}
                {error.message}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-[color:var(--color-border)] px-5 py-3">
          <p className="text-[11px] text-[color:var(--color-muted-foreground)]">
            Errors point to the exact line. Saving reloads the attribute picker immediately.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={content === null || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
