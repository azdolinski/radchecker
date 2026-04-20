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

type DirEntry = { type: "dir"; name: string; path: string; children: TreeEntry[] };
type FileEntry = {
  type: "file";
  name: string;
  path: string;
  size: number;
  modified: number;
};
type TreeEntry = DirEntry | FileEntry;

const DEFAULT_TEMPLATES: Record<string, string> = {
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

function templateFor(dirPath: string, basename: string): string {
  const tpl = DEFAULT_TEMPLATES[dirPath] ?? "";
  return tpl.replace("REPLACE_ME", basename);
}

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

function countFiles(node: TreeEntry): number {
  if (node.type === "file") return 1;
  return node.children.reduce((sum, c) => sum + countFiles(c), 0);
}

function flattenFiles(nodes: TreeEntry[]): FileEntry[] {
  const out: FileEntry[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push(n);
    else out.push(...flattenFiles(n.children));
  }
  return out;
}

function collectDirPaths(nodes: TreeEntry[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === "dir") {
      out.push(n.path);
      collectDirPaths(n.children, out);
    }
  }
  return out;
}

function pruneTree(nodes: TreeEntry[], q: string): TreeEntry[] {
  const result: TreeEntry[] = [];
  for (const n of nodes) {
    if (n.type === "file") {
      if (n.path.toLowerCase().includes(q)) result.push(n);
      continue;
    }
    if (n.path.toLowerCase().includes(q)) {
      result.push(n);
      continue;
    }
    const children = pruneTree(n.children, q);
    if (children.length > 0) {
      result.push({ ...n, children });
    }
  }
  return result;
}

export function FileBrowser() {
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [saved, setSaved] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [newFor, setNewFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const loadTree = useCallback(async () => {
    const res = await fetch("/api/data/tree");
    if (!res.ok) return;
    const data = (await res.json()) as { tree: TreeEntry[] };
    setTree(data.tree);
    setOpen((prev) => {
      const next = { ...prev };
      for (const dirPath of collectDirPaths(data.tree)) {
        if (next[dirPath] === undefined) next[dirPath] = true;
      }
      return next;
    });
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
    const q = filter.trim().toLowerCase();
    if (!q) return tree;
    return pruneTree(tree, q);
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
    const trimmed = newName.trim();
    const inDictionaryDir = newFor === "dictionary";
    // Dictionary files use FreeRADIUS naming `dictionary.<stem>` — no .yaml extension.
    let filename: string;
    if (inDictionaryDir) {
      filename = trimmed.startsWith("dictionary.") ? trimmed : `dictionary.${trimmed}`;
      if (!/^dictionary\.[A-Za-z0-9_.-]+$/.test(filename)) {
        toast.error("Invalid name — use dictionary.<stem> with [a-zA-Z0-9._-] only");
        return;
      }
    } else {
      filename = trimmed.endsWith(".yaml") ? trimmed : `${trimmed}.yaml`;
      if (!/^[a-zA-Z0-9._-]+\.yaml$/.test(filename)) {
        toast.error("Invalid name — use [a-zA-Z0-9._-]");
        return;
      }
    }
    const relPath = `${newFor}/${filename}`;
    const basename = filename.replace(/\.yaml$/, "");
    const template = inDictionaryDir ? "" : templateFor(newFor, basename);
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

  const selectedMeta = useMemo(() => {
    if (!selected) return null;
    return flattenFiles(tree).find((x) => x.path === selected) ?? null;
  }, [tree, selected]);

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
          ) : filtered.length === 0 ? (
            <div className="p-3 text-xs italic text-[color:var(--color-muted-foreground)]">
              {filter.trim() ? "No matches." : "empty"}
            </div>
          ) : (
            <TreeView
              nodes={filtered}
              depth={0}
              open={open}
              onToggle={(p) => setOpen((prev) => ({ ...prev, [p]: !(prev[p] ?? true) }))}
              selected={selected}
              onSelect={(p) => void loadFile(p)}
              newFor={newFor}
              newName={newName}
              onStartNew={(p) => {
                setNewFor(p);
                setNewName("");
                setOpen((prev) => ({ ...prev, [p]: true }));
              }}
              onCancelNew={() => {
                setNewFor(null);
                setNewName("");
              }}
              onChangeNewName={setNewName}
              onSubmitNew={() => void onCreate()}
            />
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
            <YamlEditor
              value={content}
              onChange={setContent}
              height="100%"
              language={selected.endsWith(".yaml") ? "yaml" : "plaintext"}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-[color:var(--color-muted-foreground)]">
              <FileCode className="h-8 w-8 opacity-30" />
              <div className="max-w-xs">
                Pick a file on the left or create a new one (
                <FilePlus className="inline h-3 w-3" />
                ). Changes are written directly to disk under{" "}
                <code className="font-mono">data/</code>.
              </div>
            </div>
          )}
        </CardContent>
        {selectedMeta && (
          <div className="border-t border-[color:var(--color-border)] px-4 py-1.5 text-[10px] text-[color:var(--color-muted-foreground)]">
            {fmtBytes(selectedMeta.size)} · modified {fmtModified(selectedMeta.modified)}
          </div>
        )}
      </Card>
    </div>
  );
}

