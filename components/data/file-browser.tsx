"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { YamlEditor } from "@/components/tests/yaml-editor";
import { cn } from "@/lib/utils";

type Subdir = "profiles/client" | "profiles/servers" | "coa" | "tests";

type FileEntry = { name: string; path: string; size: number; modified: number };
type TreeNode = { subdir: Subdir; files: FileEntry[] };

const SUBDIR_LABEL: Record<Subdir, string> = {
  "profiles/client": "Client profiles",
  "profiles/servers": "Server configs",
  coa: "CoA configs",
  tests: "Tests",
};

const SUBDIR_HINT: Record<Subdir, string> = {
  "profiles/client": "User + NAS + session params for the emulator",
  "profiles/servers": "RADIUS targets: host, ports, shared secret",
  coa: "CoA server simulator configurations",
  tests: "YAML test fixtures (compatible with tmp/tests/data/)",
};

const DEFAULT_TEMPLATE: Record<Subdir, string> = {
  "profiles/servers": `name: REPLACE_ME
host: 127.0.0.1
authPort: 1812
acctPort: 1813
secret: testing123
timeoutMs: 5000
retries: 1
`,
  "profiles/client": `name: REPLACE_ME
user:
  username: user1
  password: secret
  authType: pap
nas:
  ip: 10.0.0.1
  portId: eth0
  portType: Ethernet
session:
  framedIp: 10.0.0.100
  serviceType: Framed-User
  framedProtocol: PPP
  acctAuthentic: RADIUS
  durationSeconds: 60
  interimIntervalSeconds: 10
traffic:
  inputBytesPerInterval: [100000, 500000]
  outputBytesPerInterval: [1000000, 5000000]
`,
  coa: `name: REPLACE_ME
bind: 0.0.0.0
port: 3799
secret: testing123
policy: always-ack
`,
  tests: `test:
  name: "REPLACE_ME"
  description: ""
radius:
  server:
    host: 127.0.0.1
    port: 1812
    secret: testing123
  request:
    User-Name: user1
    NAS-IP-Address: 10.0.0.1
  reply:
    Message-Authenticator: any
  expect: Access-Accept
`,
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function fmtModified(ms: number) {
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ms).toLocaleDateString();
}

