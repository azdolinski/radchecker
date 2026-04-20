"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileUp,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Scope = "all" | "profiles" | "tests";
type Strategy = "replace" | "merge";

interface ImportReport {
  applied: string[];
  skipped: Array<{ path: string; reason: string }>;
  errors: Array<{ path: string; message: string }>;
}

export function BackupConsole() {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <ExportSection />
      <ImportSection />
    </div>
  );
}

function ExportSection() {
  const [scope, setScope] = useState<Scope>("all");
  const [busy, setBusy] = useState(false);

  const fetchBundle = useCallback(async (): Promise<string> => {
    const res = await fetch(`/api/data/backup/export?scope=${scope}`);
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`export failed (${res.status}): ${msg}`);
    }
    return await res.text();
  }, [scope]);

  const onDownload = useCallback(async () => {
    setBusy(true);
    try {
      const text = await fetchBundle();
      const blob = new Blob([text], { type: "application/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedFilename(scope);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${scope} backup`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [fetchBundle, scope]);

  const onCopy = useCallback(async () => {
    setBusy(true);
    try {
      const text = await fetchBundle();
      await navigator.clipboard.writeText(text);
      toast.success("Copied bundle to clipboard");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [fetchBundle]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export
        </CardTitle>
        <CardDescription>
          Dump user YAML files under <code>data/</code> as a single portable bundle. Runtime
          <code> jobs/</code> never included.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Label className="mb-2 block">Scope</Label>
          <RadioRow
            name="scope"
            value={scope}
            onChange={(v) => setScope(v as Scope)}
            options={[
              { value: "all", label: "All" },
              { value: "profiles", label: "Profiles" },
              { value: "tests", label: "Tests" },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onDownload} disabled={busy}>
            <Download className="h-4 w-4" />
            Download .yaml
          </Button>
          <Button variant="outline" onClick={onCopy} disabled={busy}>
            <Copy className="h-4 w-4" />
            Copy to clipboard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportSection() {
  const [text, setText] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("replace");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    const content = await file.text();
    setText(content);
    toast.success(`Loaded ${file.name}`);
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) await loadFile(file);
    },
    [loadFile],
  );

  const onImport = useCallback(async () => {
    if (!text.trim()) {
      toast.error("Nothing to import — paste YAML or pick a file first");
      return;
    }
    setBusy(true);
    setReport(null);
    try {
      const res = await fetch("/api/data/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle: text, strategy }),
      });
      const json = (await res.json()) as ImportReport | { error: string; message?: string };
      if (!res.ok) {
        const err = json as { error: string; message?: string };
        throw new Error(err.message ?? err.error);
      }
      setReport(json as ImportReport);
      const r = json as ImportReport;
      if (r.errors.length > 0) {
        toast.error(`Import finished with ${r.errors.length} error(s)`);
      } else {
        toast.success(
          `Imported ${r.applied.length} file(s)` +
            (r.skipped.length > 0 ? ` · skipped ${r.skipped.length}` : ""),
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [strategy, text]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Import
        </CardTitle>
        <CardDescription>
          Upload a bundle to restore or merge YAML files. Runtime <code>jobs/</code> is never
          touched.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors",
            dragOver
              ? "border-[color:var(--color-primary)] bg-[color:var(--color-muted)]/50"
              : "border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]/30",
          )}
        >
          <FileUp className="h-6 w-6 text-[color:var(--color-muted-foreground)]" />
          <div className="text-sm">Drop a .yaml file here or click to pick</div>
          <input
            ref={fileRef}
            type="file"
            accept=".yaml,.yml,application/yaml,text/yaml"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await loadFile(file);
              e.target.value = "";
            }}
          />
        </div>

        <div>
          <Label className="mb-2 block">Or paste YAML</Label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="version: 1&#10;scope: all&#10;files:&#10;  profiles/clients.yaml:&#10;    content: |&#10;      clients: []"
            rows={10}
            className="w-full resize-y rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[color:var(--color-ring)]"
          />
        </div>

        <div>
          <Label className="mb-2 block">Strategy</Label>
          <RadioRow
            name="strategy"
            value={strategy}
            onChange={(v) => setStrategy(v as Strategy)}
            options={[
              { value: "replace", label: "Replace" },
              { value: "merge", label: "Merge" },
            ]}
          />
          <p className="mt-2 flex items-start gap-1.5 text-xs text-[color:var(--color-muted-foreground)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <b>Replace</b> overwrites each file in the bundle. <b>Merge</b> keeps existing
              collection items (by <code>id</code>) and single-fixture files, only adding what
              is missing.
            </span>
          </p>
        </div>

        <div>
          <Button onClick={onImport} disabled={busy}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
        </div>

        {report ? <ReportPanel report={report} /> : null}
      </CardContent>
    </Card>
  );
}

interface RadioRowProps {
  name: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}

function RadioRow({ name, value, onChange, options }: RadioRowProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <label
            key={opt.value}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-foreground)]"
                : "border-[color:var(--color-border)] text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]/30",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

function ReportPanel({ report }: { report: ImportReport }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/20 p-4 text-xs">
      <ReportSection
        icon={<CheckCircle2 className="h-4 w-4 text-green-500" />}
        label={`Applied (${report.applied.length})`}
        items={report.applied.map((p) => ({ path: p }))}
        empty="none"
      />
      <ReportSection
        icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
        label={`Skipped (${report.skipped.length})`}
        items={report.skipped.map((s) => ({ path: s.path, detail: s.reason }))}
        empty="none"
      />
      <ReportSection
        icon={<XCircle className="h-4 w-4 text-red-500" />}
        label={`Errors (${report.errors.length})`}
        items={report.errors.map((e) => ({ path: e.path, detail: e.message }))}
        empty="none"
      />
    </div>
  );
}

function ReportSection({
  icon,
  label,
  items,
  empty,
}: {
  icon: React.ReactNode;
  label: string;
  items: Array<{ path: string; detail?: string }>;
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 font-medium">
        {icon}
        {label}
      </div>
      {items.length === 0 ? (
        <div className="pl-5 text-[color:var(--color-muted-foreground)]">{empty}</div>
      ) : (
        <ul className="flex flex-col gap-0.5 pl-5">
          {items.map((item, i) => (
            <li key={`${item.path}-${i}`} className="font-mono">
              {item.path}
              {item.detail ? (
                <span className="text-[color:var(--color-muted-foreground)]"> — {item.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function suggestedFilename(scope: Scope): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  return `radchecker-backup-${scope}-${stamp}.yaml`;
}