type TreeViewProps = {
  nodes: TreeEntry[];
  depth: number;
  open: Record<string, boolean>;
  onToggle: (path: string) => void;
  selected: string | null;
  onSelect: (path: string) => void;
  newFor: string | null;
  newName: string;
  onStartNew: (dirPath: string) => void;
  onCancelNew: () => void;
  onChangeNewName: (name: string) => void;
  onSubmitNew: () => void;
};

function TreeView(props: TreeViewProps) {
  const {
    nodes,
    depth,
    open,
    onToggle,
    selected,
    onSelect,
    newFor,
    newName,
    onStartNew,
    onCancelNew,
    onChangeNewName,
    onSubmitNew,
  } = props;

  return (
    <>
      {nodes.map((node) => {
        if (node.type === "dir") {
          const isOpen = open[node.path] ?? true;
          return (
            <div key={node.path}>
              <div
                onClick={() => onToggle(node.path)}
                className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-[color:var(--color-muted)]"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle(node.path);
                  }
                }}
              >
                <ChevronRight
                  className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
                />
                {isOpen ? (
                  <FolderOpen className="h-3.5 w-3.5 text-[color:var(--color-primary)]" />
                ) : (
                  <Folder className="h-3.5 w-3.5 text-[color:var(--color-muted-foreground)]" />
                )}
                <span className="flex-1 truncate text-left">{node.name}/</span>
                <span className="text-[10px] text-[color:var(--color-muted-foreground)]">
                  {countFiles(node)}
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartNew(node.path);
                  }}
                  className="rounded p-0.5 hover:bg-[color:var(--color-background)]"
                  title={`New file in ${node.path}/`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onStartNew(node.path);
                    }
                  }}
                >
                  <FilePlus className="h-3.5 w-3.5" />
                </span>
              </div>

              {isOpen && (
                <div className="ml-3 border-l border-[color:var(--color-border)]/50 pl-1">
                  {newFor === node.path && (
                    <div className="mx-2 mb-1 flex items-center gap-1">
                      <Input
                        className="h-7 text-xs"
                        placeholder="name.yaml"
                        value={newName}
                        onChange={(e) => onChangeNewName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onSubmitNew();
                          if (e.key === "Escape") onCancelNew();
                        }}
                        autoFocus
                      />
                      <Button size="sm" onClick={onSubmitNew}>
                        Add
                      </Button>
                    </div>
                  )}
                  {node.children.length === 0 && newFor !== node.path ? (
                    <div className="px-2 py-1 text-[10px] italic text-[color:var(--color-muted-foreground)]">
                      empty
                    </div>
                  ) : (
                    <TreeView {...props} nodes={node.children} depth={depth + 1} />
                  )}
                </div>
              )}
            </div>
          );
        }

        const active = selected === node.path;
        return (
          <button
            key={node.path}
            onClick={() => onSelect(node.path)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors",
              active
                ? "bg-[color:var(--color-muted)] text-[color:var(--color-foreground)]"
                : "text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-muted)]/50",
            )}
          >
            <FileCode className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate font-mono">{node.name}</span>
            <span className="text-[9px] opacity-60">{fmtBytes(node.size)}</span>
          </button>
        );
      })}
    </>
  );
}
