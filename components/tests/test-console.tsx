"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Play, Save, Search, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/jobs/status-badge";
import { YamlEditor } from "@/components/tests/yaml-editor";
import { useJobLogs } from "@/hooks/useJobLogs";
import { cn } from "@/lib/utils";

type TestSummary = {
  name: string;
  title: string;
  description?: string;
  expect: string;
};

type RunResult = {
  name: string;
  pass: boolean;
  expected: string;
  actual?: string;
  durationMs: number;
  error?: string;
  attrFailures: number;
};

type RunStats = {
  total?: number;
  passed?: number;
  failed?: number;
  ran?: number;
  results?: RunResult[];
};

export function TestConsole() {
  const [tests, setTests] = useState<TestSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [yaml, setYaml] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [checkedRun, setCheckedRun] = useState<Set<string>>(new Set());

  const live = useJobLogs(jobId);
  const runStats: RunStats = (live.stats ?? {}) as RunStats;

  const loadTests = useCallback(async () => {
    const res = await fetch("/api/tests");
    const { tests } = (await res.json()) as { tests: TestSummary[] };
    setTests(tests);
    if (!selected && tests.length) setSelected(tests[0].name);
  }, [selected]);

  useEffect(() => {
    void loadTests();
  }, [loadTests]);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/tests/${selected}`)
      .then((r) => r.json())
      .then(({ yaml }: { yaml?: string }) => {
        setYaml(yaml ?? "");
        setDirty(false);
      });
  }, [selected]);

  const visibleTests = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false),
    );
  }, [tests, filter]);

  const resultsByName = useMemo(() => {
    const map = new Map<string, RunResult>();
    runStats.results?.forEach((r) => map.set(r.name, r));
    return map;
  }, [runStats.results]);

  const onSave = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tests/${selected}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ yaml }),
      });
      if (!res.ok) {
        toast.error("Save failed");
        return;
      }
      toast.success("Saved");
      setDirty(false);
      void loadTests();
    } finally {
      setSaving(false);
    }
  }, [selected, yaml, loadTests]);

  const onRun = useCallback(
    async (mode: "single" | "selected" | "all") => {
      const body: { names?: string[]; all?: boolean } = {};
      if (mode === "all") body.all = true;
      else if (mode === "single" && selected) body.names = [selected];
      else if (mode === "selected") body.names = [...checkedRun];
      if (!body.all && (!body.names || body.names.length === 0)) {
        toast.error("Select at least one test");
        return;
      }
      const res = await fetch("/api/tests/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { job?: { id: string }; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Run failed");
        return;
      }
      if (data.job?.id) {
        setJobId(data.job.id);
        toast.success("Running…");
      }
    },
    [selected, checkedRun],
  );

  const toggleChecked = (name: string) => {
    setCheckedRun((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[300px_minmax(0,1fr)] gap-4">
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="gap-2 py-3">
          <CardTitle className="flex items-center justify-between">
            <span>Tests</span>
            <Badge tone="neutral">{tests.length}</Badge>
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--color-muted-foreground)]" />
            <Input
              className="pl-7"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or description"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-1 pt-0">
          {visibleTests.map((t) => {
            const result = resultsByName.get(t.name);
            const isActive = selected === t.name;
            return (
              <button
                key={t.name}
                onClick={() => setSelected(t.name)}
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left transition-colors",
                  isActive
                    ? "bg-[color:var(--color-muted)]"
                    : "hover:bg-[color:var(--color-muted)]/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-[color:var(--color-primary)]"
                    checked={checkedRun.has(t.name)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleChecked(t.name);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="truncate text-xs font-medium">{t.name}</span>
                  {result ? (
                    result.pass ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    )
                  ) : null}
                </div>
                <div className="mt-1 line-clamp-2 pl-6 text-[11px] text-[color:var(--color-muted-foreground)]">
                  {t.title}
                </div>
              </button>
            );
          })}
          {visibleTests.length === 0 ? (
            <div className="p-4 text-center text-xs text-[color:var(--color-muted-foreground)]">
              No tests match the filter.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="text-xs text-[color:var(--color-muted-foreground)]">Selected</div>
            <div className="font-mono text-sm">{selected ?? "—"}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onRun("all")}>
            <Play className="h-3.5 w-3.5" />
            Run all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRun("selected")}
            disabled={checkedRun.size === 0}
          >
            <Play className="h-3.5 w-3.5" />
            Run {checkedRun.size || 0} selected
          </Button>
          <Button size="sm" onClick={() => onRun("single")} disabled={!selected}>
            <Play className="h-3.5 w-3.5" />
            Run this
          </Button>
          <Button variant="outline" size="sm" onClick={onSave} disabled={!dirty || saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-3">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="py-2">
              <CardTitle className="text-xs">YAML editor</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <YamlEditor
                value={yaml}
                onChange={(v) => {
                  setYaml(v);
                  setDirty(true);
                }}
                height="100%"
              />
            </CardContent>
          </Card>

          <Card className="flex min-h-0 flex-col">
            <CardHeader className="py-2">
              <CardTitle className="flex items-center justify-between text-xs">
                <span>Last run</span>
                {jobId ? <StatusBadge status={live.status} /> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-2 overflow-auto pt-0">
              {jobId ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Kpi label="Ran" value={`${runStats.ran ?? 0}/${runStats.total ?? 0}`} />
                    <Kpi label="Passed" value={runStats.passed ?? 0} tone="emerald" />
                    <Kpi label="Failed" value={runStats.failed ?? 0} tone="red" />
                  </div>
                  <div className="space-y-1">
                    {(runStats.results ?? []).map((r) => (
                      <div
                        key={r.name}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]",
                          r.pass
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-red-500/30 bg-red-500/5",
                        )}
                      >
                        {r.pass ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        <span className="font-mono">{r.name}</span>
                        <span className="ml-auto text-[color:var(--color-muted-foreground)]">
                          {r.actual ?? r.error ?? "—"}
                        </span>
                        <span className="font-mono text-[10px] text-[color:var(--color-muted-foreground)]">
                          {r.durationMs}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-center text-xs text-[color:var(--color-muted-foreground)]">
                  <div className="max-w-[200px] space-y-1">
                    <CircleAlert className="mx-auto h-5 w-5 opacity-40" />
                    <div>
                      Run a single test, selected list, or all to see results here.
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "red";
}) {
  return (
    <div className="rounded-md border border-[color:var(--color-border)] p-2">
      <div className="text-[10px] text-[color:var(--color-muted-foreground)]">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-base font-semibold",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "red" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}