export function FileBrowser() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<Subdir, boolean>>({
    "profiles/client": true,
    "profiles/servers": true,
    coa: true,
    tests: true,
  });
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [saved, setSaved] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [newFor, setNewFor] = useState<Subdir | null>(null);
  const [newName, setNewName] = useState("");

  const loadTree = useCallback(async () => {
    const res = await fetch("/api/data/tree");
    if (!res.ok) return;
    const data = (await res.json()) as { tree: TreeNode[] };
    setTree(data.tree);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const loadFile = useCallback(async (relPath: string) => {
    const res = await fetch(`/api/data/file?path=${encodeURIComponent(relPath)}`);
    if (!res.ok) {
      toast.error(`Load failed: ${res.status}`);
      return;
    }
    const data = (await res.json()) as { content?: string };
    setContent(data.content ?? "");
    setSaved(data.content ?? "");
    setSelected(relPath);
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return tree;
    const q = filter.toLowerCase();
    return tree.map((node) => ({
      ...node,
      files: node.files.filter(
        (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q),
      ),
    }));
  }, [tree, filter]);

  const onSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/data/file?path=${encodeURIComponent(selected)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        toast.error(data.message ?? data.error ?? "Save failed");
        return;
      }
      setSaved(content);
      toast.success(`Saved ${selected}`);
      void loadTree();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    if (!confirm(`Delete ${selected}?`)) return;
    const res = await fetch(`/api/data/file?path=${encodeURIComponent(selected)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success(`Deleted ${selected}`);
    setSelected(null);
    setContent("");
    setSaved("");
    void loadTree();
  };

  const onCreate = async () => {
    if (!newFor || !newName.trim()) return;
    const filename = newName.endsWith(".yaml") ? newName : `${newName}.yaml`;
    if (!/^[a-zA-Z0-9._-]+\.yaml$/.test(filename)) {
      toast.error("Invalid name — use [a-zA-Z0-9._-]");
      return;
    }
    const relPath = `${newFor}/${filename}`;
    const template = DEFAULT_TEMPLATE[newFor].replace(
      "REPLACE_ME",
      filename.replace(/\.yaml$/, ""),
    );
    const res = await fetch(`/api/data/file?path=${encodeURIComponent(relPath)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: template }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) {
      toast.error(data.message ?? data.error ?? "Create failed");
      return;
    }
    toast.success(`Created ${relPath}`);
    setNewFor(null);
    setNewName("");
    await loadTree();
    await loadFile(relPath);
  };

  const dirty = content !== saved;

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-4">
      {/* Sidebar */}
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="gap-2 py-3">
          <CardTitle className="flex items-center justify-between">
            <span>data/</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void loadTree()}
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--color-muted-foreground)]" />
            <Input
              className="pl-7"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files"
            />
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-1 pt-0">
          {loading ? (
            <div className="p-3 text-xs text-[color:var(--color-muted-foreground)]">
              Loading…
            </div>
          ) : (
            filtered.map((node) => (
              <div key={node.subdir} className="mb-1">
                <button
                  onClick={() =>
                    setOpen((prev) => ({ ...prev, [node.subdir]: !prev[node.subdir] }))
                  }
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-[color:var(--color-muted)]"
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 transition-transform",
                      open[node.subdir] && "rotate-90",
                    )}
                  />
                  {open[node.subdir] ? (
                    <FolderOpen className="h-3.5 w-3.5 text-[color:var(--color-primary)]" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 text-[color:var(--color-muted-foreground)]" />
                  )}
                  <span className="flex-1 text-left">{SUBDIR_LABEL[node.subdir]}</span>
                  <span className="text-[10px] text-[color:var(--color-muted-foreground)]">
                    {node.files.length}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewFor(node.subdir);
                      setNewName("");
                    }}
                    className="rounded p-0.5 hover:bg-[color:var(--color-background)]"
                    title="New file"
                    role="button"
                    tabIndex={0}
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                  </span>
                </button>

                {open[node.subdir] && (
                  <>
                    {newFor === node.subdir && (
                      <div className="mx-2 mb-1 flex items-center gap-1">
                        <Input
                          className="h-7 text-xs"
                          placeholder="name.yaml"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void onCreate();
                            if (e.key === "Escape") {
                              setNewFor(null);
                              setNewName("");
                            }
                          }}
                          autoFocus
                        />
                        <Button size="sm" onClick={() => void onCreate()}>
                          Add
                        </Button>
                      </div>
                    )}
                    <div className="ml-3 border-l border-[color:var(--color-border)]/50 pl-1">
                      {node.files.map((f) => {
                        const active = selected === f.path;
                        return (
                          <button
                            key={f.path}
                            onClick={() => void loadFile(f.path)}
                            className={cn(
                              "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors",
                              active
                                ? "bg-[color:var(--color-muted)] text-[color:var(--color-foreground)]"
                                : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]/50",
                            )}
                          >
                            <FileCode className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1 truncate font-mono">{f.name}</span>
                            <span className="text-[9px] opacity-60">{fmtBytes(f.size)}</span>
                          </button>
                        );
                      })}
                      {node.files.length === 0 && newFor !== node.subdir && (
                        <div className="px-2 py-1 text-[10px] italic text-[color:var(--color-muted-foreground)]">
                          empty — {SUBDIR_HINT[node.subdir]}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="flex-row items-center justify-between py-2.5">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-[color:var(--color-primary)]" />
            <CardTitle className="font-mono text-xs">
              {selected ?? "— select a file —"}
            </CardTitle>
            {dirty && selected ? (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                unsaved
              </span>
            ) : null}
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              disabled={!selected}
              title="Delete file"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button size="sm" onClick={onSave} disabled={!selected || !dirty || saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          {selected ? (
            <YamlEditor value={content} onChange={setContent} height="100%" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-[color:var(--color-muted-foreground)]">
              <FileCode className="h-8 w-8 opacity-30" />
              <div className="max-w-xs">
                Pick a file on the left or create a new one (
                <FilePlus className="inline h-3 w-3" />). Changes are written directly to disk under{" "}
                <code className="font-mono">data/</code>.
              </div>
            </div>
          )}
        </CardContent>
        {selected && (
          <div className="border-t border-[color:var(--color-border)] px-4 py-1.5 text-[10px] text-[color:var(--color-muted-foreground)]">
            {(() => {
              const f = tree.flatMap((n) => n.files).find((x) => x.path === selected);
              if (!f) return null;
              return `${fmtBytes(f.size)} · modified ${fmtModified(f.modified)}`;
            })()}
          </div>
        )}
      </Card>
    </div>
  );
}
