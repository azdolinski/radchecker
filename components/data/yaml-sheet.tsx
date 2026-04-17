"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YamlEditor } from "@/components/tests/yaml-editor";

type Subdir = "profiles/client" | "profiles/servers" | "coa" | "tests";
export type SheetMode = { kind: Subdir; mode: "edit"; name: string } | { kind: Subdir; mode: "new" };

interface Props {
  state: SheetMode | null;
  onClose: () => void;
  onSaved: (savedName: string) => void;
}

const TITLE: Record<Subdir, string> = {
  "profiles/client": "Client profile",
  "profiles/servers": "Server config",
  coa: "CoA config",
  tests: "Test fixture",
};

const TEMPLATE: Record<Subdir, (name: string) => string> = {
  "profiles/servers": (name) => `name: ${name}
host: 127.0.0.1
authPort: 1812
acctPort: 1813
secret: testing123
timeoutMs: 5000
retries: 1
`,
  "profiles/client": (name) => `name: ${name}
user:
  username: ${name}
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
  coa: (name) => `name: ${name}
bind: 0.0.0.0
port: 3799
secret: testing123
policy: always-ack
`,
  tests: (name) => `test:
  name: "${name}"
radius:
  server:
    host: 127.0.0.1
    port: 1812
    secret: testing123
  request:
    User-Name: user1
  expect: Access-Accept
`,
};

export function YamlSheet({ state, onClose, onSaved }: Props) {
  const [content, setContent] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      setName(state.name);
      setLoading(true);
      fetch(`/api/data/file?path=${encodeURIComponent(`${state.kind}/${state.name}.yaml`)}`)
        .then((r) => r.json() as Promise<{ content?: string; error?: string }>)
        .then((data) => {
          if (data.content !== undefined) setContent(data.content);
          else toast.error(data.error ?? "Load failed");
        })
        .finally(() => setLoading(false));
    } else {
      setName("");
      setContent("");
    }
  }, [state]);

  if (!state) return null;

  const isNew = state.mode === "new";
  const title = `${isNew ? "New" : "Edit"} ${TITLE[state.kind]}`;

  const onSave = async () => {
    const rawName = name.trim();
    if (isNew && !/^[a-zA-Z0-9._-]+$/.test(rawName)) {
      toast.error("Name: use [a-zA-Z0-9._-] only, no extension");
      return;
    }
    if (isNew && !content.trim()) {
      toast.error("Content is empty");
      return;
    }
    setSaving(true);
    try {
      const relPath = `${state.kind}/${rawName}.yaml`;
      const finalContent = isNew && !content.trim() ? TEMPLATE[state.kind](rawName) : content;
      const res = await fetch(`/api/data/file?path=${encodeURIComponent(relPath)}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: finalContent }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? "Save failed");
        return;
      }
      toast.success(isNew ? `Created ${rawName}` : `Saved ${rawName}`);
      onSaved(rawName);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (isNew) return;
    if (!confirm(`Delete ${state.name}?`)) return;
    const relPath = `${state.kind}/${state.name}.yaml`;
    const res = await fetch(`/api/data/file?path=${encodeURIComponent(relPath)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success(`Deleted ${state.name}`);
    onSaved("");
  };

  const useTemplate = () => {
    setContent(TEMPLATE[state.kind](name || "new-entry"));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[85vh] w-[min(900px,95vw)] flex-col rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-[11px] text-[color:var(--color-muted-foreground)]">
              data/{state.kind}/{isNew ? `${name || "<name>"}.yaml` : `${state.name}.yaml`}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 border-b border-[color:var(--color-border)] px-5 py-3">
          {isNew ? (
            <div className="flex-1 space-y-1">
              <Label htmlFor="yaml-name">Name</Label>
              <Input
                id="yaml-name"
                placeholder="e.g. my-server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div className="flex-1 font-mono text-xs">{name}.yaml</div>
          )}
          {isNew && (
            <Button size="sm" variant="outline" onClick={useTemplate}>
              Insert template
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center text-xs text-[color:var(--color-muted-foreground)]">
              Loading…
            </div>
          ) : (
            <YamlEditor value={content} onChange={setContent} height="100%" />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[color:var(--color-border)] px-5 py-3">
          <div>
            {!isNew && (
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
